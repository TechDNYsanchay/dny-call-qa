import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading, PageHeader } from "@/components/ui";
import { getActiveSheets, listSheetVersions, requireMe, sheetPdfLinks } from "@/lib/data";
import { formatClock, formatDay } from "@/lib/format";
import type { Stream } from "@/lib/scoring/call-sheets";
import { SheetManager } from "./sheet-manager";

export const metadata = { title: "Call sheets · DNY Sales Agent" };

const STREAMS: { stream: Stream; title: string }[] = [
  { stream: "first_call", title: "First Call Sheet (FC-01)" },
  { stream: "vision_call", title: "Vision Call Sheet (LC-01)" },
];

export default function SheetsPage() {
  return (
    <Suspense fallback={<Loading what="call sheets" />}>
      <Sheets />
    </Suspense>
  );
}

async function Sheets() {
  const me = await requireMe();
  if (!me.canSeeAll) redirect("/scorecards");
  const [sheets, versions] = await Promise.all([getActiveSheets(), listSheetVersions()]);
  const links = await sheetPdfLinks(versions.flatMap((v) => (v.storagePath ? [v.storagePath] : [])));

  return (
    <>
      <PageHeader
        title="Call sheets"
        subtitle="The questions every call is scored against. When DNY changes a sheet, upload the new PDF, check the questions, and publish: calls scored from then on use it."
      />
      <div className="space-y-10">
        {STREAMS.map(({ stream, title }) => {
          const sheet = sheets[stream];
          const history = versions.filter((v) => v.stream === stream);
          const current = history.find((v) => v.id === sheet.versionId);
          return (
            <section key={stream} className="space-y-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <Card>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      In use: {sheet.label} <span className="text-muted">· version {sheet.version}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {current ? `Published ${formatDay(current.createdAt)}, ${formatClock(current.createdAt)}${current.createdBy ? ` by ${current.createdBy}` : ""}` : "The original October 2026 sheet"}
                    </div>
                  </div>
                  {sheet.storagePath && links[sheet.storagePath] && (
                    <a href={links[sheet.storagePath]} target="_blank" rel="noopener noreferrer" className="text-sm text-brand hover:underline">
                      View the PDF ↗
                    </a>
                  )}
                </div>
                <ol className="mb-5 space-y-1 text-sm">
                  {sheet.questions.map((q) => (
                    <li key={q.id}>
                      <span className="tabular-nums text-muted">{String(q.number).padStart(2, "0")}</span> {q.question}
                      {q.priority === "good_to_have" && <span className="text-muted"> (good to have)</span>}
                      {q.runningBusinessOnly && <span className="text-muted"> (RB only)</span>}
                    </li>
                  ))}
                </ol>
                <SheetManager
                  stream={stream}
                  currentLabel={sheet.label}
                  currentQuestions={sheet.questions}
                  nextVersion={Math.max(sheet.version, ...history.map((v) => v.version)) + 1}
                />
              </Card>
              {history.length > 1 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">Earlier versions ({history.length - 1})</summary>
                  <ul className="mt-2 space-y-1">
                    {history
                      .filter((v) => v.id !== sheet.versionId)
                      .map((v) => (
                        <li key={v.id}>
                          Version {v.version}: {v.label} <span className="text-muted">· {formatDay(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ""}{v.notes ? ` · ${v.notes}` : ""}</span>
                          {v.storagePath && links[v.storagePath] && (
                            <a href={links[v.storagePath]} target="_blank" rel="noopener noreferrer" className="ml-2 text-brand hover:underline">
                              PDF ↗
                            </a>
                          )}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
