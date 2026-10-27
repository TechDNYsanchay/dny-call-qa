import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar, Card, Loading, PageHeader, ScoreFigure, StatTile, StatusLabel } from "@/components/ui";
import { getActiveSheets, getCallOfWeek, getExamples, requireMe, teamNames, type CallRecord, type Me } from "@/lib/data";
import { addDays, formatClock, formatShortDay, formatTimestamp, toIst } from "@/lib/format";
import { ClipPlayer, PinButton, RemoveButton } from "./example-controls";

export const metadata = { title: "Examples · DNY Sales Agent" };

export default function ExamplesPage() {
  return (
    <Suspense fallback={<Loading what="examples" />}>
      <Examples />
    </Suspense>
  );
}

async function todayIst() {
  await connection();
  return toIst(new Date().toISOString()).slice(0, 10);
}

/** Founders see the full call; everyone else the shared view (recording and transcript only). */
const callHref = (me: Me, call: { id: string; personId: string }, sec?: number) =>
  me.canSeeAll || call.personId === me.id ? `/calls/${call.id}${sec ? `?t=${Math.floor(sec)}` : ""}` : `/examples/call/${call.id}`;

async function Examples() {
  const me = await requireMe();
  const today = await todayIst();
  const [{ pinned, candidates }, sheets, names, thisWeek, lastWeek] = await Promise.all([
    getExamples(me, today),
    getActiveSheets(),
    teamNames(),
    getCallOfWeek(today),
    getCallOfWeek(addDays(today, -7)),
  ]);
  const nameOf = (id: string) => names.get(id) ?? "A colleague";
  const questions = sheets.first_call.questions;

  const covered = questions.filter((q) => pinned.some((p) => p.questionId === q.id)).length;
  const weeks = [
    { label: "This week", call: thisWeek },
    { label: "Last week", call: lastWeek },
  ].filter((w): w is { label: string; call: CallRecord } => Boolean(w.call));

  return (
    <>
      <PageHeader
        title="Examples"
        subtitle={`How colleagues asked each ${sheets.first_call.label.split(" ")[0]} question well, from real calls. ${me.canSeeAll ? "Pin the best moments; the whole team can hear them." : "Founders pick these."}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <StatTile
          label="Questions with an example"
          value={
            <span className="tabular-nums">
              {covered}
              <span className="text-base font-normal text-muted"> of {questions.length}</span>
            </span>
          }
          note={me.canSeeAll ? `${candidates.length} good moments from the last 60 days to choose from` : "picked by the founders from real calls"}
        />
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">Call of the week · the whole team can listen</div>
          {weeks.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No call has scored Amber or Green this week or last.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {weeks.map(({ label, call }) => (
                <li key={label} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={nameOf(call.personId)} />
                    <div className="min-w-0 text-sm">
                      <div>
                        <span className="text-muted">{label} · </span>
                        <span className="font-medium">{nameOf(call.personId)}</span>
                      </div>
                      <div className="max-w-xs truncate text-xs text-muted" title={call.client.name}>
                        with {call.client.name} · {formatShortDay(call.startedAt)}, {formatClock(call.startedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ScoreFigure score={call.final!.score} band={call.final!.band} size="md" />
                    <Link href={callHref(me, call)} className={BUTTON}>
                      <PlayIcon /> Listen
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q) => {
          const mine = pinned.filter((p) => p.questionId === q.id);
          const options = candidates.filter((c) => c.questionId === q.id);
          if (!me.canSeeAll && mine.length === 0) return null;
          return (
            <Card key={q.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold tabular-nums text-background">
                    {q.number}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold leading-7">{q.question}</h2>
                    <p className="text-xs text-muted">
                      {q.priority === "must" ? "Must ask" : "Good to have"}
                      {q.runningBusinessOnly ? " · running businesses only" : ""} · captures {q.captures}
                    </p>
                  </div>
                </div>
                <span className="pt-1 text-xs">
                  {mine.length ? <StatusLabel band="green">{mine.length === 1 ? "Example picked" : `${mine.length} examples`}</StatusLabel> : <span className="text-muted">No example yet</span>}
                </span>
              </div>

              {mine.length > 0 && (
                <ul className="mt-4 space-y-4">
                  {mine.map((ex) => (
                    <li key={ex.id} className="rounded-lg border border-border bg-background/50 p-3.5">
                      <blockquote className="text-[0.95rem] leading-relaxed">“{ex.quote}”</blockquote>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5 text-xs text-muted">
                          <Avatar name={nameOf(ex.personId)} />
                          <span>
                            <span className="font-medium text-foreground">{nameOf(ex.personId)}</span> with {ex.clientName}
                            {ex.startedAt ? ` · ${formatShortDay(ex.startedAt)}` : ""} · at {formatTimestamp(ex.startSec)}
                          </span>
                          {ex.score !== null && ex.band && <StatusLabel band={ex.band}>{ex.score}</StatusLabel>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={callHref(me, { id: ex.callId, personId: ex.personId }, ex.startSec)} className={BUTTON}>
                            Whole call <span aria-hidden="true">→</span>
                          </Link>
                          {me.canSeeAll && <RemoveButton id={ex.id} />}
                        </div>
                      </div>
                      <div className="mt-3">
                        {ex.recordingUrl ? (
                          <ClipPlayer url={ex.recordingUrl} start={ex.startSec} end={ex.endSec} />
                        ) : (
                          <p className="text-xs text-muted">The recording isn&apos;t kept any more; the quote stays.</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {me.canSeeAll &&
                (options.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-medium text-muted">Covered well on recent calls, best score first</p>
                    <ul className="-mx-4 divide-y divide-border sm:-mx-5">
                      {options.map((c) => (
                        <li key={`${c.callId}:${c.startSec}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 transition-colors hover:bg-background/60 sm:px-5">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide ${c.speaker === "agent" ? "bg-foreground text-background" : "border border-border text-muted"}`}>
                              {c.speaker === "agent" ? "DNY" : "Client"}
                            </span>
                            <div className="min-w-0 text-sm">
                              <p className="italic">“{c.quote}”</p>
                              <p className="mt-0.5 text-xs text-muted">
                                {nameOf(c.personId)} with {c.clientName} · {formatShortDay(c.startedAt)} · at {formatTimestamp(c.startSec)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <StatusLabel band={c.band}>{c.score}</StatusLabel>
                            <Link href={`/calls/${c.callId}?t=${Math.floor(c.startSec)}`} className={BUTTON}>
                              <PlayIcon /> Hear it
                            </Link>
                            <PinButton questionId={q.id} callId={c.callId} startSec={c.startSec} quote={c.quote} speaker={c.speaker} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  mine.length === 0 && <p className="mt-3 text-xs text-muted">No scored call in the last 60 days covered this question fully yet.</p>
                ))}
            </Card>
          );
        })}
        {!me.canSeeAll && pinned.length === 0 && (
          <Card>
            <p className="text-sm text-muted">No examples picked yet. The founders pin the best moments from real calls here, one or more for each question on the call sheet.</p>
          </Card>
        )}
      </div>
    </>
  );
}

const BUTTON = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background";

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
      <path d="M3.5 2.2v7.6L9.6 6Z" fill="currentColor" />
    </svg>
  );
}
