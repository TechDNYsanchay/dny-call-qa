import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecordingPlayer, Transcript } from "@/components/call-recording";
import { BandBadge, Card, Chip, Loading, PageHeader, Quote } from "@/components/ui";
import { captureRows } from "@/lib/capture";
import { getCall, getPerson, requireMe, type CallRecord } from "@/lib/data";
import {
  formatClock,
  formatDay,
  formatDuration,
  formatPct,
  hardFailLabel,
  IN_PROGRESS_LABEL,
  NOT_SCORED_LABEL,
  STREAM_LABEL,
} from "@/lib/format";
import { questionsFor } from "@/lib/scoring/call-sheets";
import type { FirstCallResult } from "@/lib/scoring/schema";
import { areasFor } from "@/lib/scoring/scorecards";

type AreaResult = FirstCallResult["areas"]["opening"];

export default function CallPage({ params }: PageProps<"/calls/[id]">) {
  return (
    <Suspense fallback={<Loading what="call" />}>
      <CallDetail params={params} />
    </Suspense>
  );
}

async function CallDetail({ params }: Pick<PageProps<"/calls/[id]">, "params">) {
  const { id } = await params;
  await requireMe();
  // Row-level security returns nothing for someone else's call, so it reads as not found.
  const call = await getCall(id);
  if (!call) notFound();
  const person = await getPerson(call.personId);

  return (
    <>
      <Link href={`/calls?day=${call.startedAt.slice(0, 10)}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Calls on {formatDay(call.startedAt)}
      </Link>
      <PageHeader
        title={call.client.city ? `${call.client.name} · ${call.client.city}` : call.client.name}
        subtitle={`${STREAM_LABEL[call.stream]} by ${person?.name ?? (call.stream === "vision_call" ? "a consultant not on the team list" : `a number not on the team list (${call.agentPhone ?? "unknown"})`)} · ${formatDay(call.startedAt)}, ${formatClock(call.startedAt)} · ${formatDuration(call.durationSec)}`}
      >
        {call.final ? (
          <BandBadge score={call.final.score} band={call.final.band} />
        ) : (
          <Chip>{call.notScored ? NOT_SCORED_LABEL[call.notScored] : call.inProgress ? IN_PROGRESS_LABEL[call.inProgress] : "Not scored"}</Chip>
        )}
      </PageHeader>

      <RecordingPlayer
        url={call.recordingUrl}
        pageUrl={call.recordingPageUrl}
        fallback={
          call.recordingStatus === "available"
            ? "The recording couldn't be loaded. Refresh the page to try again."
            : call.recordingStatus === "missing"
              ? "No recording arrived for this call. It is flagged as missing, never scored as zero."
              : call.recordingStatus === "declined"
                ? "The client declined recording, so this call is logged but not scored."
                : call.notScored
                  ? "No recording is kept for calls that aren't scored."
                  : "Waiting for the recording."
        }
      />

      {call.final && call.result ? <ScoredCall call={call} /> : null}
      {call.transcript.length > 0 && <Transcript lines={call.transcript} />}
    </>
  );
}

function ScoredCall({ call }: { call: CallRecord }) {
  const final = call.final!;
  const result = call.result!;
  const areaResults = result.areas as Record<string, AreaResult>;
  const questions = questionsFor(call.stream);

  return (
    <div className="space-y-6">
      {(final.hardFails.length > 0 || final.overrides.length > 0) && (
        <Card className="border-critical/40">
          {final.hardFails.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold">Hard fail: the call is red whatever the score</h2>
              <ul className="mb-3 space-y-2">
                {final.hardFails.map((id) => {
                  const judged = result.hardFails.find((h) => h.id === id);
                  return (
                    <li key={id}>
                      <div className="text-sm font-medium">{hardFailLabel(call.stream, id)}</div>
                      {judged?.evidence.map((e, i) => (
                        <div key={i}>
                          <Quote evidence={e} />
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {final.overrides.length > 0 && (
            <ul className="space-y-1 text-sm text-muted">
              {final.overrides.map((o) => (
                <li key={o}>Measured rule: {o}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="Scorecard">
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Area</th>
                <th className="px-2 py-2 text-right font-medium">Points</th>
                <th className="px-4 py-2 font-medium sm:px-5">Why, with evidence</th>
              </tr>
            </thead>
            <tbody>
              {areasFor(call.stream).map((area) => {
                const level = final.levels[area.id];
                const a = areaResults[area.id];
                return (
                  <tr key={area.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="font-medium">{area.name}</div>
                      <div className="text-xs text-muted">
                        {level === 10 ? "Met" : level === 5 ? "Partial" : "Missed"} · weight {area.weight}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">
                      {(area.weight * level) / 10}
                      <span className="text-muted">/{area.weight}</span>
                    </td>
                    <td className="space-y-1 px-4 py-3 sm:px-5">
                      <p>{a.reason}</p>
                      {a.evidence.map((e, i) => (
                        <div key={i}>
                          <Quote evidence={e} />
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="px-4 py-3 sm:px-5">Call score</td>
                <td className="px-2 py-3 text-right tabular-nums">{final.score}/100</td>
                <td className="px-4 py-3 sm:px-5">
                  <BandBadge band={final.band} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Coaching">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Strengths</h3>
          <ul className="mb-4 space-y-2">
            {result.feedback.strengths.map((s, i) => (
              <li key={i}>
                <div className="text-sm">{s.text}</div>
                <Quote evidence={s.evidence} />
              </li>
            ))}
          </ul>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Fixes</h3>
          <ul className="mb-4 space-y-3">
            {result.feedback.fixes.map((f, i) => (
              <li key={i}>
                <div className="text-sm">{f.text}</div>
                <Quote evidence={f.evidence} />
                <div className="mt-1 rounded-md bg-background px-3 py-2 text-sm">
                  <span className="text-muted">Better line: </span>
                  {f.betterLine}
                </div>
              </li>
            ))}
          </ul>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Tomorrow&apos;s one thing</h3>
          <p className="text-sm">{result.feedback.tomorrow}</p>
        </Card>

        <Card title="Measured from the recording">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Measure label="Length" value={formatDuration(call.durationSec)} />
            <Measure label="Client talk time" value={call.metrics ? formatPct(call.metrics.clientShare) : "–"} />
            <Measure label="Silences over 8 s" value={String(call.metrics?.silencesOver8s ?? "–")} />
            <Measure label="Longest silence" value={call.metrics ? `${call.metrics.longestSilenceSec} s` : "–"} />
            {call.stream === "vision_call" && call.metrics && (
              <>
                <Measure label="Consultant talk, first half" value={formatPct(call.metrics.agentShareFirstHalf)} />
                <Measure label="Consultant talk, overall" value={formatPct(call.metrics.agentShareOverall)} />
                <Measure label="DNY credentials" value={formatDuration(call.metrics.credentialsSec)} />
                <Measure label="Service talk (of consultant's time)" value={formatPct(call.metrics.serviceShareOfAgent)} />
              </>
            )}
          </dl>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={call.stream === "first_call" ? "First Call Sheet coverage" : "Vision Call Sheet coverage"}>
          <ul className="space-y-2">
            {questions.map((q) => {
              const item = result.coverage.find((c) => c.question === q.id);
              const status = item?.status ?? "missed";
              return (
                <li key={q.id} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted">
                    {status === "covered" ? "✓ Covered" : status === "partly" ? "◐ Partly" : status === "not_applicable" ? "– N/A" : "✕ Missed"}
                  </span>
                  <span>
                    {q.number}. {q.question}
                    {q.priority === "good_to_have" && <span className="text-muted"> (good to have)</span>}
                    {q.runningBusinessOnly && <span className="text-muted"> (RB only)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Captured for the lead">
          <dl className="space-y-2 text-sm">
            {captureRows(result).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
                <dt className="text-muted">{label}</dt>
                <dd className={value === "Not captured" || value === "Not answered" ? "text-muted" : ""}>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Measure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
