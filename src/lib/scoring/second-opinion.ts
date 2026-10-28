// A second opinion on the calls where a score matters most: Red calls (reviewed in the stand-up) and
// calls within a few points of a band line. A later run scores them again from scratch; the first
// score stands, and a real disagreement flags the call for a founder's look.

import { AMBER_FROM, GREEN_FROM, type Band, type Level } from "./compute";

/** How close to a band line (60 or 80) a score has to be to get a second opinion. */
export const NEAR_BAND_LINE = 5;
/** More than this many points apart counts as a disagreement. */
export const DISAGREEMENT_POINTS = 10;
/** The second opinion comes from a later run, so the two scorings are independent. */
export const SECOND_OPINION_AFTER_MIN = 60;
/** Older calls don't get one: the morning report has gone. */
export const SECOND_OPINION_WITHIN_DAYS = 3;

export interface SecondOpinion {
  score: number;
  band: Band;
  levels: Record<string, Level>;
  hardFails: string[];
  at: string;
}

export function wantsSecondOpinion(score: number, band: Band): boolean {
  return band === "red" || Math.abs(score - AMBER_FROM) <= NEAR_BAND_LINE || Math.abs(score - GREEN_FROM) <= NEAR_BAND_LINE;
}

/** A real disagreement: more than 10 points apart, or a hard fail only one of the two found. */
export function disagrees(first: { score: number; hardFails: string[] }, second: { score: number; hardFails: string[] }): boolean {
  if (Math.abs(first.score - second.score) > DISAGREEMENT_POINTS) return true;
  const a = [...first.hardFails].sort().join();
  const b = [...second.hardFails].sort().join();
  return a !== b;
}
