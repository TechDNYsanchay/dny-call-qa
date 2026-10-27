import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { RecordingPlayer, Transcript } from "@/components/call-recording";
import { DisputeForm } from "@/components/score-dispute";
import { ScoreReview } from "@/components/score-review";
import { Avatar, BandBadge, bandInk, Card, LevelPoints, LevelStatus, Loading, Quote, ScoreFigure, StatusLabel } from "@/components/ui";
import { captureRows } from "@/lib/capture";
import { getCall, getCallSheet, getPerson, requireMe, type CallRecord } from "@/lib/data";
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
import type { SheetQuestion } from "@/lib/scoring/call-sheets";
import type { FirstCallResult } from "@/lib/scoring/schema";
import { areasFor, hardFailsFor } from "@/lib/scoring/scorecards";

type AreaResult = FirstCallResult["areas"]["opening"];

export default function CallPage({ params, searchParams }: PageProps<"/calls/[id]">) {
  return (
    <Suspense fallback={<Loading what="call" />}>
      <CallDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CallDetail({ params, searchParams }: PageProps<"/calls/[id]">) {
  const { id } = await params;
  // ?t=SECONDS opens the call at a moment (search results, examples).
  const t = Number((await searchParams).t);
  const startAt = Number.isFinite(t) && t > 0 ? Math.floor(t) : undefined;
  const me = await requireMe();
  // Row-level security returns nothing for someone else's call, so it reads as not found.
  const call = await getCall(id);
  if (!call) notFound();
  const person = await getPerson(call.personId);
  // Callyzer often knows only the number; scoring captures the name the client gave.
  const spokenName = call.result?.stream === "first_call" ? call.result.capture.clientName : null;

  return (
    <>
      <Link href={`/calls?day=${call.startedAt.slice(0, 10)}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Calls on {formatDay(call.startedAt)}
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={person?.name ?? ""} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {spokenName ?? call.client.name}
              {call.client.city && <span className="font-normal text-muted"> · {call.client.city}</span>}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {[
                STREAM_LABEL[call.stream],
                `by ${person?.name ?? (call.stream === "vision_call" ? "a consultant not on the team list" : `a number not on the team list (${call.agentPhone ?? "unknown"})`)}`,
                `${formatDay(call.startedAt)}, ${formatClock(call.startedAt)}`,
                formatDuration(call.durationSec),
                spokenName && spokenName !== call.client.name ? call.client.name : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {call.final ? (
          <ScoreFigure score={call.final.score} band={call.final.band} />
        ) : (
          <span className="text-sm text-muted">{call.notScored ? NOT_SCORED_LABEL[call.notScored] : call.inProgress ? IN_PROGRESS_LABEL[call.inProgress] : "Not scored"}</span>
        )}
      </div>

      <RecordingPlayer
        startAt={startAt}
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

      {call.dispute && <DisputeBanner call={call} mine={call.personId === me.id} />}
      {call.review && <ReviewBanner call={call} />}
      {call.final && call.result ? <ScoredCall call={call} sheet={await getCallSheet(call.stream, call.sheetVersionId)} /> : null}
      {call.final && me.canSeeAll && (
        <div className="mt-6">
          <ScoreReview
            callId={call.id}
            reviewed={Boolean(call.review) && !(call.dispute && !call.dispute.resolvedAt)}
            aiScore={call.review?.verdict === "corrected" ? call.review.ai?.score : undefined}
            areas={areasFor(call.stream).map((a) => ({ id: a.id, name: a.name, weight: a.weight, level: call.final!.levels[a.id] }))}
            hardFails={hardFailsFor(call.stream)
              .filter((h) => !h.measured)
              .map((h) => ({ id: h.id, label: h.label, on: call.final!.hardFails.includes(h.id) }))}
          />
        </div>
      )}
      {call.final && call.personId === me.id && !(call.dispute && !call.dispute.resolvedAt) && (
        <div className="mt-6">
          <DisputeForm callId={call.id} />
        </div>
      )}
      {call.transcript.length > 0 && <Transcript lines={call.transcript} focusSec={startAt} />}
    </>
  );
}

function ScoredCall({ call, sheet }: { call: CallRecord; sheet: { label: string; questions: SheetQuestion[] } }) {
  const final = call.final!;
  const result = call.result!;
  const areaResults = result.areas as Record<string, AreaResult>;
  const questions = sheet.questions;

  return (
    <div className="space-y-6">
      {(final.hardFails.length > 0 || final.overrides.length > 0) && (
        <Card className="border-critical/40">
          {final.hardFails.length > 0 && (
            <>
              <h2 className="mb-3 text-sm font-semibold">
                <StatusLabel band="red">Hard fail</StatusLabel> <span className="font-normal text-muted">· the call is Red whatever the score</span>
              </h2>
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
            <thead className="whitespace-nowrap text-left text-xs text-muted lg:whitespace-normal">
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
                      <div className="mt-0.5 text-xs text-muted">
                        <LevelStatus level={level} /> · weight {area.weight}
                      </div>
                      {call.review?.verdict === "corrected" && call.review.ai && call.review.ai.levels[area.id] !== level && (
                        <div className="text-xs text-muted">Corrected · AI gave {call.review.ai.levels[area.id]}</div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <LevelPoints level={level} weight={area.weight} />
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
                <td className="px-2 py-3 text-right tabular-nums">
                  <span className={`text-base ${bandInk(final.band)}`}>{final.score}</span>
                  <span className="font-normal text-muted">/100</span>
                </td>
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
          <h3 className="mb-2 text-xs font-medium">
            <StatusLabel band="green">What went well</StatusLabel>
          </h3>
          <ul className="mb-5 space-y-3">
            {result.feedback.strengths.map((s, i) => (
              <li key={i}>
                <div className="text-sm">{s.text}</div>
                <Quote evidence={s.evidence} />
              </li>
            ))}
          </ul>
          <h3 className="mb-2 text-xs font-medium">
            <StatusLabel band="amber">Fix next</StatusLabel>
          </h3>
          <ul className="mb-5 space-y-4">
            {result.feedback.fixes.map((f, i) => (
              <li key={i}>
                <div className="text-sm">{f.text}</div>
                <Quote evidence={f.evidence} />
                <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <div className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-muted">Better line</div>
                  {f.betterLine}
                </div>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-3">
            <div className="mb-0.5 text-2xs font-semibold uppercase tracking-wide text-brand">Tomorrow&apos;s one thing</div>
            <p className="text-sm">{result.feedback.tomorrow}</p>
          </div>
        </Card>

        <Card title="Measured from the recording">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Measure
              label="Length"
              value={formatDuration(call.durationSec)}
              note={call.stream === "first_call" ? "6 to 10 minutes is the aim" : undefined}
              bar={call.stream === "first_call" ? { value: Math.min(1, call.durationSec / 900), marks: [6 / 15, 10 / 15] } : undefined}
            />
            <Measure
              label="Client talk time"
              value={call.metrics ? formatPct(call.metrics.clientShare) : "–"}
              note="half or more is the aim"
              bar={call.metrics ? { value: call.metrics.clientShare, marks: [0.5] } : undefined}
            />
            <Measure
              label="Silences over 8 s"
              value={
                call.metrics ? (
                  call.metrics.silencesOver8s ? (
                    <StatusLabel band="red">{call.metrics.silencesOver8s}</StatusLabel>
                  ) : (
                    <span className="text-good-ink">0</span>
                  )
                ) : (
                  "–"
                )
              }
              note="none is the aim"
            />
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
        <Card title={`${call.stream === "first_call" ? "First Call Sheet" : "Vision Call Sheet"} coverage · ${sheet.label}`}>
          <ul className="space-y-2">
            {questions.map((q) => {
              const item = result.coverage.find((c) => c.question === q.id);
              const status = item?.status ?? "missed";
              return (
                <li key={q.id} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 pt-px text-xs">
                    {status === "not_applicable" ? (
                      <span className="text-muted">N/A</span>
                    ) : (
                      <StatusLabel band={status === "covered" ? "green" : status === "partly" ? "amber" : "red"}>
                        {status === "covered" ? "Covered" : status === "partly" ? "Partly" : "Missed"}
                      </StatusLabel>
                    )}
                  </span>
                  <span className="flex min-w-0 gap-2">
                    <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-2xs font-semibold tabular-nums text-background">
                      {q.number}
                    </span>
                    <span>
                      {q.question}
                      {q.priority === "good_to_have" && <span className="text-muted"> (good to have)</span>}
                      {q.runningBusinessOnly && <span className="text-muted"> (RB only)</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Captured for the lead</h2>
            {call.leadId && (
              <Link href={`/leads/${call.leadId}`} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background">
                Open the lead <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
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

/** A measurement as a small tile: the figure, what to aim for, and an optional bar with target marks. */
function Measure({ label, value, note, bar }: { label: string; value: ReactNode; note?: string; bar?: { value: number; marks: number[] } }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {bar && (
        <span className="relative mt-2 block h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full bg-chart-muted" style={{ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }} />
          {bar.marks.map((m) => (
            <span key={m} className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${m * 100}%` }} />
          ))}
        </span>
      )}
      {note && <div className="mt-1 text-2xs text-muted">{note}</div>}
    </div>
  );
}

/** The executive's challenge to the score, open until a founder reviews the call. */
function DisputeBanner({ call, mine }: { call: CallRecord; mine: boolean }) {
  const d = call.dispute!;
  const who = mine ? "You" : (d.by ?? "The executive");
  const when = `${formatDay(d.at)}, ${formatClock(d.at)}`;
  return (
    <Card className={`mb-6 ${d.resolvedAt ? "" : "border-brand/50"}`}>
      <p className="text-sm">
        <span className="font-medium">{d.resolvedAt ? "Disputed, answered:" : "⚑ Disputed:"}</span> {who} disputed this score{" "}
        <span className="text-muted">· {when}</span>
      </p>
      <p className="mt-1 text-sm text-muted">“{d.comment}”</p>
      {!d.resolvedAt && (
        <p className="mt-2 text-xs text-muted">
          {mine ? "The founders have been told; their review will show here." : "Agree with the score or correct it below; either answers the dispute."}
        </p>
      )}
    </Card>
  );
}

/** Who reviewed the AI's score, and what changed. */
function ReviewBanner({ call }: { call: CallRecord }) {
  const review = call.review!;
  const who = review.reviewer ?? "A founder";
  const when = `${formatDay(review.at)}, ${formatClock(review.at)}`;
  return (
    <Card className="mb-6">
      {review.verdict === "agree" ? (
        <p className="text-sm">
          <span className="font-medium">✓ Reviewed:</span> {who} agreed with this score <span className="text-muted">· {when}</span>
        </p>
      ) : (
        <p className="text-sm">
          <span className="font-medium">Corrected by {who}:</span>{" "}
          {review.ai ? (
            <>
              the AI scored <BandBadge score={review.ai.score} band={review.ai.band} />, now <BandBadge score={call.final!.score} band={call.final!.band} />
            </>
          ) : (
            "the score was changed"
          )}{" "}
          <span className="text-muted">· {when}</span>
        </p>
      )}
      {review.note && <p className="mt-1 text-sm text-muted">“{review.note}”</p>}
    </Card>
  );
}
