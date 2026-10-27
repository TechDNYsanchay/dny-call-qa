import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { Avatar, BandBadge, Card, EmptyState, Loading, PageHeader, ScoreFigure, StatTile, StatusLabel, TrendSparkline } from "@/components/ui";
import { getActiveSheets, getAdjacentDays, getFirstDay, getReportDay, listCalls, listOpenDisputes, listPeople, previousDayAverages, requireMe } from "@/lib/data";
import { formatClock, formatDay, hardFailLabel, parseDayParam } from "@/lib/format";
import { teamSummary } from "@/lib/reports";
import { band, dayAverage } from "@/lib/scoring/compute";

export default function TeamPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading what="team summary" />}>
      <Team searchParams={searchParams} />
    </Suspense>
  );
}

async function Team({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const me = await requireMe();
  const requested = parseDayParam((await searchParams).day);
  if (!me.canSeeAll) redirect(`/people/${me.id}${requested ? `?day=${requested}` : ""}`);
  const [latest, first] = await Promise.all([getReportDay(), getFirstDay()]);
  const day = requested ?? latest;
  if (!day) return <EmptyState title="Team summary" />;
  const [people, calls, previous, around, sheets, disputes] = await Promise.all([
    listPeople(),
    listCalls(day),
    previousDayAverages(day),
    getAdjacentDays(day),
    getActiveSheets(),
    listOpenDisputes(),
  ]);
  const team = teamSummary(people, calls, previous, sheets.questions);
  const scored = calls.filter((c) => c.final);
  const teamAverage = dayAverage(scored.map((c) => c.final!.score));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <>
      <PageHeader title="Team summary" subtitle={`Calls from ${formatDay(day)} · sent to founders at 8 am`}>
        <DayNav path="/" day={day} first={first} latest={latest} {...around} />
      </PageHeader>

      {/* Five tiles: on two columns the last one spans the row instead of sitting alone. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <StatTile label="Calls scored" value={scored.length} note={`of ${calls.length} logged`} />
        <StatTile
          label="Team average"
          value={teamAverage === null ? <span className="text-muted">–</span> : <ScoreFigure score={teamAverage} band={band(teamAverage, 0)} />}
        />
        <StatTile
          label="Red calls"
          value={team.redCalls.length ? <StatusLabel band="red">{team.redCalls.length}</StatusLabel> : <span className="text-good-ink">0</span>}
          note="reviewed in stand-up"
        />
        <StatTile label="VCs booked" value={team.vcsBooked} note={`from ${team.firstCalls} scored first calls`} />
        <StatTile
          label="Proposal dates fixed"
          value={team.proposalDatesFixed}
          note={`in ${team.visionCalls} vision call${team.visionCalls === 1 ? "" : "s"}`}
        />
      </div>

      {disputes.length > 0 && (
        <Card title={`Disputed scores to review (${disputes.length})`} className="mb-6 border-brand/50">
          <ul className="divide-y divide-border">
            {disputes.map((call) => (
              <li key={call.id} className="flex flex-wrap items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/calls/${call.id}`} className="font-medium hover:underline">
                    {nameOf(call.personId)} · {call.client.name} · {formatDay(call.startedAt).replace(/ \d{4}$/, "")} {formatClock(call.startedAt)}
                  </Link>
                  <p className="text-sm text-muted">“{call.dispute!.comment}”</p>
                </div>
                <BandBadge score={call.final!.score} band={call.final!.band} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="People" className="mb-6">
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Person</th>
                <th className="px-2 py-2 font-medium">Day average</th>
                <th className="px-2 py-2 font-medium">7 days</th>
                <th className="px-2 py-2 text-right font-medium">Scored</th>
                <th className="px-2 py-2 text-right font-medium">Hard fails</th>
                <th className="px-2 py-2 font-medium">Conversion</th>
                <th className="px-4 py-2 sm:px-5" />
              </tr>
            </thead>
            <tbody>
              {team.rows.map(({ report, trend }) => {
                const conversion = report.conversion[1] ?? report.conversion[0];
                const href = day === latest ? `/people/${report.person.id}` : `/people/${report.person.id}?day=${day}`;
                const days = trend.filter((v) => v !== null).length;
                return (
                  <tr key={report.person.id} className="border-b border-border transition-colors last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3.5 sm:px-5">
                      <div className="flex items-center gap-3">
                        <Avatar name={report.person.name} />
                        <div className="min-w-0">
                          <Link href={href} className="font-medium hover:underline">
                            {report.person.name}
                          </Link>
                          <div className="text-xs text-muted">{report.person.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3.5">
                      {report.average !== null && report.band ? (
                        <ScoreFigure score={report.average} band={report.band} size="md" />
                      ) : (
                        <span className="text-xs text-muted">No scored calls</span>
                      )}
                    </td>
                    <td className="px-2 py-3.5">
                      {days >= 2 ? <TrendSparkline values={trend} band={report.band} /> : <span className="text-xs text-muted">Trend after 2 days</span>}
                    </td>
                    <td className="px-2 py-3.5 text-right tabular-nums">
                      <span className="font-medium">{report.scored.length}</span>
                      <span className="text-muted"> / {report.calls.length}</span>
                    </td>
                    <td className="px-2 py-3.5 text-right tabular-nums">
                      {report.hardFailCalls ? <StatusLabel band="red">{report.hardFailCalls}</StatusLabel> : <span className="text-muted">0</span>}
                    </td>
                    <td className="px-2 py-3.5 text-xs">
                      <span className="text-muted">{conversion.label}:</span> <span className="font-medium">{conversion.value}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right sm:px-5">
                      <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background">
                        Report <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Red calls">
          {team.redCalls.length === 0 ? (
            <p className="text-sm text-muted">No red calls.</p>
          ) : (
            <ul className="divide-y divide-border">
              {team.redCalls.map((call) => (
                <li key={call.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/calls/${call.id}`} className="font-medium hover:underline">
                      {nameOf(call.personId)} · {call.client.name}
                    </Link>
                    <div className="text-xs">
                      <span className="text-muted">{formatClock(call.startedAt)} · </span>
                      {call.final!.hardFails.length ? (
                        <>
                          <span className="text-muted">Hard fail · </span>
                          <span className="text-critical-ink">{hardFailLabel(call.stream, call.final!.hardFails[0])}</span>
                        </>
                      ) : (
                        <span className="text-muted">Score below 60</span>
                      )}
                    </div>
                  </div>
                  <BandBadge score={call.final!.score} band={call.final!.band} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Case studies shared">
          {team.caseStudies.length === 0 ? (
            <p className="text-sm text-muted">None mentioned.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {team.caseStudies.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">{c.name}</span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs tabular-nums text-muted">×{c.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            Sales targets are not loaded yet, so the line on where the team is short of target will appear once they are.
          </p>
        </Card>
      </div>
    </>
  );
}
