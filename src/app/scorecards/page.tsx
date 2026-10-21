import { Card, PageHeader } from "@/components/ui";
import {
  FIRST_CALL_SHEET_VERSION,
  questionsFor,
  VISION_CALL_SHEET_VERSION,
  type Stream,
} from "@/lib/scoring/call-sheets";
import { AMBER_FROM, GREEN_FROM } from "@/lib/scoring/compute";
import { areasFor, hardFailsFor, RUBRIC_VERSION } from "@/lib/scoring/scorecards";

export const metadata = { title: "Scorecards · DNY Sales Agent" };

const STREAMS: { stream: Stream; title: string; sheet: string }[] = [
  { stream: "first_call", title: "First Calls Executive", sheet: FIRST_CALL_SHEET_VERSION },
  { stream: "vision_call", title: "Lead Consultant, Sales: vision call", sheet: VISION_CALL_SHEET_VERSION },
];

export default function ScorecardsPage() {
  return (
    <>
      <PageHeader
        title="Scorecards"
        subtitle={`What every call is scored against · rubric ${RUBRIC_VERSION}. Each area scores 0, 5 or 10 × its weight; Green ${GREEN_FROM}+, Amber ${AMBER_FROM}–${GREEN_FROM - 1}, Red below ${AMBER_FROM} or any hard fail.`}
      />
      <div className="space-y-8">
        {STREAMS.map(({ stream, title, sheet }) => (
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
              <Card title={`Call sheet questions · ${sheet}`}>
                <ol className="space-y-1 text-sm">
                  {questionsFor(stream).map((q) => (
                    <li key={q.id}>
                      {q.number}. {q.question}
                      {q.priority === "good_to_have" && <span className="text-muted"> (good to have)</span>}
                      {q.runningBusinessOnly && <span className="text-muted"> (RB only)</span>}
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
