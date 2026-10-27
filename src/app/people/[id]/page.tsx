import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DayNav } from "@/components/day-nav";
import { Avatar, Card, EmptyState, Loading, Quote, ScoreFigure, StatTile, StatusLabel } from "@/components/ui";
import { getActiveSheets, getAdjacentDays, getFirstDay, getPerson, getReportDay, listCalls, requireMe } from "@/lib/data";
import { formatClock, formatDay, formatDuration, hardFailLabel, parseDayParam } from "@/lib/format";
import { personDayReport } from "@/lib/reports";

export default function PersonReportPage({ params, searchParams }: PageProps<"/people/[id]">) {
  return (
    <Suspense fallback={<Loading what="report" />}>
      <PersonReport params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PersonReport({ params, searchParams }: Pick<PageProps<"/people/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const me = await requireMe();
  const person = await getPerson(id);
  if (!person) notFound();
  const [latest, first] = await Promise.all([getReportDay(), getFirstDay()]);
  const day = parseDayParam((await searchParams).day) ?? latest;
  if (!day) return <EmptyState title={`${person.name}: daily QA report`} />;
  const [calls, around, sheets] = await Promise.all([listCalls(day), getAdjacentDays(day, person.id), getActiveSheets()]);
  const report = personDayReport(person, calls, sheets.questions);
  const scoredInOrder = [...report.scored].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return (
    <>
      {me.canSeeAll && (
        <Link href={day === latest ? "/" : `/?day=${day}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">
          ← Team
        </Link>
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={person.name} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{person.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {person.title} · daily QA report for {formatDay(day)} · emailed at 8 am
            </p>
          </div>
        </div>
        <DayNav path={`/people/${person.id}`} day={day} first={first} latest={latest} {...around} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Day average" value={report.average !== null && report.band ? <ScoreFigure score={report.average} band={report.band} /> : <span className="text-muted">–</span>} />
        <StatTile label="Calls scored" value={report.scored.length} note={`of ${report.calls.length} logged · ${report.totalMinutes} min on calls`} />
        <StatTile
          label="Hard fails"
          value={report.hardFailCalls ? <StatusLabel band="red">{report.hardFailCalls}</StatusLabel> : <span className="text-good-ink">0</span>}
          note={report.hardFailCalls ? "calls that are Red whatever the score" : "none today"}
        />
        <StatTile label="Not scored" value={report.notRecorded + report.notScored} note={`${report.notRecorded} recording missing · ${report.notScored} under 2 min or not sales`} />
      </div>

      {report.tomorrow && (
        <div className="mb-6 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3.5 sm:px-5">
          <div className="mb-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-brand">Tomorrow&apos;s one thing</div>
          <p className="text-base">{report.tomorrow}</p>
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">
            <StatusLabel band="green">What went well</StatusLabel>
          </h2>
          {report.strengths.length === 0 ? (
            <p className="text-sm text-muted">No scored calls.</p>
          ) : (
            <ul className="space-y-4">
              {report.strengths.map((s, i) => (
                <li key={i}>
                  <div className="text-sm">{s.text}</div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Quote evidence={s.evidence} />
                    <HearIt href={`/calls/${s.callId}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">
            <StatusLabel band="amber">Fix next</StatusLabel>
          </h2>
          {report.fixes.length === 0 ? (
            <p className="text-sm text-muted">No scored calls.</p>
          ) : (
            <ul className="space-y-4">
              {report.fixes.map((f, i) => (
                <li key={i}>
                  <div className="text-sm">{f.text}</div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Quote evidence={f.evidence} />
                    <HearIt href={`/calls/${f.callId}`} />
                  </div>
                  <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <div className="mb-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-muted">Better line</div>
                    {f.betterLine}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Scored calls">
          {scoredInOrder.length === 0 ? (
            <p className="text-sm text-muted">No scored calls that day.</p>
          ) : (
            <ul className="-mx-4 divide-y divide-border border-t border-border sm:-mx-5">
              {scoredInOrder.map((c) => {
                const spoken = c.result?.stream === "first_call" ? c.result.capture.clientName : null;
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-background/60 sm:px-5">
                    <div className="min-w-0 text-sm">
                      <Link href={`/calls/${c.id}`} className="block max-w-xs truncate font-medium hover:underline" title={c.client.name}>
                        {spoken ?? c.client.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {formatClock(c.startedAt)} · {formatDuration(c.durationSec)}
                        {c.final!.hardFails.length > 0 && <span className="text-critical-ink"> · {hardFailLabel(c.stream, c.final!.hardFails[0])}</span>}
                      </div>
                    </div>
                    <ScoreFigure score={c.final!.score} band={c.final!.band} size="md" />
                  </li>
                );
              })}
            </ul>
          )}
          {report.bestCall && (
            <div className="mt-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">Best call of the day</div>
              <Link href={`/calls/${report.bestCall.call.id}`} className="font-medium hover:underline">
                {report.bestCall.call.client.name} at {formatClock(report.bestCall.call.startedAt)}
              </Link>
              <p className="text-xs text-muted">{report.bestCall.why}</p>
            </div>
          )}
        </Card>

        <Card title="Coverage and conversion">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Measure
              label="Client talk time"
              value={report.avgClientSharePct === null ? "–" : `${report.avgClientSharePct}%`}
              note="average · half or more is the aim"
              bar={report.avgClientSharePct === null ? undefined : { value: report.avgClientSharePct / 100, marks: [0.5] }}
            />
            <Measure
              label="Call length"
              value={report.avgLengthMin === null ? "–" : `${report.avgLengthMin} min`}
              note="average · 6 to 10 minutes is the aim"
              bar={report.avgLengthMin === null ? undefined : { value: Math.min(1, report.avgLengthMin / 15), marks: [6 / 15, 10 / 15] }}
            />
          </div>
          <dl className="mb-4 space-y-1.5 text-sm">
            {report.conversion.map((c) => (
              <div key={c.label} className="flex justify-between gap-4">
                <dt className="text-muted">{c.label}</dt>
                <dd className="font-medium tabular-nums">{c.value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mb-2 text-xs font-medium text-muted">Mandatory questions missed</h3>
          {report.missedQuestions.length === 0 ? (
            <p className="text-sm">
              <StatusLabel band="green">None missed</StatusLabel>
            </p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {report.missedQuestions.map((q) => (
                <li key={q.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span>{q.question}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {q.count} of {report.scored.length}
                    </span>
                  </div>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <span className="block h-full rounded-full bg-chart-muted" style={{ width: `${report.scored.length ? (q.count / report.scored.length) * 100 : 0}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function HearIt({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-background">
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
        <path d="M3.5 2.2v7.6L9.6 6Z" fill="currentColor" />
      </svg>
      Hear it
    </Link>
  );
}

/** A measurement tile: the figure, what to aim for, and a bar with target marks. */
function Measure({ label, value, note, bar }: { label: string; value: ReactNode; note: string; bar?: { value: number; marks: number[] } }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {bar && (
        <span className="relative mt-2 block h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full bg-chart-muted" style={{ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }} />
          {bar.marks.map((m) => (
            <span key={m} className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${m * 100}%` }} />
          ))}
        </span>
      )}
      <div className="mt-1 text-[0.7rem] text-muted">{note}</div>
    </div>
  );
}
