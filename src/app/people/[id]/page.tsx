import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { BandBadge, Card, Chip, EmptyState, Loading, PageHeader, Quote, StatTile } from "@/components/ui";
import { getAdjacentDays, getPerson, getReportDay, listCalls, requireMe } from "@/lib/data";
import { formatClock, formatDay, parseDayParam } from "@/lib/format";
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
  const latest = await getReportDay();
  const day = parseDayParam((await searchParams).day) ?? latest;
  if (!day) return <EmptyState title={`${person.name}: daily QA report`} />;
  const [calls, around] = await Promise.all([listCalls(day), getAdjacentDays(day, person.id)]);
  const report = personDayReport(person, calls);

  return (
    <>
      {me.canSeeAll && (
        <Link href={day === latest ? "/" : `/?day=${day}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">
          ← Team
        </Link>
      )}
      <PageHeader
        title={`${person.name}: daily QA report`}
        subtitle={`${person.title} · calls from ${formatDay(day)} · emailed at 8 am`}
      >
        <div className="flex flex-wrap items-center gap-3">
          {report.average !== null && report.band && <BandBadge score={report.average} band={report.band} />}
          <DayNav path={`/people/${person.id}`} day={day} latest={latest} {...around} />
        </div>
      </PageHeader>

      <h2 className="mb-3 text-sm font-semibold">The day in numbers</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Calls reviewed" value={report.scored.length} note={`${report.totalMinutes} min across ${report.calls.length} calls`} />
        <StatTile label="Hard fails" value={report.hardFailCalls} />
        <StatTile label="Recording missing" value={report.notRecorded} note="flagged, not scored" />
        <StatTile label="Logged only" value={report.notScored} note="under 2 min or declined" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Conversion">
          <dl className="space-y-2 text-sm">
            {report.conversion.map((c) => (
              <div key={c.label} className="flex justify-between gap-4">
                <dt className="text-muted">{c.label}</dt>
                <dd className="tabular-nums">{c.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Coverage">
          <dl className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Client talk time (average)</dt>
              <dd className="tabular-nums">{report.avgClientSharePct === null ? "–" : `${report.avgClientSharePct}%`}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Call length (average)</dt>
              <dd className="tabular-nums">{report.avgLengthMin === null ? "–" : `${report.avgLengthMin} min`}</dd>
            </div>
          </dl>
          <h3 className="mb-1 text-xs text-muted">Mandatory questions missed</h3>
          {report.missedQuestions.length === 0 ? (
            <p className="text-sm">None missed.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {report.missedQuestions.map((q) => (
                <li key={q.id} className="flex justify-between gap-4">
                  <span>{q.question}</span>
                  <span className="tabular-nums text-muted">×{q.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Two strengths">
          {report.strengths.length === 0 ? (
            <p className="text-sm text-muted">No scored calls.</p>
          ) : (
            <ul className="space-y-3">
              {report.strengths.map((s, i) => (
                <li key={i}>
                  <div className="text-sm">{s.text}</div>
                  <Quote evidence={s.evidence} />{" "}
                  <Link href={`/calls/${s.callId}`} className="text-xs text-brand hover:underline">
                    Hear it
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Two fixes">
          {report.fixes.length === 0 ? (
            <p className="text-sm text-muted">No scored calls.</p>
          ) : (
            <ul className="space-y-3">
              {report.fixes.map((f, i) => (
                <li key={i}>
                  <div className="text-sm">{f.text}</div>
                  <Quote evidence={f.evidence} />{" "}
                  <Link href={`/calls/${f.callId}`} className="text-xs text-brand hover:underline">
                    Hear it
                  </Link>
                  <div className="mt-1 rounded-md bg-background px-3 py-2 text-sm">
                    <span className="text-muted">Better line: </span>
                    {f.betterLine}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tomorrow's one thing">
          <p className="text-sm">{report.tomorrow ?? "No scored calls that day."}</p>
        </Card>
        <Card title="Best call of the day">
          {report.bestCall ? (
            <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
              <div>
                <Link href={`/calls/${report.bestCall.call.id}`} className="font-medium hover:underline">
                  {report.bestCall.call.client.name} at {formatClock(report.bestCall.call.startedAt)}
                </Link>
                <p className="text-muted">{report.bestCall.why}</p>
              </div>
              <BandBadge score={report.bestCall.call.final!.score} band={report.bestCall.call.final!.band} />
            </div>
          ) : (
            <Chip>No scored calls</Chip>
          )}
        </Card>
      </div>
    </>
  );
}
