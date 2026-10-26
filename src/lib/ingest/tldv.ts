// Stores tl;dv meetings as vision calls, matched by tl;dv's meeting id. tl;dv keeps the
// recording (the call links to it) and supplies the transcript with speakers' names.
// Pipeline code: uses the secret key because no viewer is involved.

import "server-only";
import { addDays } from "@/lib/format";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clientsOf, type TldvMeeting } from "@/lib/tldv";
import type { SpeakerTurn } from "@/lib/transcription/turns";
import { fetchTldvTranscript, listTldvMeetings } from "./tldv-api";
import { MEDIA_RETENTION_DAYS } from "./callyzer";

export type StoreOutcome = "inserted" | "updated" | "unchanged" | "internal";

export async function storeTldvMeeting(meeting: TldvMeeting, transcript: SpeakerTurn[] | null): Promise<StoreOutcome> {
  // A meeting with nobody from outside DNY is internal, not a vision call.
  const client = clientsOf(meeting)[0];
  if (!client?.email) return "internal";
  const db = supabaseAdmin();

  // The consultant is whoever on the team list has the organiser's (or an invitee's) tl;dv email.
  const emails = [meeting.organizer.email, ...meeting.invitees.map((p) => p.email)].filter((e): e is string => Boolean(e));
  const { data: people, error: peopleError } = await db.from("people").select("id, tldv_email").in("tldv_email", emails);
  if (peopleError) throw new Error(`people: ${peopleError.message}`);
  const personId = (people.find((p) => p.tldv_email === meeting.organizer.email) ?? people[0])?.id ?? null;

  // One lead per client email (stored lowercase); an existing lead is kept as it is.
  const { data: leads, error: leadError } = await db.from("leads").select("id").eq("email", client.email).limit(1);
  if (leadError) throw new Error(`lead: ${leadError.message}`);
  let leadId = leads[0]?.id ?? null;
  if (!leadId) {
    const { data, error } = await db.from("leads").insert({ email: client.email, name: client.name }).select("id").single();
    if (error) throw new Error(`lead: ${error.message}`);
    leadId = data.id;
  }

  const eligible = meeting.durationSec >= MIN_SCORED_DURATION_SEC;
  const { data: existing, error: existingError } = await db
    .from("calls")
    .select("id, person_id, transcript_status")
    .eq("source", "tldv")
    .eq("source_id", meeting.sourceId)
    .maybeSingle();
  if (existingError) throw new Error(`call: ${existingError.message}`);

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
  failed: number;
}

/** Catches meetings the webhook missed: everything that happened since `sinceIso`. */
export async function syncTldv(sinceIso: string, maxPages = 10): Promise<TldvSyncResult> {
  const result: TldvSyncResult = { checked: 0, inserted: 0, updated: 0, internal: 0, failed: 0 };
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
