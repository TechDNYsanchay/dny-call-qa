// Stores Callyzer calls. Pipeline code: uses the secret key because no viewer is involved.

import "server-only";
import type { CallyzerCall } from "@/lib/callyzer";
import { addDays } from "@/lib/format";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Recordings and full transcripts are deleted after this many days (10, pending confirmation). */
export const MEDIA_RETENTION_DAYS = 10;

export interface StoreResult {
  inserted: number;
  updated: number;
  /** Calls whose recording should now be copied into storage. */
  toDownload: { callId: string; url: string; startedAt: string }[];
}

export async function storeCallyzerCalls(calls: CallyzerCall[]): Promise<StoreResult> {
  const result: StoreResult = { inserted: 0, updated: 0, toDownload: [] };
  if (calls.length === 0) return result;
  const db = supabaseAdmin();

  // Executives are matched by the phone number Callyzer tracks (people.callyzer_phone).
  const agentPhones = [...new Set(calls.map((c) => c.agentPhone).filter((p): p is string => Boolean(p)))];
  const { data: people, error: peopleError } = await db.from("people").select("id, callyzer_phone").in("callyzer_phone", agentPhones);
  if (peopleError) throw new Error(`people: ${peopleError.message}`);
  const personFor = (phone: string | null) => people.find((p) => p.callyzer_phone === phone)?.id ?? null;

  // One lead per client phone number; existing leads are kept as they are.
  const clientPhones = [...new Set(calls.map((c) => c.clientPhone).filter((p): p is string => Boolean(p)))];
  if (clientPhones.length) {
    const newLeads = clientPhones.map((phone) => ({ phone, name: calls.find((c) => c.clientPhone === phone && c.clientName)?.clientName ?? null }));
    const { error } = await db.from("leads").upsert(newLeads, { onConflict: "phone", ignoreDuplicates: true });
    if (error) throw new Error(`leads: ${error.message}`);
  }
  const { data: leads, error: leadsError } = clientPhones.length
    ? await db.from("leads").select("id, phone").in("phone", clientPhones)
    : { data: [], error: null };
  if (leadsError) throw new Error(`leads: ${leadsError.message}`);
  const leadFor = (phone: string | null) => leads.find((l) => l.phone === phone)?.id ?? null;

  // Callyzer may send the same call again (e.g. once the recording syncs). Existing rows only gain
  // what is new, so a re-send never undoes transcription or scoring.
  const { data: existing, error: existingError } = await db
    .from("calls")
    .select("id, source_id, person_id, recording_source_url, recording_path")
    .eq("source", "callyzer")
    .in("source_id", calls.map((c) => c.sourceId));
  if (existingError) throw new Error(`calls: ${existingError.message}`);

  for (const call of calls) {
    const before = existing.find((e) => e.source_id === call.sourceId);
    const wantsRecording = call.notScored === null && call.recordingUrl !== null;

    if (!before) {
      const { data, error } = await db
        .from("calls")
        .insert({
          stream: "first_call",
          source: "callyzer",
          source_id: call.sourceId,
          person_id: personFor(call.agentPhone),
          agent_phone: call.agentPhone,
          lead_id: leadFor(call.clientPhone),
          client_phone: call.clientPhone,
          started_at: call.startedAt,
          duration_sec: call.durationSec,
          call_direction: call.direction,
          recording_source_url: call.recordingUrl,
          recording_status: "pending",
          transcript_status: call.notScored ? "not_needed" : "pending",
          scoring_status: call.notScored ? "not_eligible" : "waiting",
          not_scored_reason: call.notScored,
          delete_media_after: `${addDays(call.startedAt.slice(0, 10), MEDIA_RETENTION_DAYS)}T00:00:00+05:30`,
        })
        .select("id")
        .single();
      if (error) throw new Error(`insert call ${call.sourceId}: ${error.message}`);
      result.inserted++;
      if (wantsRecording) result.toDownload.push({ callId: data.id, url: call.recordingUrl!, startedAt: call.startedAt });
      continue;
    }

    const changes: { person_id?: string; recording_source_url?: string } = {};
    if (!before.person_id && personFor(call.agentPhone)) changes.person_id = personFor(call.agentPhone)!;
    if (!before.recording_source_url && call.recordingUrl) changes.recording_source_url = call.recordingUrl;
    if (Object.keys(changes).length) {
      const { error } = await db.from("calls").update(changes).eq("id", before.id);
      if (error) throw new Error(`update call ${call.sourceId}: ${error.message}`);
      result.updated++;
    }
    if (wantsRecording && !before.recording_path) {
      result.toDownload.push({ callId: before.id, url: call.recordingUrl!, startedAt: call.startedAt });
    }
  }
  return result;
}
