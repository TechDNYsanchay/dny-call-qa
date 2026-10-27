import Link from "next/link";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { Avatar, Card, DownloadButton, EmptyState, Loading, PageHeader, ScoreFigure, StatTile, StatusLabel } from "@/components/ui";
import type { CallRecord } from "@/lib/data";
import { getAdjacentDays, getFirstDay, getReportDay, listCalls, listPeople, requireMe } from "@/lib/data";
import { formatClock, formatDay, formatDuration, formatPhone, IN_PROGRESS_LABEL, NOT_SCORED_LABEL, parseDayParam, STREAM_LABEL } from "@/lib/format";
import { band, dayAverage, MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";

export const metadata = { title: "Calls · DNY Sales Agent" };

export default function CallsPage({ searchParams }: PageProps<"/calls">) {
  return (
    <Suspense fallback={<Loading what="calls" />}>
      <Calls searchParams={searchParams} />
    </Suspense>
  );
}

async function Calls({ searchParams }: Pick<PageProps<"/calls">, "searchParams">) {
  const me = await requireMe();
  const title = me.canSeeAll ? "Calls" : "My calls";
  const query = await searchParams;
  const requested = parseDayParam(query.day);
  // Scored only: the table shows scored calls and the day buttons skip days without any.
  const scoredOnly = query.scored === "1";
  const [latest, first] = await Promise.all([getReportDay(scoredOnly), getFirstDay()]);
  const day = requested ?? latest;
  if (!day) {
    return scoredOnly ? (
      <>
        <PageHeader title={title}>
          <ScoredSwitch scoredOnly day={null} />
        </PageHeader>
        <Card>
          <p className="py-6 text-center text-sm text-muted">No calls have been scored yet.</p>
        </Card>
      </>
    ) : (
      <EmptyState title={title} />
    );
  }
  const [allCalls, people, around] = await Promise.all([listCalls(day), listPeople(), getAdjacentDays(day, null, scoredOnly)]);
  const calls = scoredOnly ? allCalls.filter((c) => c.final) : allCalls;
  const scored = allCalls.filter((c) => c.final);
  const average = dayAverage(scored.map((c) => c.final!.score));
  const connected = allCalls.filter((c) => c.durationSec > 0).length;
  const eligible = allCalls.filter((c) => c.durationSec >= MIN_SCORED_DURATION_SEC).length;
  const missed = allCalls.filter((c) => c.direction === "missed" || c.direction === "rejected").length;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          scoredOnly
            ? `${calls.length} scored of ${allCalls.length} calls on ${formatDay(day)}`
            : `${calls.length} calls logged on ${formatDay(day)}`
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <DownloadButton href={`/api/export/calls?day=${day}`} />
          <ScoredSwitch scoredOnly={scoredOnly} day={requested} />
          <DayNav path="/calls" day={day} first={first} latest={latest} params={scoredOnly ? { scored: "1" } : {}} {...around} />
        </div>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Calls logged" value={allCalls.length} note={`${connected} connected`} />
        <StatTile label="Scored" value={scored.length} note={`${eligible} lasted 2 minutes or more`} />
        <StatTile label="Day average" value={average === null ? <span className="text-muted">–</span> : <ScoreFigure score={average} band={band(average, 0)} />} />
        <StatTile
          label="Missed or rejected"
          value={missed ? <StatusLabel band="red">{missed}</StatusLabel> : <span className="text-good-ink">0</span>}
          note={
            <Link href="/follow-ups" className="hover:text-foreground hover:underline">
              Returned or not: see follow-ups →
            </Link>
          }
        />
      </div>

      <Card>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="whitespace-nowrap text-left text-xs text-muted lg:whitespace-normal">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Time</th>
                {me.canSeeAll && <th className="px-2 py-2 font-medium">Person</th>}
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-2 py-2 text-right font-medium">Length</th>
                <th className="px-4 py-2 font-medium sm:px-5">Result</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const person = people.find((p) => p.id === call.personId);
                // Callyzer often knows only the number; scoring captures the name the client gave.
                const spoken = call.result?.stream === "first_call" ? call.result.capture.clientName : null;
                const onlyNumber = call.clientPhone !== undefined && call.client.name === formatPhone(call.clientPhone);
                const name = onlyNumber && spoken ? spoken : call.client.name;
                return (
                  <tr key={call.id} className="border-b border-border align-middle transition-colors last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 sm:px-5">
                      <Link href={`/calls/${call.id}`} className="font-semibold tabular-nums hover:underline">
                        {formatClock(call.startedAt)}
                      </Link>
                      <div className="mt-0.5">
                        <Direction direction={call.direction} />
                      </div>
                    </td>
                    {me.canSeeAll && (
                      <td className="px-2 py-3">
                        {person ? (
                          <div className="flex items-center gap-2.5">
                            <Avatar name={person.name} />
                            <span>{person.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">Not on the team list{call.agentPhone ? ` (${call.agentPhone})` : ""}</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-3">
                      {/* Saved contact names can carry notes; one line, full name on hover. */}
                      <Link href={`/calls/${call.id}`} title={name} className="block max-w-xs truncate font-medium hover:underline">
                        {name}
                      </Link>
                      <div className="text-xs text-muted">
                        {[name !== call.client.name ? call.client.name : null, call.client.city, STREAM_LABEL[call.stream]].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {call.durationSec > 0 ? formatDuration(call.durationSec) : <span className="text-muted">–</span>}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      {call.final ? (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <ScoreFigure score={call.final.score} band={call.final.band} size="md" />
                          <div className="space-y-0.5 text-xs">
                            {call.final.hardFails.length > 0 && <div className="text-critical-ink">Hard fail</div>}
                            {call.dispute && !call.dispute.resolvedAt && <div className="font-medium text-warning-ink">⚑ Disputed</div>}
                            {call.review && <div className="text-muted">{call.review.verdict === "agree" ? "✓ Reviewed" : "Corrected by a founder"}</div>}
                          </div>
                        </div>
                      ) : call.durationSec === 0 ? (
                        <span className="text-xs text-muted">Not connected</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs ${call.inProgress === "transcription_failed" ? "text-critical-ink" : "text-muted"}`}>
                          <span className={`size-1.5 rounded-full ${call.inProgress ? (call.inProgress === "transcription_failed" ? "bg-critical" : "bg-brand") : "bg-chart-muted"}`} aria-hidden="true" />
                          {call.notScored === "under_2_min" ? "Under 2 min, not scored" : call.notScored ? NOT_SCORED_LABEL[call.notScored] : call.inProgress ? IN_PROGRESS_LABEL[call.inProgress] : "Not scored"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={me.canSeeAll ? 5 : 4} className="px-4 py-8 text-center text-muted sm:px-5">
                    {scoredOnly ? "No scored calls on this day." : "No calls logged on this day."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/** "All calls | Scored only". Keeps a chosen day; without one, each view opens on its own latest day. */
function ScoredSwitch({ scoredOnly, day }: { scoredOnly: boolean; day: string | null }) {
  const href = (scored: boolean) => {
    const query = new URLSearchParams();
    if (scored) query.set("scored", "1");
    if (day) query.set("day", day);
    const qs = query.toString();
    return qs ? `/calls?${qs}` : "/calls";
  };
  const option = (active: boolean) =>
    `px-2.5 py-1 ${active ? "bg-background font-medium text-foreground" : "text-muted hover:text-foreground"}`;
  return (
    <div role="group" aria-label="Which calls" className="inline-flex overflow-hidden rounded-md border border-border bg-surface text-sm">
      <Link href={href(false)} aria-current={!scoredOnly ? "true" : undefined} className={option(!scoredOnly)}>
        All calls
      </Link>
      <Link href={href(true)} aria-current={scoredOnly ? "true" : undefined} className={`border-l border-border ${option(scoredOnly)}`}>
        Scored only
      </Link>
    </div>
  );
}

const ARROW = { in: "M9 3 3 9M3 4.5V9h4.5", out: "M3 9 9 3M4.5 3H9v4.5" } as const;

/** Incoming or outgoing with an arrow; missed and rejected in red, since someone should call back. */
function Direction({ direction }: { direction: CallRecord["direction"] }) {
  if (!direction || direction === "other") return null;
  const missed = direction === "missed" || direction === "rejected";
  const label = { incoming: "Incoming", outgoing: "Outgoing", missed: "Missed", rejected: "Rejected" }[direction];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${missed ? "text-critical-ink" : "text-muted"}`}>
      <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
        <path d={direction === "outgoing" ? ARROW.out : ARROW.in} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}
