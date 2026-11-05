// Stores tl;dv meetings as vision calls, matched by tl;dv's meeting id. tl;dv keeps the
// recording (the call links to it) and supplies the transcript with speakers' names.
// Pipeline code: uses the secret key because no viewer is involved.

import "server-only";
import { isSalesTitle } from "@/lib/booking";
import { addDays } from "@/lib/format";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clientsOf, type TldvMeeting } from "@/lib/tldv";
import type { SpeakerTurn } from "@/lib/transcription/turns";
import { fetchTldvTranscript, listTldvMeetings } from "./tldv-api";
import { MEDIA_RETENTION_DAYS } from "./callyzer";

export type StoreOutcome = "inserted" | "updated" | "unchanged" | "internal" | "not_sales";

type Db = ReturnType<typeof supabaseAdmin>;
type Booking = { id: string; consultant_id: string | null; lead_id: string | null };

/** Days either side of the vision-call date fixed on a first call that a meeting still counts. */
const VC_DATE_SLACK_DAYS = 3;

/**
 * Whether a recorded meeting is a sales meeting (a vision call), and its booking when it was booked
 * from the app. Client meetings and anything else are left to the call-to-action app.
 */
async function salesMeeting(db: Db, meeting: TldvMeeting, clientEmail: string): Promise<{ booking: Booking | null } | null> {
  if (meeting.meetCode) {
    const { data, error } = await db.from("meeting_bookings").select("id, consultant_id, lead_id").eq("meet_code", meeting.meetCode).eq("status", "booked").maybeSingle();
    if (error) throw new Error(`booking: ${error.message}`);
    if (data) return { booking: data };
  }
  if (isSalesTitle(meeting.title)) return { booking: null };
  // A lead whose first call fixed a vision call around this date.
  const day = meeting.startedAt.slice(0, 10);
  const { data, error } = await db
    .from("leads")
    .select("id")
    .eq("email", clientEmail)
    .gte("first_call_capture->>vcDate", addDays(day, -VC_DATE_SLACK_DAYS))
    .lte("first_call_capture->>vcDate", addDays(day, VC_DATE_SLACK_DAYS))
    .limit(1);
  if (error) throw new Error(`lead: ${error.message}`);
  return data.length ? { booking: null } : null;
}

export async function storeTldvMeeting(meeting: TldvMeeting, transcript: SpeakerTurn[] | null): Promise<StoreOutcome> {
  // A meeting with nobody from outside DNY is internal, not a vision call.
  const client = clientsOf(meeting)[0];
  if (!client?.email) return "internal";
  const db = supabaseAdmin();

  const { data: existing, error: existingError } = await db
    .from("calls")
    .select("id, person_id, transcript_status")
    .eq("source", "tldv")
    .eq("source_id", meeting.sourceId)
    .maybeSingle();
  if (existingError) throw new Error(`call: ${existingError.message}`);
  // A meeting already stored is a vision call; a new one is stored only when it's a sales meeting.
  const sales = existing ? { booking: null } : await salesMeeting(db, meeting, client.email);
  if (!sales) return "not_sales";

  // The consultant is the one booked, else whoever on the team list has the organiser's (or an invitee's) tl;dv email.
  const emails = [meeting.organizer.email, ...meeting.invitees.map((p) => p.email)].filter((e): e is string => Boolean(e));
  const { data: people, error: peopleError } = await db.from("people").select("id, tldv_email").in("tldv_email", emails);
  if (peopleError) throw new Error(`people: ${peopleError.message}`);
  const personId = sales.booking?.consultant_id ?? (people.find((p) => p.tldv_email === meeting.organizer.email) ?? people[0])?.id ?? null;

  // One lead per client email (stored lowercase); an existing lead is kept as it is.
  let leadId = sales.booking?.lead_id ?? null;
  if (!leadId) {
    const { data: leads, error: leadError } = await db.from("leads").select("id").eq("email", client.email).limit(1);
    if (leadError) throw new Error(`lead: ${leadError.message}`);
    leadId = leads[0]?.id ?? null;
  }
  if (!leadId) {
    const { data, error } = await db.from("leads").insert({ email: client.email, name: client.name }).select("id").single();
    if (error) throw new Error(`lead: ${error.message}`);
    leadId = data.id;
  }

  const eligible = meeting.durationSec >= MIN_SCORED_DURATION_SEC;

  let callId: string;
  let outcome: StoreOutcome;
  if (!existing) {
    const { data, error } = await db
      .from("calls")
      .insert({
        stream: "vision_call",
        source: "tldv",
        source_id: meeting.sourceId,
        person_id: personId,
        lead_id: leadId,
        client_email: client.email,
        started_at: meeting.startedAt,
        duration_sec: meeting.durationSec,
        recording_status: "available",
        recording_source_url: meeting.url,
        transcript_status: eligible ? "pending" : "not_needed",
        scoring_status: eligible ? "waiting" : "not_eligible",
        not_scored_reason: eligible ? null : "under_2_min",
        delete_media_after: `${addDays(meeting.startedAt.slice(0, 10), MEDIA_RETENTION_DAYS)}T00:00:00+05:30`,
      })
      .select("id")
      .single();
    if (error) throw new Error(`insert call ${meeting.sourceId}: ${error.message}`);
    callId = data.id;
    outcome = "inserted";
    if (sales.booking) {
      const { error: bookingError } = await db.from("meeting_bookings").update({ call_id: callId, lead_id: leadId }).eq("id", sales.booking.id);
      if (bookingError) throw new Error(`booking: ${bookingError.message}`);
    }
  } else {
    callId = existing.id;
    outcome = "unchanged";
    if (!existing.person_id && personId) {
      const { error } = await db.from("calls").update({ person_id: personId }).eq("id", callId);
      if (error) throw new Error(`update call: ${error.message}`);
      outcome = "updated";
    }
    if (existing.transcript_status === "done") return outcome;
  }

  if (eligible && transcript?.length) {
    const { error } = await db.rpc("save_transcript", { p_call_id: callId, p_provider: "tldv", p_segments: transcript as never });
    if (error) throw new Error(`save transcript: ${error.message}`);
    if (outcome === "unchanged") outcome = "updated";
  }
  return outcome;
}

export interface TldvSyncResult {
  checked: number;
  inserted: number;
  updated: number;
  internal: number;
  /** Client meetings and others: left to the call-to-action app. */
  notSales: number;
  failed: number;
}

/** Catches meetings the webhook missed: everything that happened since `sinceIso`. */
export async function syncTldv(sinceIso: string, maxPages = 10): Promise<TldvSyncResult> {
  const result: TldvSyncResult = { checked: 0, inserted: 0, updated: 0, internal: 0, notSales: 0, failed: 0 };
  for (let page = 1; page <= maxPages; page++) {
    const { meetings, pages } = await listTldvMeetings(page);
    const recent = meetings.filter((m) => m.startedAt >= sinceIso);
    for (const meeting of recent) {
      result.checked++;
      try {
        const transcript = meeting.durationSec >= MIN_SCORED_DURATION_SEC ? await fetchTldvTranscript(meeting.sourceId) : null;
        const outcome = await storeTldvMeeting(meeting, transcript);
        if (outcome === "inserted") result.inserted++;
        else if (outcome === "updated") result.updated++;
        else if (outcome === "internal") result.internal++;
        else if (outcome === "not_sales") result.notSales++;
      } catch (error) {
        result.failed++;
        console.error(`tldv sync: meeting ${meeting.sourceId}:`, error instanceof Error ? error.message : error);
      }
    }
    // tl;dv lists newest first, so a page with nothing recent means the rest is older.
    if (page >= pages || recent.length === 0) break;
  }
  return result;
}
