// Best-call examples: moments from real DNY calls where a call-sheet question was asked well,
// picked by founders so new and weak executives can hear how colleagues do it. Pure helpers; the
// reads and the pin/unpin actions are in lib/data and app/examples.

import type { CallRecord } from "@/lib/data/types";
import { secondsFrom } from "@/lib/format";
import type { Band } from "@/lib/scoring/compute";

export { secondsFrom };

export interface ExampleCandidate {
  questionId: string;
  callId: string;
  personId: string;
  clientName: string;
  startedAt: string;
  /** Where the quote starts in the call, in seconds. */
  startSec: number;
  quote: string;
  /** Who said the quote: the clip starts a line earlier for a client's answer, to include the question. */
  speaker: "agent" | "client";
  score: number;
  band: Band;
}


/**
 * For each question, the covered moments from scored first calls, best call first: the
 * executive's own words when the quote has them, since the point is how to ask.
 */
export function exampleCandidates(calls: CallRecord[], alreadyPinned: ReadonlySet<string>, perQuestion = 3): ExampleCandidate[] {
  const all: ExampleCandidate[] = [];
  for (const call of calls) {
    if (!call.final || call.result?.stream !== "first_call") continue;
    for (const item of call.result.coverage) {
      if (item.status !== "covered" || alreadyPinned.has(`${item.question}:${call.id}`)) continue;
      const evidence = item.evidence.find((e) => e.speaker === "agent") ?? item.evidence[0];
      const startSec = evidence ? secondsFrom(evidence.at) : NaN;
      if (!evidence || !Number.isFinite(startSec)) continue;
      all.push({
        questionId: item.question,
        callId: call.id,
        personId: call.personId,
        clientName: call.client.name,
        startedAt: call.startedAt,
        startSec,
        quote: evidence.quote,
        speaker: evidence.speaker,
        score: call.final.score,
        band: call.final.band,
      });
    }
  }
  const byQuestion = new Map<string, ExampleCandidate[]>();
  for (const c of all.sort((a, b) => b.score - a.score || b.startedAt.localeCompare(a.startedAt))) {
    const list = byQuestion.get(c.questionId) ?? [];
    if (list.length < perQuestion) byQuestion.set(c.questionId, [...list, c]);
  }
  return [...byQuestion.values()].flat();
}

/**
 * The clip to play for a moment: from a second before the quoted line (or the line before it, the
 * question, when the quote is the client's answer) to two lines on, at most 45 seconds.
 */
export function clipBounds(
  segments: { startSec: number; endSec: number }[],
  startSec: number,
  speaker: "agent" | "client" = "agent",
): { start: number; end: number } {
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  const i = sorted.findLastIndex((s) => s.startSec <= startSec + 0.5);
  const from = speaker === "client" && i > 0 ? i - 1 : i;
  const start = Math.max(0, (from >= 0 ? sorted[from].startSec : startSec) - 1);
  const replyEnd = i >= 0 ? (sorted[Math.min(i + 2, sorted.length - 1)].endSec) : startSec + 20;
  const end = Math.min(start + 45, Math.max(replyEnd, start + 8));
  return { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 };
}
