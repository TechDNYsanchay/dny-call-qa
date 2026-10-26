// Weekly and monthly roll-ups (the plan's Monday roll-up and month-end trend). Pure, over the same
// call records as the daily report, so founders' corrections carry through.

import type { CallRecord, Person } from "@/lib/data/types";
import { addDays, formatDay } from "@/lib/format";
import { personDayReport } from "@/lib/reports";
import { band as bandFor, dayAverage, type Band } from "@/lib/scoring/compute";
import { hardFailsFor } from "@/lib/scoring/scorecards";

export interface Period {
  kind: "week" | "month";
  /** First and last IST day, inclusive. */
  from: string;
  to: string;
  label: string;
  previous: { from: string; to: string; label: string };
  next: { from: string; to: string } | null;
  /** URL query for this period, e.g. "week=2026-10-19". */
  query: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  return addDays(day, -((weekday(day) + 6) % 7));
}

function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const [a, b] = [formatDay(monday), formatDay(sunday)];
  // "19 – 25 Oct 2026", or "27 Oct – 2 Nov 2026" across months
  return a.slice(-8) === b.slice(-8) ? `${a.split(" ")[0]} – ${b}` : `${a.replace(/ \d{4}$/, "")} – ${b}`;
}

export function weekPeriod(day: string): Period {
  const from = weekStart(day);
  const previous = addDays(from, -7);
  return {
    kind: "week",
    from,
    to: addDays(from, 6),
    label: `Week of ${weekLabel(from)}`,
    previous: { from: previous, to: addDays(previous, 6), label: "last week" },
    next: { from: addDays(from, 7), to: addDays(from, 13) },
    query: `week=${from}`,
  };
}

function monthBounds(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, "0")}`];
}

/** `month` is "YYYY-MM". */
export function monthPeriod(month: string): Period {
  const [from, to] = monthBounds(month);
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const [pf, pt] = monthBounds(prev);
  const [nf, nt] = monthBounds(next);
  return { kind: "month", from, to, label: `${MONTHS[m - 1]} ${y}`, previous: { from: pf, to: pt, label: "last month" }, next: { from: nf, to: nt }, query: `month=${month}` };
}

/** Every day of the period, for the daily trend. */
export function daysOf(period: { from: string; to: string }): string[] {
  const days: string[] = [];
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) days.push(d);
  return days;
}

export interface PersonRollup {
  person: Person;
  calls: number;
  scored: number;
  average: number | null;
  band: Band | null;
  previousAverage: number | null;
  /** Average minus last period's, in points; null when either is missing. */
  change: number | null;
  hardFailCalls: number;
  firstCallsScored: number;
  vcsBooked: number;
  avgClientSharePct: number | null;
  /** Daily averages across the period (null on days with nothing scored). */
  daily: (number | null)[];
  best: CallRecord | null;
  worst: CallRecord | null;
  missed: { id: string; question: string; count: number }[];
}

export interface Rollup {
  period: Period;
  people: PersonRollup[];
  calls: number;
  scored: number;
  average: number | null;
  band: Band | null;
  previousAverage: number | null;
  change: number | null;
  hardFails: { id: string; label: string; count: number }[];
  hardFailCalls: number;
  firstCallsScored: number;
  vcsBooked: number;
  missed: { id: string; question: string; count: number }[];
  reviews: { agreed: number; corrected: number };
}

const SCORED_ROLES: Person["role"][] = ["executive", "consultant"];
const round1 = (n: number) => Math.round(n * 10) / 10;
const changeOf = (now: number | null, before: number | null) => (now === null || before === null ? null : round1(now - before));

function personRollup(person: Person, calls: CallRecord[], previousCalls: CallRecord[], days: string[]): PersonRollup {
  const report = personDayReport(person, calls);
  const previousAverage = personDayReport(person, previousCalls).average;
  const byDay = (day: string) => dayAverage(report.scored.filter((c) => c.startedAt.slice(0, 10) === day).map((c) => c.final!.score));
  const firstCalls = report.scored.flatMap((c) => (c.result?.stream === "first_call" ? [c.result.capture] : []));
  return {
    person,
    calls: report.calls.length,
    scored: report.scored.length,
    average: report.average,
    band: report.band,
    previousAverage,
    change: changeOf(report.average, previousAverage),
    hardFailCalls: report.hardFailCalls,
    firstCallsScored: firstCalls.length,
    vcsBooked: firstCalls.filter((c) => c.vcDateTime).length,
    avgClientSharePct: report.avgClientSharePct,
    daily: days.map(byDay),
    best: report.scored[0] ?? null,
    worst: report.scored.length > 1 ? report.scored[report.scored.length - 1] : null,
    missed: report.missedQuestions.slice(0, 3),
  };
}

export function rollup(period: Period, people: Person[], calls: CallRecord[], previousCalls: CallRecord[]): Rollup {
  const days = daysOf(period);
  const rows = people
    .filter((p) => SCORED_ROLES.includes(p.role))
    .map((p) => personRollup(p, calls, previousCalls, days))
    .filter((r) => r.calls > 0)
    // Leaderboard: best average first; people with nothing scored last.
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  const scored = calls.filter((c) => c.final);
  const average = dayAverage(scored.map((c) => c.final!.score));
  const previousAverage = dayAverage(previousCalls.filter((c) => c.final).map((c) => c.final!.score));

  const hardFailCounts = new Map<string, number>();
  for (const c of scored) for (const id of c.final!.hardFails) hardFailCounts.set(`${c.stream}:${id}`, (hardFailCounts.get(`${c.stream}:${id}`) ?? 0) + 1);
  const hardFails = [...hardFailCounts].map(([key, count]) => {
    const [stream, id] = key.split(":") as ["first_call" | "vision_call", string];
    return { id, count, label: hardFailsFor(stream).find((h) => h.id === id)?.label ?? id };
  }).sort((a, b) => b.count - a.count);

  const missed = new Map<string, { id: string; question: string; count: number }>();
  for (const p of people.filter((x) => SCORED_ROLES.includes(x.role))) {
    for (const m of personDayReport(p, calls).missedQuestions) {
      const prev = missed.get(m.id);
      missed.set(m.id, { ...m, count: (prev?.count ?? 0) + m.count });
    }
  }

  return {
    period,
    people: rows,
    calls: calls.length,
    scored: scored.length,
    average,
    band: average === null ? null : bandFor(average, 0),
    previousAverage,
    change: changeOf(average, previousAverage),
    hardFails,
    hardFailCalls: scored.filter((c) => c.final!.hardFails.length > 0).length,
    firstCallsScored: rows.reduce((s, r) => s + r.firstCallsScored, 0),
    vcsBooked: rows.reduce((s, r) => s + r.vcsBooked, 0),
    missed: [...missed.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    reviews: {
      agreed: scored.filter((c) => c.review?.verdict === "agree").length,
      corrected: scored.filter((c) => c.review?.verdict === "corrected").length,
    },
  };
}
