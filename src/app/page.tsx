import Link from "next/link";
import { Suspense } from "react";
import { BandBadge, Card, Chip, EmptyState, Loading, PageHeader, StatTile, TrendSparkline } from "@/components/ui";
import { getReportDay, listCalls, listPeople, previousDayAverages } from "@/lib/data";
import { formatClock, formatDay, hardFailLabel } from "@/lib/format";
import { teamSummary } from "@/lib/reports";
import { band, dayAverage } from "@/lib/scoring/compute";

export default function TeamPage() {
  return (
    <Suspense fallback={<Loading what="team summary" />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const day = await getReportDay();
  if (!day) return <EmptyState title="Team summary" />;
  const [people, calls, previous] = await Promise.all([listPeople(), listCalls(day), previousDayAverages(day)]);
  const team = teamSummary(people, calls, previous);
  const scored = calls.filter((c) => c.final);
  const teamAverage = dayAverage(scored.map((c) => c.final!.score));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <>
      <PageHeader title="Team summary" subtitle={`Calls from ${formatDay(day)} · sent to founders at 8 am`} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Calls scored" value={scored.length} note={`of ${calls.length} logged`} />
        <StatTile
          label="Team average"
          value={teamAverage === null ? "–" : <BandBadge score={teamAverage} band={band(teamAverage, 0)} />}
        />
        <StatTile label="Red calls" value={team.redCalls.length} note="reviewed in stand-up" />
        <StatTile label="VCs booked" value={team.vcsBooked} note={`from ${team.firstCalls} scored first calls`} />
        <StatTile
          label="Proposal dates fixed"
          value={team.proposalDatesFixed}
          note={`in ${team.visionCalls} vision call${team.visionCalls === 1 ? "" : "s"}`}
        />
      </div>

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
                return (
                  <tr key={report.person.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="font-medium">{report.person.name}</div>
                      <div className="text-xs text-muted">{report.person.title}</div>
                    </td>
                    <td className="px-2 py-3">
                      {report.average !== null && report.band ? (
                        <BandBadge score={report.average} band={report.band} />
                      ) : (
                        <Chip>No scored calls</Chip>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <TrendSparkline values={trend} />
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {report.scored.length}
                      <span className="text-muted"> / {report.calls.length}</span>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{report.hardFailCalls}</td>
                    <td className="px-2 py-3 text-xs">
                      <span className="text-muted">{conversion.label}:</span> {conversion.value}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <Link href={`/people/${report.person.id}`} className="text-sm font-medium text-brand hover:underline">
                        Report
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
            <ul className="space-y-3">
              {team.redCalls.map((call) => (
                <li key={call.id} className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/calls/${call.id}`} className="font-medium hover:underline">
                      {nameOf(call.personId)} · {call.client.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {formatClock(call.startedAt)} ·{" "}
                      {call.final!.hardFails.length
                        ? hardFailLabel(call.stream, call.final!.hardFails[0])
                        : "Score below 60"}
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
                <li key={c.name} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="tabular-nums text-muted">{c.count}</span>
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
