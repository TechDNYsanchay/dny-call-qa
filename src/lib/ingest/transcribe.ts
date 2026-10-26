// Turns stored recordings into transcripts, one call at a time, oldest first.
// Pipeline code: uses the secret key because no viewer is involved.

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { configuredTranscriber } from "@/lib/transcription";

/** Tries per call before it is marked failed (matches claim_call_for_transcription). */
const MAX_ATTEMPTS = 3;
/** Several failures in a row means the service is down: stop and let the next run retry. */
const MAX_FAILURES_IN_A_ROW = 3;
/** The service downloads the recording itself through this link. */
const LINK_SECONDS = 60 * 60;

export interface TranscribeRun {
  provider: string;
  transcribed: number;
  retrying: number;
  failed: number;
  /** True when the run stopped for time and calls may still be waiting. */
  outOfTime: boolean;
}

/** Transcribes waiting calls until none are left, time runs out, or `maxCalls` are done. */
export async function transcribePending(budgetMs: number, maxCalls = Infinity): Promise<TranscribeRun> {
  const transcriber = configuredTranscriber();
  const db = supabaseAdmin();
  const until = Date.now() + budgetMs;
  const run: TranscribeRun = { provider: transcriber.id, transcribed: 0, retrying: 0, failed: 0, outOfTime: false };
  let failuresInARow = 0;

  while (failuresInARow < MAX_FAILURES_IN_A_ROW && run.transcribed + run.retrying + run.failed < maxCalls) {
    if (Date.now() > until) {
      run.outOfTime = true;
      break;
    }
    const { data: claimed, error: claimError } = await db.rpc("claim_call_for_transcription", { p_max_attempts: MAX_ATTEMPTS });
    if (claimError) throw new Error(`claim: ${claimError.message}`);
    const call = claimed[0];
    if (!call) break;

    try {
      const { data: link, error: linkError } = await db.storage.from("recordings").createSignedUrl(call.path, LINK_SECONDS);
      if (linkError) throw new Error(`recording link: ${linkError.message}`);
      const turns = await transcriber.transcribe({ url: link.signedUrl });
      if (turns.length === 0) throw new Error("no speech found in the recording");

      const { error } = await db.rpc("save_transcript", { p_call_id: call.call_id, p_provider: transcriber.id, p_segments: turns as never });
      if (error) throw new Error(`save: ${error.message}`);
      run.transcribed++;
      failuresInARow = 0;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const final = call.attempt >= MAX_ATTEMPTS;
      console.error(`transcribe: call ${call.call_id} attempt ${call.attempt} failed: ${message}`);
      const { error: updateError } = await db
        .from("calls")
        .update({ transcript_status: final ? "failed" : "pending", transcript_error: message })
        .eq("id", call.call_id);
      if (updateError) throw new Error(`mark failed: ${updateError.message}`);
      if (final) run.failed++;
      else run.retrying++;
      failuresInARow++;
    }
  }
  return run;
}
