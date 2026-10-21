// The daily QA report (brief section 6): one per person, plus the founders' team summary.
// Pure functions over call records, so the same code builds the email and the screens.

import { questionsFor } from "@/lib/scoring/call-sheets";
import { band, dayAverage, type Band } from "@/lib/scoring/compute";
import type { CallRecord, Person } from "@/lib/data/types";

type Feedback = NonNullable<CallRecord["result"]>["feedback"];

export interface Conversion {
  label: string;
  value: string;
}

export interface PersonDayReport {
  person: Person;
  calls: CallRecord[];
  scored: CallRecord[];
  totalMinutes: number;
  average: number | null;
  band: Band | null;
  hardFailCalls: number;
  notRecorded: number;
  notScored: number;
  conversion: Conversion[];
  missedQuestions: { id: string; question: string; count: number }[];
  avgClientSharePct: number | null;
  avgLengthMin: number | null;
  strengths: (Feedback["strengths"][number] & { callId: string })[];
  fixes: (Feedback["fixes"][number] & { callId: string })[];
  tomorrow: string | null;
  bestCall: { call: CallRecord; why: string } | null;
}

const byScore = (a: CallRecord, b: CallRecord) => (b.final?.score ?? 0) - (a.final?.score ?? 0);
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function conversionFor(person: Person, scored: CallRecord[]): Conversion[] {
  if (person.role === "consultant") {
    const vcs = scored.flatMap((c) => (c.result?.stream === "vision_call" ? [c.result.capture] : []));
    return [
      { label: "VCs scored", value: String(vcs.length) },
      { label: "Proposal dates fixed", value: `${vcs.filter((c) => c.proposalDate).length} of ${vcs.length}` },
      { label: "Review calls fixed", value: `${vcs.filter((c) => c.reviewCallDate).length} of ${vcs.length}` },
      { label: "Founder round twos", value: String(vcs.filter((c) => c.founderRoundTwo).length) },
    ];
  }
  const firstCalls = scored.flatMap((c) => (c.result?.stream === "first_call" ? [c.result.capture] : []));
  const booked = firstCalls.filter((c) => c.vcDateTime).length;
  return [
    { label: "First calls scored", value: String(firstCalls.length) },
    { label: "VCs booked", value: `${booked} (${pct(booked, firstCalls.length)})` },
  ];
}

function missedQuestions(scored: CallRecord[]) {
  const counts = new Map<string, number>();
  for (const call of scored) {
    for (const item of call.result?.coverage ?? []) {
      if (item.status === "missed") counts.set(item.question, (counts.get(item.question) ?? 0) + 1);
    }
  }
  const all = [...questionsFor("first_call"), ...questionsFor("vision_call")];
  return [...counts]
    .map(([id, count]) => ({ id, count, question: all.find((q) => q.id === id)?.question ?? id }))
    .sort((a, b) => b.count - a.count);
}

export function personDayReport(person: Person, allCalls: CallRecord[]): PersonDayReport {
  const calls = allCalls.filter((c) => c.personId === person.id);
  const scored = calls.filter((c) => c.final).sort(byScore);
  const average = dayAverage(scored.map((c) => c.final!.score));
  const hardFailCalls = scored.filter((c) => c.final!.hardFails.length > 0).length;

  // Strengths from the best calls, fixes from the weakest, at most two each.
  const strengths = scored.flatMap((c) => c.result!.feedback.strengths.map((s) => ({ ...s, callId: c.id }))).slice(0, 2);
  const weakestFirst = [...scored].reverse();
  const fixes = weakestFirst.flatMap((c) => c.result!.feedback.fixes.map((f) => ({ ...f, callId: c.id }))).slice(0, 2);
  const best = scored[0];

  const clientShares = scored.map((c) => c.metrics?.clientShare).filter((x): x is number => x !== undefined);
  const avgShare = mean(clientShares);
  const avgLength = mean(scored.map((c) => c.durationSec / 60));

  return {
    person,
    calls,
    scored,
    totalMinutes: Math.round(calls.reduce((s, c) => s + c.durationSec, 0) / 60),
    average,
    band: average === null ? null : band(average, 0),
    hardFailCalls,
    notRecorded: calls.filter((c) => c.notScored === "recording_missing").length,
    notScored: calls.filter((c) => c.notScored && c.notScored !== "recording_missing").length,
    conversion: conversionFor(person, scored),
    missedQuestions: missedQuestions(scored),
    avgClientSharePct: avgShare === null ? null : Math.round(avgShare * 100),
    avgLengthMin: avgLength === null ? null : Math.round(avgLength * 10) / 10,
    strengths,
    fixes,
    tomorrow: weakestFirst[0]?.result?.feedback.tomorrow ?? null,
    bestCall: best ? { call: best, why: best.result!.feedback.strengths[0].text } : null,
  };
}

export interface TeamRow {
  report: PersonDayReport;
  /** Seven daily averages ending today (today may be null when nothing was scored). */
  trend: (number | null)[];
}

export interface TeamSummary {
  rows: TeamRow[];
  redCalls: CallRecord[];
  firstCalls: number;
  vcsBooked: number;
  visionCalls: number;
  proposalDatesFixed: number;
  caseStudies: { name: string; count: number }[];
}

export function teamSummary(people: Person[], calls: CallRecord[], previousDays: Record<string, number[]>): TeamSummary {
  const rows = people.map((person) => {
    const report = personDayReport(person, calls);
    return { report, trend: [...(previousDays[person.id] ?? []).slice(-6), report.average] };
  });

  const scored = calls.filter((c) => c.final);
  const caseStudyCounts = new Map<string, number>();
  for (const c of scored) {
    const names = c.result?.stream === "first_call" ? c.result.capture.caseStudiesMentioned : c.result?.capture.caseStudiesDiscussed ?? [];
    for (const n of names) caseStudyCounts.set(n, (caseStudyCounts.get(n) ?? 0) + 1);
  }
  const firstCaptures = scored.flatMap((c) => (c.result?.stream === "first_call" ? [c.result.capture] : []));
  const vcCaptures = scored.flatMap((c) => (c.result?.stream === "vision_call" ? [c.result.capture] : []));

  return {
    rows,
    redCalls: scored.filter((c) => c.final!.band === "red"),
    firstCalls: firstCaptures.length,
    vcsBooked: firstCaptures.filter((c) => c.vcDateTime).length,
    visionCalls: vcCaptures.length,
    proposalDatesFixed: vcCaptures.filter((c) => c.proposalDate).length,
    caseStudies: [...caseStudyCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
