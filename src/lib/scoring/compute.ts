// Score maths from brief section 5. The model returns a level (0, 5, 10) per area;
// weights, bands, hard-fail overrides and the rules measured from timings live here,
// so they cannot drift with the prompt.

import type { Stream } from "./call-sheets";
import type { CallMetrics } from "./metrics";
import { areasFor } from "./scorecards";

export type Level = 0 | 5 | 10;
export type Band = "green" | "amber" | "red";

export const GREEN_FROM = 80;
export const AMBER_FROM = 60;
export const MIN_SCORED_DURATION_SEC = 120;
export const FIRST_CALL_MAX_SEC = 15 * 60;
export const VC_MIN_CLIENT_SHARE = 0.35;
/** Brief section 4, "Value over pitch" scores 10 only within these; "Relationship first" only with credentials under 2 minutes. */
export const VC_MAX_CONSULTANT_SHARE_FIRST_HALF = 0.45;
export const VC_MAX_CONSULTANT_SHARE = 0.55;
export const VC_MAX_SERVICE_SHARE = 0.2;
export const VC_MAX_CREDENTIALS_SEC = 120;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Sum of weight x level / 10 across the stream's areas: 0 to 100. */
export function callScore(stream: Stream, levels: Record<string, Level>): number {
  let total = 0;
  for (const area of areasFor(stream)) {
    const level = levels[area.id];
    if (level === undefined) throw new Error(`No level for area "${area.id}"`);
    total += (area.weight * level) / 10;
  }
  return round1(total);
}

/** Green 80-100, Amber 60-79, Red below 60 or any hard fail. */
export function band(score: number, hardFailCount: number): Band {
  if (hardFailCount > 0 || score < AMBER_FROM) return "red";
  return score >= GREEN_FROM ? "green" : "amber";
}

/** A person's day is the average of their scored calls; null when nothing was scored. */
export function dayAverage(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return round1(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export type RecordingStatus = "pending" | "available" | "missing" | "declined" | "deleted";
/** "not_sales_call" is set at scoring time: a vendor, telecom, job applicant or personal call. */
export type NotScoredReason = "under_2_min" | "recording_declined" | "recording_missing" | "recording_pending" | "not_sales_call";

/** Calls that are logged but never scored (brief section 5). A missing recording is a flag, never a zero. */
export function scoringEligibility(call: {
  durationSec: number;
  recordingStatus: RecordingStatus;
}): { eligible: true } | { eligible: false; reason: NotScoredReason } {
  if (call.durationSec < MIN_SCORED_DURATION_SEC) return { eligible: false, reason: "under_2_min" };
  if (call.recordingStatus === "declined") return { eligible: false, reason: "recording_declined" };
  if (call.recordingStatus === "pending") return { eligible: false, reason: "recording_pending" };
  if (call.recordingStatus !== "available") return { eligible: false, reason: "recording_missing" };
  return { eligible: true };
}

export interface FinalScore {
  score: number;
  band: Band;
  levels: Record<string, Level>;
  hardFails: string[];
  /** Plain-language notes on the measured rules code applied on top of the model's levels. */
  overrides: string[];
}

export function finaliseScore(
  stream: Stream,
  model: { levels: Record<string, Level>; hardFails: string[] },
  metrics: CallMetrics,
): FinalScore {
  const levels = { ...model.levels };
  const hardFails = [...new Set(model.hardFails)];
  const overrides: string[] = [];

  if (stream === "first_call" && metrics.durationSec > FIRST_CALL_MAX_SEC && levels.short_precise !== 0) {
    levels.short_precise = 0;
    overrides.push("Short and precise set to 0: the call ran over 15 minutes.");
  }

  if (stream === "vision_call") {
    const pct = (share: number) => `${Math.round(share * 100)}%`;
    const over = [
      metrics.agentShareFirstHalf > VC_MAX_CONSULTANT_SHARE_FIRST_HALF && `the consultant talked ${pct(metrics.agentShareFirstHalf)} in the first half (45% at most)`,
      metrics.agentShareOverall > VC_MAX_CONSULTANT_SHARE && `${pct(metrics.agentShareOverall)} overall (55% at most)`,
      metrics.serviceShareOfAgent > VC_MAX_SERVICE_SHARE && `services took ${pct(metrics.serviceShareOfAgent)} of the consultant's talk (20% at most)`,
    ].filter(Boolean);
    if (over.length && levels.value_over_pitch === 10) {
      levels.value_over_pitch = 5;
      overrides.push(`Value over pitch set to 5: ${over.join("; ")}.`);
    }
    if (metrics.credentialsSec > VC_MAX_CREDENTIALS_SEC && levels.relationship_first === 10) {
      levels.relationship_first = 5;
      overrides.push(`Relationship first set to 5: DNY's credentials took ${(metrics.credentialsSec / 60).toFixed(1)} minutes (under 2 is the aim).`);
    }
  }

  if (stream === "vision_call" && metrics.clientShare < VC_MIN_CLIENT_SHARE && !hardFails.includes("client_talk_under_35")) {
    hardFails.push("client_talk_under_35");
    overrides.push(`Hard fail: the client talked ${Math.round(metrics.clientShare * 100)}% of the time (under 35%).`);
  }

  const score = callScore(stream, levels);
  return { score, band: band(score, hardFails.length), levels, hardFails, overrides };
}
