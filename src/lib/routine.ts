// Starts the scoring routine the moment a meeting's transcript is in, through the routine's API
// trigger, so the score shows in the app minutes after the meeting instead of at the 01:00 run.
// Needs SCORING_ROUTINE_FIRE_URL and SCORING_ROUTINE_FIRE_TOKEN (the routine's Fire URL and token,
// made on claude.ai/code/routines). Without them nothing happens and the nightly runs score it.

import "server-only";
import { alert } from "@/lib/alerts";
import { supabaseAdmin } from "@/lib/supabase/server";

const STATE_KEY = "scoring_routine_started";
/**
 * At most one start per minute. A run that started within the minute is still booting or scoring,
 * and it keeps asking for the next ready call until none is left, so it picks up a meeting that
 * turned ready meanwhile; a second start would only cost a second session.
 */
const COALESCE_MS = 60_000;
const TIMEOUT_MS = 10_000;

export type RoutineStart = "started" | "recent" | "off" | "failed";

/** Never throws: a failed start only delays the score until the nightly run. */
export async function startScoringRoutine(reason: string): Promise<RoutineStart> {
  const url = process.env.SCORING_ROUTINE_FIRE_URL;
  const token = process.env.SCORING_ROUTINE_FIRE_TOKEN;
  if (!url || !token) return "off";
  try {
    if (!(await claimSlot())) return "recent";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    console.info(`scoring routine started: ${reason}`);
    return "started";
  } catch (error) {
    await releaseSlot().catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`scoring routine not started (${reason}): ${message}`);
    await alert("routine:start", "meetings aren't being scored straight away", [
      `The app couldn't start the scoring routine after a meeting (${reason}).`,
      "The meeting will still be scored by the nightly run at 01:00. Check the routine's API trigger on claude.ai/code/routines and the SCORING_ROUTINE_FIRE_URL and SCORING_ROUTINE_FIRE_TOKEN variables on Vercel.",
      `Error: ${message}`,
    ]);
    return "failed";
  }
}

/** Takes the one-per-minute slot (the settings row's updated_at); false when a start happened within the minute. */
async function claimSlot(): Promise<boolean> {
  const db = supabaseAdmin();
  const now = new Date();
  const cutoff = new Date(now.getTime() - COALESCE_MS).toISOString();
  const { data, error } = await db.from("app_settings").update({ updated_at: now.toISOString() }).eq("key", STATE_KEY).lt("updated_at", cutoff).select("key");
  if (error) throw new Error(`settings: ${error.message}`);
  if (data.length) return true;
  // Nothing updated: a start happened within the minute, or the row doesn't exist yet.
  const { error: insertError } = await db.from("app_settings").insert({ key: STATE_KEY, value: null, updated_at: now.toISOString() });
  if (!insertError) return true;
  if (insertError.code === "23505") return false;
  throw new Error(`settings: ${insertError.message}`);
}

/** A start that failed frees the slot, so the next meeting tries again at once. */
async function releaseSlot(): Promise<void> {
  await supabaseAdmin().from("app_settings").update({ updated_at: new Date(0).toISOString() }).eq("key", STATE_KEY);
}
