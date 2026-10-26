import Link from "next/link";
import { Suspense } from "react";
import { BandBadge, Card, EmptyState, Loading, PageHeader, StatTile, TrendSparkline } from "@/components/ui";
import { getActiveSheets, getReportDay, listCallsBetween, listPeople, requireMe } from "@/lib/data";
import { formatClock, formatDay } from "@/lib/format";
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
function Change({ value, against }: { value: number | null; against: string }) {
  if (value === null) return <span className="text-muted">–</span>;
  if (value === 0) return <span className="text-muted">no change vs {against}</span>;
  return (
    <span className={value > 0 ? "text-good" : "text-critical"}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value)} <span className="text-muted">vs {against}</span>
    </span>
  );
}

async function Rollups({ searchParams }: Pick<PageProps<"/rollups">, "searchParams">) {
  const me = await requireMe();
  const latest = await getReportDay();
  if (!latest) return <EmptyState title="Roll-ups" />;
  const period = periodFrom(await searchParams, latest);
  const [sheets, people, calls, previousCalls] = await Promise.all([
    getActiveSheets(),
    listPeople(),
    listCallsBetween(period.from, period.to),
    listCallsBetween(period.previous.from, period.previous.to),
  ]);
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label={me.canSeeAll ? "Team average" : "My average"}
          value={r.average === null || !r.band ? "–" : <BandBadge score={r.average} band={r.band} />}
          note={undefined}
        />
        <StatTile label={`Change vs ${period.previous.label}`} value={<Change value={r.change} against={period.previous.label} />} />
        <StatTile label="Calls scored" value={r.scored} note={`of ${r.calls} logged`} />
        <StatTile label="Hard-fail calls" value={r.hardFailCalls} note={r.hardFails[0] ? `most often: ${r.hardFails[0].label.toLowerCase()}` : "none"} />
        <StatTile label="VCs booked" value={r.vcsBooked} note={`from ${r.firstCallsScored} scored first calls`} />
      </div>

      <Card title={me.canSeeAll ? "Leaderboard" : "My calls"} className="mb-6">
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Person</th>
                <th className="px-2 py-2 text-right font-medium">Scored</th>
                <th className="px-2 py-2 font-medium">Average</th>
                <th className="px-2 py-2 font-medium">vs {period.previous.label}</th>
                <th className="px-2 py-2 text-right font-medium">Hard fails</th>
                <th className="px-2 py-2 text-right font-medium">VCs booked</th>
                <th className="px-2 py-2 text-right font-medium">Client talk</th>
                <th className="px-2 py-2 font-medium">Daily trend</th>
                <th className="px-4 py-2 font-medium sm:px-5">Best · weakest call</th>
              </tr>
            </thead>
            <tbody>
              {r.people.map((p) => (
                <tr key={p.person.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3 sm:px-5">
                    <div className="font-medium">{p.person.name}</div>
                    <div className="text-xs text-muted">{p.person.title}</div>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {p.scored}/{p.calls}
                  </td>
                  <td className="px-2 py-3">{p.average !== null && p.band ? <BandBadge score={p.average} band={p.band} /> : <span className="text-muted">–</span>}</td>
                  <td className="px-2 py-3 text-xs">
                    <Change value={p.change} against={period.previous.label} />
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{p.hardFailCalls}</td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {p.vcsBooked}
                    <span className="text-muted">/{p.firstCallsScored}</span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{p.avgClientSharePct === null ? "–" : `${p.avgClientSharePct}%`}</td>
                  <td className="px-2 py-3">
                    <TrendSparkline values={p.daily} labels={dayLabels} />
                  </td>
                  <td className="space-y-1 px-4 py-3 text-xs sm:px-5">
                    {p.best && (
                      <Link href={`/calls/${p.best.id}`} className="block hover:underline">
                        Best: {formatDay(p.best.startedAt).replace(/ \d{4}$/, "")} {formatClock(p.best.startedAt)} · {p.best.final!.score}
                      </Link>
                    )}
                    {p.worst && (
                      <Link href={`/calls/${p.worst.id}`} className="block text-muted hover:underline">
                        Weakest: {formatDay(p.worst.startedAt).replace(/ \d{4}$/, "")} {formatClock(p.worst.startedAt)} · {p.worst.final!.score}
                      </Link>
                    )}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Hard fails by type">
          {r.hardFails.length ? (
            <ul className="space-y-1 text-sm">
              {r.hardFails.map((h) => (
                <li key={h.id} className="flex justify-between gap-3">
                  <span>{h.label}</span>
                  <span className="tabular-nums text-muted">×{h.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No hard fails in this period.</p>
          )}
        </Card>
        <Card title="Mandatory questions skipped most">
          {r.missed.length ? (
            <ul className="space-y-1 text-sm">
              {r.missed.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span>{m.question}</span>
                  <span className="shrink-0 tabular-nums text-muted">{m.count} calls</span>
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
