import { Suspense } from "react";
import { Card, PageHeader, StatTile } from "@/components/ui";
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
      <PageHeader
        title="Scorecards"
        subtitle={`What every call is scored against · rubric ${RUBRIC_VERSION}. Each area scores 0, 5 or 10 × its weight; Green ${GREEN_FROM}+, Amber ${AMBER_FROM}–${GREEN_FROM - 1}, Red below ${AMBER_FROM} or any hard fail.`}
      />
      <Suspense fallback={null}>
        <CalibrationCard />
      </Suspense>
      <div className="space-y-8">
        {STREAMS.map(({ stream, title }) => (
          <section key={stream} className="space-y-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Card>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium sm:px-5">Area</th>
                      <th className="px-2 py-2 text-right font-medium">Weight</th>
                      <th className="px-2 py-2 font-medium">Scores 10</th>
                      <th className="px-4 py-2 font-medium sm:px-5">Scores 0</th>
                    </tr>
                  </thead>
                  <tbody>
                    {areasFor(stream).map((a) => (
                      <tr key={a.id} className="border-b border-border align-top last:border-0">
                        <td className="px-4 py-3 font-medium sm:px-5">{a.name}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{a.weight}</td>
                        <td className="px-2 py-3">{a.does}</td>
                        <td className="px-4 py-3 text-muted sm:px-5">{a.doesNot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Hard fails (the call is red whatever the score)">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {hardFailsFor(stream).map((f) => (
                    <li key={f.id}>
                      {f.label}
                      {f.measured && <span className="text-muted"> (measured from timings)</span>}
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
          <p className="text-sm text-muted">
            No scores reviewed yet. Open any scored call and choose &ldquo;Agree with this score&rdquo; or &ldquo;Correct it&rdquo;; the agreement
            rate shows here.
          </p>
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
    <Card title={`Call sheet questions · ${sheet.label}`}>
      <ol className="space-y-1 text-sm">
        {sheet.questions.map((q) => (
          <li key={q.id}>
            {q.number}. {q.question}
            {q.priority === "good_to_have" && <span className="text-muted"> (good to have)</span>}
            {q.runningBusinessOnly && <span className="text-muted"> (RB only)</span>}
          </li>
        ))}
      </ol>
      {me.canSeeAll && (
        <p className="mt-3 text-xs">
          <Link href="/sheets" className="text-brand hover:underline">
            Upload or edit the call sheet
          </Link>
        </p>
      )}
    </Card>
  );
}
