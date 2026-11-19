// Stores tl;dv meetings as vision calls, matched by tl;dv's meeting id. tl;dv keeps the
// recording (the call links to it) and supplies the transcript with speakers' names.
// Pipeline code: uses the secret key because no viewer is involved.

import "server-only";
import { isSalesTitle } from "@/lib/booking";
import { addDays } from "@/lib/format";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { startScoringRoutine } from "@/lib/routine";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clientsOf, type TldvMeeting } from "@/lib/tldv";
import type { SpeakerTurn } from "@/lib/transcription/turns";
import { fetchTldvTranscript, listTldvMeetings } from "./tldv-api";
import { MEDIA_RETENTION_DAYS } from "./callyzer";

export type StoreOutcome = "inserted" | "updated" | "unchanged" | "internal" | "not_sales";

/** The transcript, or a way to fetch it that's only called once the meeting is known to need it. */
export type TranscriptSource = SpeakerTurn[] | null | (() => Promise<SpeakerTurn[] | null>);

type Db = ReturnType<typeof supabaseAdmin>;
type Booking = { id: string; consultant_id: string | null; lead_id: string | null; client_name: string; client_email: string };

/** Days either side of the vision-call date fixed on a first call that a meeting still counts. */
const VC_DATE_SLACK_DAYS = 3;

/** The meeting booked (or added) in the app with this Meet code, if any. */
async function bookingFor(db: Db, code: string | null): Promise<Booking | null> {
  if (!code) return null;
  const { data, error } = await db.from("meeting_bookings").select("id, consultant_id, lead_id, client_name, client_email").eq("meet_code", code).eq("status", "booked").maybeSingle();
  if (error) throw new Error(`booking: ${error.message}`);
  return data;
}

/**
 * Whether a meeting that wasn't booked in the app is still a sales meeting (a vision call): its title
 * says so, or the client's first call fixed a vision call around this date. Client meetings and
 * anything else are left to the call-to-action app.
 */
async function salesMeeting(db: Db, meeting: TldvMeeting, clientEmail: string): Promise<boolean> {
  if (isSalesTitle(meeting.title)) return true;
  const day = meeting.startedAt.slice(0, 10);
  const { data, error } = await db
    .from("leads")
    .select("id")
    .eq("email", clientEmail)
    .gte("first_call_capture->>vcDate", addDays(day, -VC_DATE_SLACK_DAYS))
    .lte("first_call_capture->>vcDate", addDays(day, VC_DATE_SLACK_DAYS))
    .limit(1);
  if (error) throw new Error(`lead: ${error.message}`);
  return data.length > 0;
}

export async function storeTldvMeeting(meeting: TldvMeeting, source: TranscriptSource): Promise<StoreOutcome> {
  const db = supabaseAdmin();
  // Booked or added in the app: a sales meeting, even when tl;dv lists no outside guest (a meeting
  // added by its Meet link may carry none); the booking then says who the client is.
  const booking = await bookingFor(db, meeting.meetCode);
  const invited = clientsOf(meeting)[0];
  const clientEmail = invited?.email ?? (booking?.client_email || null);
  const clientName = invited?.name ?? booking?.client_name ?? null;
  // Otherwise a meeting with nobody from outside DNY is internal, not a vision call.
  if (!clientEmail && !booking) return "internal";

  const { data: existing, error: existingError } = await db
    .from("calls")
    .select("id, person_id, transcript_status")
    .eq("source", "tldv")
    .eq("source_id", meeting.sourceId)
    .maybeSingle();
  if (existingError) throw new Error(`call: ${existingError.message}`);
  // A meeting already stored is a vision call; a new one is stored only when it's a sales meeting.
  if (!existing && !booking && !(await salesMeeting(db, meeting, clientEmail!))) return "not_sales";
  const sales = { booking: existing ? null : booking };

  // The consultant is the one booked, else whoever on the team list has the organiser's (or an invitee's) tl;dv email.
  const emails = [meeting.organizer.email, ...meeting.invitees.map((p) => p.email)].filter((e): e is string => Boolean(e));
  const { data: people, error: peopleError } = await db.from("people").select("id, tldv_email").in("tldv_email", emails);
  if (peopleError) throw new Error(`people: ${peopleError.message}`);
  const personId = sales.booking?.consultant_id ?? (people.find((p) => p.tldv_email === meeting.organizer.email) ?? people[0])?.id ?? null;

  // One lead per client email (stored lowercase); an existing lead is kept as it is.
  let leadId = sales.booking?.lead_id ?? null;
  if (!leadId && clientEmail) {
    const { data: leads, error: leadError } = await db.from("leads").select("id").eq("email", clientEmail).limit(1);
    if (leadError) throw new Error(`lead: ${leadError.message}`);
    leadId = leads[0]?.id ?? null;
  }
  if (!leadId) {
    const { data, error } = await db.from("leads").insert({ email: clientEmail, name: clientName }).select("id").single();
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
        client_email: clientEmail,
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

  if (!eligible) return outcome;
  const transcript = typeof source === "function" ? await source() : source;
  if (transcript?.length) {
    const { error } = await db.rpc("save_transcript", { p_call_id: callId, p_provider: "tldv", p_segments: transcript as never });
    if (error) throw new Error(`save transcript: ${error.message}`);
    if (outcome === "unchanged") outcome = "updated";
    // Ready for scoring: start the routine now rather than waiting for the nightly run.
    await startScoringRoutine(`meeting "${meeting.title ?? meeting.sourceId}" is ready`);
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

/**
 * Catches meetings the webhook missed: everything that happened since `sinceIso`. Every 10 minutes in
 * the day for the last few hours, and at night for the last 3 days. Transcripts are only fetched for
 * sales meetings still waiting for one.
 */
export async function syncTldv(sinceIso: string, maxPages = 10): Promise<TldvSyncResult> {
  const result: TldvSyncResult = { checked: 0, inserted: 0, updated: 0, internal: 0, notSales: 0, failed: 0 };
  for (let page = 1; page <= maxPages; page++) {
    const { meetings, pages } = await listTldvMeetings(page);
    const recent = meetings.filter((m) => m.startedAt >= sinceIso);
    for (const meeting of recent) {
      result.checked++;
      try {
        const outcome = await storeTldvMeeting(meeting, () => fetchTldvTranscript(meeting.sourceId));
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
