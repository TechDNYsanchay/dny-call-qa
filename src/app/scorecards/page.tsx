import { Suspense } from "react";
import { Card, LevelStatus, PageHeader, StatTile, StatusLabel } from "@/components/ui";
import { getActiveSheets, getCalibration, requireMe } from "@/lib/data";
import Link from "next/link";
import type { Stream } from "@/lib/scoring/call-sheets";
import { AMBER_FROM, GREEN_FROM } from "@/lib/scoring/compute";
import { areasFor, hardFailsFor, RUBRIC_VERSION } from "@/lib/scoring/scorecards";

export const metadata = { title: "Scorecards · DNY Sales Agent" };

const STREAMS: { stream: Stream; title: string }[] = [
  { stream: "first_call", title: "First Calls Executive" },
  { stream: "vision_call", title: "Lead Consultant, Sales: vision call" },
];

export default function ScorecardsPage() {
  return (
    <>
      <PageHeader title="Scorecards" subtitle={`What every call is scored against · rubric ${RUBRIC_VERSION}, from the brief.`} />

      {/* How the parts add up, before the details. */}
      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">Each area scores</div>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex items-center justify-between gap-3">
              <LevelStatus level={10} />
              <span className="text-muted">the area&apos;s full points</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <LevelStatus level={5} />
              <span className="text-muted">half the points</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <LevelStatus level={0} />
              <span className="text-muted">no points</span>
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">The call&apos;s band, from its score out of 100</div>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <StatusLabel band="green">Green</StatusLabel>
              <div className="text-xs text-muted">{GREEN_FROM} and above</div>
            </div>
            <div>
              <StatusLabel band="amber">Amber</StatusLabel>
              <div className="text-xs text-muted">
                {AMBER_FROM} to {GREEN_FROM - 1}
              </div>
            </div>
            <div>
              <StatusLabel band="red">Red</StatusLabel>
              <div className="text-xs text-muted">below {AMBER_FROM}, or any hard fail</div>
            </div>
          </div>
          <span className="mt-3 block" aria-hidden="true">
            <span className="relative block h-1.5 overflow-hidden rounded-full">
              <span className="absolute inset-y-0 left-0 bg-critical" style={{ width: `${AMBER_FROM}%` }} />
              <span className="absolute inset-y-0 bg-warning" style={{ left: `${AMBER_FROM}%`, width: `${GREEN_FROM - AMBER_FROM}%` }} />
              <span className="absolute inset-y-0 right-0 bg-good" style={{ left: `${GREEN_FROM}%` }} />
              <span className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${AMBER_FROM}%` }} />
              <span className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${GREEN_FROM}%` }} />
            </span>
            <span className="relative mt-1 block h-3 text-[0.65rem] tabular-nums text-muted">
              <span className="absolute left-0">0</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${AMBER_FROM}%` }}>
                {AMBER_FROM}
              </span>
              <span className="absolute -translate-x-1/2" style={{ left: `${GREEN_FROM}%` }}>
                {GREEN_FROM}
              </span>
              <span className="absolute right-0">100</span>
            </span>
          </span>
        </div>
      </div>

      <Suspense fallback={null}>
        <CalibrationCard />
      </Suspense>

      <div className="space-y-10">
        {STREAMS.map(({ stream, title }) => (
          <section key={stream} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <span className="text-xs text-muted">
                {areasFor(stream).length} areas · {areasFor(stream).reduce((sum, a) => sum + a.weight, 0)} points
              </span>
            </div>
            <Card>
              <ul className="-mx-4 divide-y divide-border sm:-mx-5">
                {areasFor(stream).map((a) => (
                  <li key={a.id} className="grid gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="block h-1 w-20 overflow-hidden rounded-full bg-border" aria-hidden="true">
                          <span className="block h-full rounded-full bg-chart-muted" style={{ width: `${(a.weight / MAX_WEIGHT) * 100}%` }} />
                        </span>
                        <span className="text-xs tabular-nums text-muted">{a.weight} points</span>
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="mb-0.5 text-xs">
                        <LevelStatus level={10} />
                      </div>
                      {a.does}
                    </div>
                    <div className="text-sm text-muted">
                      <div className="mb-0.5 text-xs">
                        <LevelStatus level={0} />
                      </div>
                      {a.doesNot}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h3 className="text-sm font-semibold">Hard fails</h3>
                <p className="mb-3 text-xs text-muted">Any one makes the call Red, whatever the score.</p>
                <ul className="space-y-2 text-sm">
                  {hardFailsFor(stream).map((f) => (
                    <li key={f.id} className="flex items-start justify-between gap-3">
                      <span className="flex items-start gap-2">
                        <span className="mt-1.5 size-2 shrink-0 rounded-[2px] bg-critical" aria-hidden="true" />
                        {f.label}
                      </span>
                      {f.measured && <span className="shrink-0 rounded-full border border-border px-2 py-px text-[0.68rem] text-muted">Measured</span>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Suspense fallback={<Card title="Call sheet questions">Loading…</Card>}>
                <SheetQuestionsCard stream={stream} />
              </Suspense>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** The heaviest area on either scorecard: its bar is full width. */
const MAX_WEIGHT = Math.max(...STREAMS.flatMap(({ stream }) => areasFor(stream).map((a) => a.weight)));

/** Founders' reviews of the AI's scores: how often they agree, and what they change. */
async function CalibrationCard() {
  const me = await requireMe();
  if (!me.canSeeAll) return null;
  const c = await getCalibration();
  const areaName = (id: string) => [...areasFor("first_call"), ...areasFor("vision_call")].find((a) => a.id === id)?.name ?? id;
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">Calibration: founders&apos; reviews</h2>
      {c.reviewed === 0 ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted">
              No scores reviewed yet. Open any scored call and choose &ldquo;Agree with this score&rdquo; or &ldquo;Correct it&rdquo;; how often the
              founders agree with the AI shows here.
            </p>
            <Link href="/calls?scored=1" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background">
              Scored calls <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Calls reviewed" value={c.reviewed} />
          <StatTile label="Agreed with the AI" value={`${Math.round((c.agreed / c.reviewed) * 100)}%`} note={`${c.agreed} of ${c.reviewed}`} />
          <StatTile
            label="Average correction"
            value={c.averageChange === null ? "–" : `${c.averageChange > 0 ? "+" : ""}${c.averageChange}`}
            note="points, on corrected calls"
          />
          <StatTile
            label="Corrected most"
            value={c.areasCorrected[0] ? areaName(c.areasCorrected[0].id) : "–"}
            note={c.areasCorrected.slice(0, 3).map((a) => `${areaName(a.id)} ×${a.count}`).join(" · ") || "no area changes yet"}
          />
        </div>
      )}
    </section>
  );
}

/** The questions of the latest published call sheet: what calls are scored against now. */
async function SheetQuestionsCard({ stream }: { stream: Stream }) {
  const me = await requireMe();
  const sheet = (await getActiveSheets())[stream];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Call sheet questions</h3>
          <p className="text-xs text-muted">{sheet.label} · the coverage area checks these</p>
        </div>
        {me.canSeeAll && (
          <Link href="/sheets" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background">
            Edit the sheet <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      <ol className="space-y-1.5 text-sm">
        {sheet.questions.map((q) => (
          <li key={q.id} className="flex gap-2.5">
            <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.65rem] font-semibold tabular-nums text-background">
              {q.number}
            </span>
            <span>
              {q.question}
              {q.priority === "good_to_have" && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full border border-border px-1.5 py-px text-[0.65rem] text-muted">Good to have</span>}
              {q.runningBusinessOnly && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full border border-border px-1.5 py-px text-[0.65rem] text-muted">RB only</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
