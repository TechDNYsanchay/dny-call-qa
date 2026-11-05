"use server";

// Booking and cancelling sales meetings. Anyone on the team list can book; the meeting is created
// on the recording account's calendar, so tl;dv records it and the result reaches Sales QA.

import { refresh } from "next/cache";
import { calendarEvent, meetingLinkMessage, parseBookingForm, whenText, type FieldErrors, type Guest } from "@/lib/booking";
import { getCurrentPerson } from "@/lib/data";
import { cancelMeeting, createMeeting, GoogleNotReady } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabase/server";
import { whatsappLink } from "@/lib/whatsapp";

export interface BookState {
  errors?: FieldErrors;
  /** What was typed, so a form with an error keeps it. */
  values?: Record<string, string>;
  done?: { clientName: string; when: string; meetUrl: string; message: string; whatsapp: string | null };
}

export async function bookMeeting(_prev: BookState, form: FormData): Promise<BookState> {
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const fail = (errors: FieldErrors): BookState => ({ errors, values });
  const me = await getCurrentPerson();
  if (!me) return fail({ form: "Sign in again to book." });
  const parsed = parseBookingForm(values, Date.now());
  if (!parsed.ok) return fail(parsed.errors);
  const b = parsed.value;

  const db = supabaseAdmin();
  const { data: host, error: hostError } = await db.from("people").select("id, full_name, email, active").eq("id", b.consultantId).maybeSingle();
  if (hostError) return fail({ form: `Couldn't check who takes the meeting: ${hostError.message}` });
  if (!host?.active || !host.email) return fail({ consultantId: "Pick someone on the team list with an email" });

  // Tie it to the lead when there is one: the one booked from, else the client's email or phone.
  let leadId = b.leadId;
  if (!leadId) {
    const match = [`email.eq.${b.clientEmail}`, ...(b.clientPhone ? [`phone.eq.${b.clientPhone}`] : [])].join(",");
    const { data: leads } = await db.from("leads").select("id").or(match).limit(1);
    leadId = leads?.[0]?.id ?? null;
  }

  const { data: booking, error: bookingError } = await db
    .from("meeting_bookings")
    .insert({
      lead_id: leadId,
      client_name: b.clientName,
      client_email: b.clientEmail,
      client_phone: b.clientPhone,
      starts_at: b.startsAt,
      duration_min: b.durationMin,
      notes: b.notes,
      consultant_id: host.id,
      booked_by: me.id,
    })
    .select("id")
    .single();
  if (bookingError) return fail({ form: `Couldn't save the booking: ${bookingError.message}` });

  const guests: Guest[] = [
    { email: b.clientEmail, name: b.clientName },
    { email: host.email, name: host.full_name },
    ...(b.addMe && me.email ? [{ email: me.email, name: me.name }] : []),
  ];
  try {
    const meeting = await createMeeting(calendarEvent({ bookingId: booking.id, clientName: b.clientName, startsAt: b.startsAt, durationMin: b.durationMin, guests, notes: b.notes }));
    const { error } = await db
      .from("meeting_bookings")
      .update({ calendar_event_id: meeting.eventId, meet_url: meeting.meetUrl, meet_code: meeting.meetCode })
      .eq("id", booking.id);
    if (error) return { errors: { form: `The invite went out, but the booking couldn't be updated: ${error.message}` } };
    const message = meetingLinkMessage(b.clientName, b.startsAt, meeting.meetUrl);
    return { done: { clientName: b.clientName, when: whenText(b.startsAt), meetUrl: meeting.meetUrl, message, whatsapp: whatsappLink(b.clientPhone, message) } };
  } catch (error) {
    // No invite went out, so nothing is kept.
    await db.from("meeting_bookings").delete().eq("id", booking.id);
    const reason = error instanceof Error ? error.message : String(error);
    return fail({ form: error instanceof GoogleNotReady ? reason : `Couldn't create the meeting: ${reason}` });
  }
}

export async function cancelBooking(id: string): Promise<{ error?: string }> {
  const me = await getCurrentPerson();
  if (!me) return { error: "Sign in again to do this." };
  const db = supabaseAdmin();
  const { data: booking, error } = await db.from("meeting_bookings").select("id, booked_by, consultant_id, calendar_event_id, status").eq("id", id).maybeSingle();
  if (error) return { error: `Couldn't load the meeting: ${error.message}` };
  if (!booking || booking.status === "cancelled") return { error: "This meeting is already cancelled; refresh the page." };
  if (!me.canSeeAll && booking.booked_by !== me.id && booking.consultant_id !== me.id) return { error: "Only whoever booked or takes the meeting can cancel it." };
  try {
    if (booking.calendar_event_id) await cancelMeeting(booking.calendar_event_id);
  } catch (cancelError) {
    return { error: cancelError instanceof Error ? cancelError.message : String(cancelError) };
  }
  const { error: saveError } = await db.from("meeting_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
  if (saveError) return { error: `The invite was cancelled, but the booking couldn't be updated: ${saveError.message}` };
  refresh();
  return {};
}
