import Link from "next/link";
import { Suspense } from "react";
import { PickupChart, ResponseCard } from "@/components/call-patterns";
import { FunnelChart } from "@/components/funnel";
import { Avatar, Card, EmptyState, Loading, PageHeader, ScoreFigure, StatTile, StatusLabel, TrendSparkline } from "@/components/ui";
import { missedResponses, pickupByHour } from "@/lib/call-patterns";
import { getActiveSheets, getReportDay, getTeamPhones, listCallsBetween, listPeople, requireMe, teamNames, type CallRecord } from "@/lib/data";
import { addDays, formatClock, formatDay } from "@/lib/format";
import { daysOf, monthPeriod, rollup, weekPeriod, type Period } from "@/lib/rollups";

export const metadata = { title: "Roll-ups · DNY Sales Agent" };

export default function RollupsPage({ searchParams }: PageProps<"/rollups">) {
  return (
    <Suspense fallback={<Loading what="roll-up" />}>
      <Rollups searchParams={searchParams} />
    </Suspense>
  );
}

function periodFrom(query: { week?: string | string[]; month?: string | string[] }, latest: string): Period {
  if (typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month)) return monthPeriod(query.month);
  if (typeof query.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.week)) return weekPeriod(query.week);
  return weekPeriod(latest);
}

/** "▲ 4.5" / "▼ 3" against the previous period: an arrow and a sign, never colour alone. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">–</span>;
  if (value === 0) return <span className="text-muted">No change</span>;
  return (
    <span className={`font-semibold tabular-nums ${value > 0 ? "text-good-ink" : "text-critical-ink"}`}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}

/** "Best · 23 Oct 14:41 · 72.5" with the score in its band's colour. */
function CallLink({ label, call }: { label: string; call: CallRecord }) {
  return (
    <Link href={`/calls/${call.id}`} className="flex items-center gap-1.5 whitespace-nowrap hover:underline">
      <span className="w-14 text-muted">{label}</span>
      <span>
        {formatDay(call.startedAt).replace(/ \d{4}$/, "")} {formatClock(call.startedAt)}
      </span>
      <StatusLabel band={call.final!.band}>{call.final!.score}</StatusLabel>
    </Link>
  );
}

async function Rollups({ searchParams }: Pick<PageProps<"/rollups">, "searchParams">) {
  const me = await requireMe();
  const latest = await getReportDay();
  if (!latest) return <EmptyState title="Roll-ups" />;
  const period = periodFrom(await searchParams, latest);
  // Calls back can land a few days after a miss, so look a little past the period's end.
  const lookAhead = addDays(period.to, 3) < latest ? addDays(period.to, 3) : latest > period.to ? latest : period.to;
  const [sheets, people, calls, previousCalls, withAfter, phones, names] = await Promise.all([
    getActiveSheets(),
    listPeople(),
    listCallsBetween(period.from, period.to),
    listCallsBetween(period.previous.from, period.previous.to),
    listCallsBetween(period.from, lookAhead),
    getTeamPhones(),
    teamNames(),
  ]);
  const pickup = pickupByHour(calls);
  const responses = missedResponses(withAfter, phones).filter((r) => r.missedAt.slice(0, 10) >= period.from && r.missedAt.slice(0, 10) <= period.to);
  const r = rollup(period, people, calls, previousCalls, sheets.questions);
  const days = daysOf(period);
  const dayLabels = days.map((d) => formatDay(d).replace(/ \d{4}$/, ""));
  const hasNext = period.next !== null && period.next.from <= latest;
  const prevQuery = period.kind === "week" ? `week=${period.previous.from}` : `month=${period.previous.from.slice(0, 7)}`;
  const nextQuery = period.next && (period.kind === "week" ? `week=${period.next.from}` : `month=${period.next.from.slice(0, 7)}`);
  const button = "inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-background";
  const option = (active: boolean) => `px-2.5 py-1 ${active ? "bg-background font-medium" : "text-muted hover:text-foreground"}`;

  return (
    <>
      <PageHeader
        title={me.canSeeAll ? `${period.kind === "week" ? "Weekly" : "Monthly"} roll-up` : `My ${period.kind === "week" ? "week" : "month"}`}
        subtitle={`${period.label} · ${r.scored} of ${r.calls} calls scored`}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <nav aria-label="Period length" className="inline-flex overflow-hidden rounded-md border border-border bg-surface">
            <Link href={`/rollups?week=${period.kind === "week" ? period.from : latest}`} aria-current={period.kind === "week" ? "true" : undefined} className={option(period.kind === "week")}>
              Week
            </Link>
            <Link href={`/rollups?month=${(period.kind === "month" ? period.from : latest).slice(0, 7)}`} aria-current={period.kind === "month" ? "true" : undefined} className={`border-l border-border ${option(period.kind === "month")}`}>
              Month
            </Link>
          </nav>
          <Link href={`/rollups?${prevQuery}`} className={button}>
            ← Earlier
          </Link>
          {hasNext && nextQuery ? (
            <Link href={`/rollups?${nextQuery}`} className={button}>
              Later →
            </Link>
          ) : (
            <span className={`${button} text-muted opacity-60`}>Later →</span>
          )}
        </div>
      </PageHeader>

      {/* Five tiles: on two columns the last one spans the row instead of sitting alone. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <StatTile
          label={me.canSeeAll ? "Team average" : "My average"}
          value={r.average === null || !r.band ? <span className="text-muted">–</span> : <ScoreFigure score={r.average} band={r.band} />}
        />
        <StatTile
          label={`Change vs ${period.previous.label}`}
          value={<Change value={r.change} />}
          note={r.previousAverage === null ? `nothing scored ${period.previous.label}` : `${period.previous.label}: ${r.previousAverage}`}
        />
        <StatTile label="Calls scored" value={r.scored} note={`of ${r.calls} logged`} />
        <StatTile
          label="Hard-fail calls"
          value={r.hardFailCalls ? <StatusLabel band="red">{r.hardFailCalls}</StatusLabel> : <span className="text-good-ink">0</span>}
          note={r.hardFails[0] ? `most often: ${r.hardFails[0].label.toLowerCase()}` : "none"}
        />
        <StatTile label="VCs booked" value={r.vcsBooked} note={`from ${r.firstCallsScored} scored first calls`} />
      </div>

      <Card title={me.canSeeAll ? "Leaderboard" : "My calls"} className="mb-6">
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Person</th>
                <th className="px-2 py-2 font-medium">Average</th>
                <th className="px-2 py-2 font-medium">vs {period.previous.label}</th>
                <th className="px-2 py-2 text-right font-medium">Scored</th>
                <th className="px-2 py-2 text-right font-medium">Hard fails</th>
                <th className="px-2 py-2 text-right font-medium">VCs booked</th>
                <th className="px-2 py-2 font-medium">Client talk</th>
                <th className="px-2 py-2 font-medium">Daily trend</th>
                <th className="px-4 py-2 font-medium sm:px-5">Best · weakest call</th>
              </tr>
            </thead>
            <tbody>
              {r.people.map((p, rank) => (
                <tr key={p.person.id} className="border-b border-border align-middle transition-colors last:border-0 hover:bg-background/60">
                  <td className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-center gap-3">
                      {me.canSeeAll && <span className="w-4 text-right text-xs tabular-nums text-muted">{rank + 1}</span>}
                      <Avatar name={p.person.name} />
                      <div className="min-w-0">
                        <div className="font-medium">{p.person.name}</div>
                        <div className="text-xs text-muted">{p.person.title}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3.5">
                    {p.average !== null && p.band ? <ScoreFigure score={p.average} band={p.band} size="md" /> : <span className="text-xs text-muted">Nothing scored</span>}
                  </td>
                  <td className="px-2 py-3.5 text-xs">
                    <Change value={p.change} />
                  </td>
                  <td className="px-2 py-3.5 text-right tabular-nums">
                    <span className="font-medium">{p.scored}</span>
                    <span className="text-muted"> / {p.calls}</span>
                  </td>
                  <td className="px-2 py-3.5 text-right tabular-nums">
                    {p.hardFailCalls ? <StatusLabel band="red">{p.hardFailCalls}</StatusLabel> : <span className="text-muted">0</span>}
                  </td>
                  <td className="px-2 py-3.5 text-right tabular-nums">
                    <span className="font-medium">{p.vcsBooked}</span>
                    <span className="text-muted"> / {p.firstCallsScored}</span>
                  </td>
                  <td className="px-2 py-3.5">
                    {p.avgClientSharePct === null ? (
                      <span className="text-muted">–</span>
                    ) : (
                      // How much the clients talked: the brief wants half or more.
                      <span className="inline-flex flex-col gap-1.5" title="Share of the call the client talked; half or more is the aim">
                        <span className="tabular-nums">{p.avgClientSharePct}%</span>
                        <span className="relative block h-1 w-16 overflow-hidden rounded-full bg-border">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-chart-muted" style={{ width: `${p.avgClientSharePct}%` }} />
                          <span className="absolute inset-y-0 left-1/2 w-0.5 bg-surface" />
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3.5">
                    {p.daily.some((v) => v !== null) ? <TrendSparkline values={p.daily} labels={dayLabels} band={p.band} /> : <span className="text-muted">–</span>}
                  </td>
                  <td className="space-y-1 px-4 py-3.5 text-xs sm:px-5">
                    {p.best && <CallLink label="Best" call={p.best} />}
                    {p.worst && <CallLink label="Weakest" call={p.worst} />}
                  </td>
                </tr>
              ))}
              {r.people.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted sm:px-5">
                    No calls in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={me.canSeeAll ? "Lead funnel" : "My lead funnel"}>
          <FunnelChart funnel={r.funnel} />
        </Card>

        <Card title={me.canSeeAll ? `Call of the ${period.kind}` : `My best call this ${period.kind}`}>
          {r.callOfPeriod ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={people.find((p) => p.id === r.callOfPeriod!.personId)?.name ?? ""} />
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{people.find((p) => p.id === r.callOfPeriod!.personId)?.name ?? "Unknown"}</div>
                  <div className="truncate text-xs text-muted" title={r.callOfPeriod.client.name}>
                    with {r.callOfPeriod.client.name} · {formatDay(r.callOfPeriod.startedAt).replace(/ \d{4}$/, "")}, {formatClock(r.callOfPeriod.startedAt)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <ScoreFigure score={r.callOfPeriod.final!.score} band={r.callOfPeriod.final!.band} />
                <Link
                  href={`/calls/${r.callOfPeriod.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
                >
                  Listen to the call <span aria-hidden="true">→</span>
                </Link>
              </div>
              {me.canSeeAll && <p className="text-xs text-muted">The highest-scoring call that isn&apos;t Red. The whole team can hear it from the Examples page and the {period.kind}ly email.</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">No call scored Amber or Green in this {period.kind}.</p>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="When clients pick up">
          <PickupChart hours={pickup} />
        </Card>
        <Card title="Response to missed calls">
          <ResponseCard responses={responses} nameOf={(id) => names.get(id) ?? "A number not on the team list"} showPeople={me.canSeeAll} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Hard fails by type">
          {r.hardFails.length ? (
            <ul className="divide-y divide-border text-sm">
              {r.hardFails.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <StatusLabel band="red">
                    <span className="font-normal text-foreground">{h.label}</span>
                  </StatusLabel>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs tabular-nums text-muted">×{h.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No hard fails in this period.</p>
          )}
        </Card>
        <Card title="Mandatory questions skipped most">
          {r.missed.length ? (
            <ul className="space-y-3 text-sm">
              {r.missed.map((m) => (
                <li key={m.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{m.question}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {m.count} of {r.scored} call{r.scored === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <span className="block h-full rounded-full bg-chart-muted" style={{ width: `${r.scored ? Math.min(100, (m.count / r.scored) * 100) : 0}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">None skipped.</p>
          )}
          {me.canSeeAll && (r.reviews.agreed > 0 || r.reviews.corrected > 0) && (
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
              Founders reviewed {r.reviews.agreed + r.reviews.corrected} of these scores: agreed with {r.reviews.agreed}, corrected {r.reviews.corrected}.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
