"use server";

// Booking and cancelling sales meetings. Anyone on the team list can book; the meeting is created
// on the recording account's calendar, so tl;dv records it and the result reaches Sales QA.

import { refresh } from "next/cache";
import { calendarEvent, calendarIdOf, existingEventId, existingMeetingEvent, isExistingMeeting, meetingLinkMessage, parseBookingForm, parseExistingMeetingForm, whenText, type ExistingFieldErrors, type FieldErrors, type Guest } from "@/lib/booking";
import { getCurrentPerson } from "@/lib/data";
import { addExistingMeeting as addToCalendar, cancelMeeting, createMeeting, GoogleNotReady } from "@/lib/google";
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

export interface ExistingState {
  errors?: ExistingFieldErrors;
  values?: Record<string, string>;
  done?: { clientName: string; when: string; meetUrl: string; videoAttached: boolean; withClient: boolean };
}

/**
 * A sales meeting someone set up on their own calendar: registered as a sales meeting by its Meet
 * code, with a copy on the recording account's calendar so tl;dv records it. Nobody is emailed.
 */
export async function addExistingMeeting(_prev: ExistingState, form: FormData): Promise<ExistingState> {
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const fail = (errors: ExistingFieldErrors): ExistingState => ({ errors, values });
  const me = await getCurrentPerson();
  if (!me) return fail({ form: "Sign in again to add a meeting." });
  const parsed = parseExistingMeetingForm(values, Date.now());
  if (!parsed.ok) return fail(parsed.errors);
  const m = parsed.value;

  const db = supabaseAdmin();
  const { data: host, error: hostError } = await db.from("people").select("id, active").eq("id", m.consultantId).maybeSingle();
  if (hostError) return fail({ form: `Couldn't check who takes the meeting: ${hostError.message}` });
  if (!host?.active) return fail({ consultantId: "Pick someone on the team list" });

  // A Meet link already in the app is refused, unless it was registered by hand without a calendar copy.
  const { data: same, error: sameError } = await db.from("meeting_bookings").select("id, status, calendar_event_id").eq("meet_code", m.meetCode).maybeSingle();
  if (sameError) return fail({ form: `Couldn't check the Meet link: ${sameError.message}` });
  if (same && (same.status === "booked" ? same.calendar_event_id : false)) return fail({ meetLink: "This meeting is already in the app" });

  let leadId: string | null = null;
  if (m.clientEmail) {
    const { data: leads } = await db.from("leads").select("id").eq("email", m.clientEmail).limit(1);
    leadId = leads?.[0]?.id ?? null;
  }
  const fields = {
    lead_id: leadId,
    client_name: m.clientName,
    client_email: m.clientEmail ?? "",
    starts_at: m.startsAt,
    duration_min: m.durationMin,
    notes: m.notes,
    consultant_id: host.id,
    booked_by: me.id,
    meet_url: m.meetUrl,
    meet_code: m.meetCode,
    status: "booked" as const,
    cancelled_at: null,
  };
  const saved = same
    ? await db.from("meeting_bookings").update(fields).eq("id", same.id).select("id").single()
    : await db.from("meeting_bookings").insert(fields).select("id").single();
  if (saved.error) return fail({ form: `Couldn't save the meeting: ${saved.error.message}` });

  try {
    const copy = await addToCalendar(existingMeetingEvent(m), existingMeetingEvent(m, false));
    const { error } = await db.from("meeting_bookings").update({ calendar_event_id: existingEventId(copy.eventId) }).eq("id", saved.data.id);
    if (error) return { errors: { form: `The meeting is on the recording calendar, but the app couldn't save that: ${error.message}` } };
    return { done: { clientName: m.clientName, when: whenText(m.startsAt), meetUrl: m.meetUrl, videoAttached: copy.videoAttached, withClient: Boolean(m.clientEmail) } };
  } catch (error) {
    // Without the calendar copy tl;dv won't record it; keep nothing so it can be tried again.
    if (!same) await db.from("meeting_bookings").delete().eq("id", saved.data.id);
    const reason = error instanceof Error ? error.message : String(error);
    return fail({ form: error instanceof GoogleNotReady ? reason : `Couldn't add it to the recording calendar: ${reason}` });
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
    // A meeting set up elsewhere loses only the recording calendar's copy, quietly: the real meeting stands.
    if (booking.calendar_event_id) await cancelMeeting(calendarIdOf(booking.calendar_event_id), !isExistingMeeting(booking.calendar_event_id));
  } catch (cancelError) {
    return { error: cancelError instanceof Error ? cancelError.message : String(cancelError) };
  }
  const { error: saveError } = await db.from("meeting_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
  if (saveError) return { error: `The invite was cancelled, but the booking couldn't be updated: ${saveError.message}` };
  refresh();
  return {};
}
