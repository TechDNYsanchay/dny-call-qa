import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading, PageHeader, StatusLabel } from "@/components/ui";
import { getActiveSheets, listSheetVersions, requireMe, sheetPdfLinks } from "@/lib/data";
import { formatClock, formatDay } from "@/lib/format";
import type { Stream } from "@/lib/scoring/call-sheets";
import { SheetManager } from "./sheet-manager";

export const metadata = { title: "Call sheets · DNY Sales Agent" };

const STREAMS: { stream: Stream; title: string; note?: string }[] = [
  { stream: "first_call", title: "First Call Sheet (FC-01)" },
  { stream: "vision_call", title: "Vision Call Sheet (LC-01)", note: "Used once Lead Consultant calls are scored." },
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
      <div className="space-y-8">
        {STREAMS.map(({ stream, title, note }) => {
          const sheet = sheets[stream];
          const history = versions.filter((v) => v.stream === stream);
          const current = history.find((v) => v.id === sheet.versionId);
          const earlier = history.filter((v) => v.id !== sheet.versionId);
          const pdf = sheet.storagePath ? links[sheet.storagePath] : undefined;
          const must = sheet.questions.filter((q) => q.priority === "must").length;
          const rbOnly = sheet.questions.filter((q) => q.runningBusinessOnly).length;
          return (
            <Card key={stream}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <span className="text-xs">
                      <StatusLabel band="green">In use · version {sheet.version}</StatusLabel>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {sheet.label} ·{" "}
                    {current ? `published ${formatDay(current.createdAt)}, ${formatClock(current.createdAt)}${current.createdBy ? ` by ${current.createdBy}` : ""}` : "the original October 2026 sheet"}
                  </p>
                  {note && <p className="mt-1 text-xs text-muted">{note}</p>}
                </div>
                {pdf && (
                  <a href={pdf} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                    View the PDF <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className={PILL}>
                  <b className="font-semibold tabular-nums text-foreground">{sheet.questions.length}</b> questions
                </span>
                <span className={PILL}>
                  <b className="font-semibold tabular-nums text-foreground">{must}</b> must ask
                </span>
                {sheet.questions.length - must > 0 && (
                  <span className={PILL}>
                    <b className="font-semibold tabular-nums text-foreground">{sheet.questions.length - must}</b> good to have
                  </span>
                )}
                {rbOnly > 0 && (
                  <span className={PILL}>
                    <b className="font-semibold tabular-nums text-foreground">{rbOnly}</b> for running businesses only
                  </span>
                )}
              </div>

              <ol className="mt-4 grid gap-x-8 lg:grid-cols-2">
                {sheet.questions.map((q) => (
                  <li key={q.id} className="flex gap-3 border-b border-border py-2.5 last:border-0 lg:[&:nth-last-child(2):nth-child(odd)]:border-0">
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.7rem] font-semibold tabular-nums text-background">
                      {q.number}
                    </span>
                    <div className="min-w-0 text-sm">
                      <div>
                        {q.question}
                        {q.priority === "good_to_have" && <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-border px-1.5 py-px text-[0.68rem] text-muted">Good to have</span>}
                        {q.runningBusinessOnly && <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-border px-1.5 py-px text-[0.68rem] text-muted">RB only</span>}
                      </div>
                      {q.captures && <div className="mt-0.5 text-xs text-muted">Captures {q.captures}</div>}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="-mx-4 mt-5 border-t border-border bg-background/40 px-4 pt-4 pb-1 sm:-mx-5 sm:px-5">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Update this sheet</h3>
                <SheetManager
                  stream={stream}
                  currentLabel={sheet.label}
                  currentQuestions={sheet.questions}
                  nextVersion={Math.max(sheet.version, ...history.map((v) => v.version)) + 1}
                />
              </div>

              {earlier.length > 0 && (
                <details className="group mt-4 text-sm">
                  <summary className="cursor-pointer list-none text-xs font-medium text-muted hover:text-foreground">
                    <span className="inline-block transition-transform group-open:rotate-90">›</span> Earlier versions ({earlier.length})
                  </summary>
                  <ul className="mt-2 divide-y divide-border">
                    {earlier.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <span className="mr-2 rounded-full border border-border px-2 py-0.5 text-xs tabular-nums text-muted">v{v.version}</span>
                          {v.label}
                          <span className="text-xs text-muted">
                            {" "}
                            · {formatDay(v.createdAt)}
                            {v.createdBy ? ` · ${v.createdBy}` : ""}
                            {v.notes ? ` · ${v.notes}` : ""}
                          </span>
                        </div>
                        {v.storagePath && links[v.storagePath] && (
                          <a href={links[v.storagePath]} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                            PDF <span aria-hidden="true">↗</span>
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

const BUTTON = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background";
const PILL = "rounded-full border border-border px-2.5 py-0.5 text-muted";
