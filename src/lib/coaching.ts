// Coaching focus: the one thing a founder asks an executive to work on (a call-sheet question to
// ask on every call, or a scorecard area to get to Met), and how often scored calls show it.
// Pure functions; the reads and the set/end actions are in lib/data and the person page.

import type { CallRecord } from "@/lib/data/types";
import { addDays } from "@/lib/format";
import type { SheetQuestion } from "@/lib/scoring/call-sheets";
import { areasFor } from "@/lib/scoring/scorecards";

export interface Focus {
  id: string;
  personId: string;
  kind: "question" | "area";
  /** A question id (fc10) or an area id (cta). */
  targetId: string;
  note: string | null;
  /** IST timestamp. */
  setAt: string;
  setBy: string | null;
}

export interface Tally {
  hit: number;
  total: number;
}

const AREAS = [...areasFor("first_call"), ...areasFor("vision_call")];

/** "Ask the budget question" style label: the question itself, or the area to get to Met. */
export function focusLabel(f: Pick<Focus, "kind" | "targetId">, questions: SheetQuestion[]): string {
  if (f.kind === "question") return questions.find((q) => q.id === f.targetId)?.question ?? f.targetId;
  return `${AREAS.find((a) => a.id === f.targetId)?.name ?? f.targetId}: get to Met`;
}

/** Whether a call shows the focus: the question asked (covered or partly), or the area Met. Null when it doesn't apply. */
export function focusHit(call: CallRecord, f: Pick<Focus, "kind" | "targetId">): boolean | null {
  if (!call.final || !call.result) return null;
  if (f.kind === "question") {
    const item = call.result.coverage.find((c) => c.question === f.targetId);
    if (!item || item.status === "not_applicable") return null;
    return item.status !== "missed";
  }
  const level = call.final.levels[f.targetId];
  return level === undefined ? null : level === 10;
}

function tally(calls: CallRecord[], f: Focus): Tally {
  let hit = 0;
  let total = 0;
  for (const c of calls) {
    const h = focusHit(c, f);
    if (h === null) continue;
    total++;
    if (h) hit++;
  }
  return { hit, total };
}

export interface FocusProgress {
  /** Scored calls since the focus was set (the set day included). */
  since: Tally;
  /** The 7 days before it was set, to compare. */
  before: Tally;
  /** Each day from the set day (at most the last 14) to `today`. */
  days: (Tally & { day: string })[];
}

export function focusProgress(calls: CallRecord[], f: Focus, today: string): FocusProgress {
  const mine = calls.filter((c) => c.personId === f.personId);
  const setDay = f.setAt.slice(0, 10);
  const dayOf = (c: CallRecord) => c.startedAt.slice(0, 10);
  const firstShown = setDay > addDays(today, -13) ? setDay : addDays(today, -13);
  const days: FocusProgress["days"] = [];
  for (let d = firstShown; d <= today; d = addDays(d, 1)) days.push({ day: d, ...tally(mine.filter((c) => dayOf(c) === d), f) });
  return {
    since: tally(mine.filter((c) => dayOf(c) >= setDay && dayOf(c) <= today), f),
    before: tally(mine.filter((c) => dayOf(c) >= addDays(setDay, -7) && dayOf(c) < setDay), f),
    days,
  };
}

export const share = (t: Tally) => (t.total ? Math.round((t.hit / t.total) * 100) : null);
