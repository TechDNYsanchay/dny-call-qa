import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BandBadge, Card, Loading, PageHeader } from "@/components/ui";
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

  return (
    <>
      <PageHeader
        title="Examples"
        subtitle={`How colleagues asked each ${sheets.first_call.label.split(" ")[0]} question well, from real calls. ${me.canSeeAll ? "Pin the best moments; the whole team can hear them." : "Founders pick these."}`}
      />

      <Card title="Call of the week" className="mb-6">
        {thisWeek || lastWeek ? (
          <ul className="space-y-2">
            {[
              { label: "This week", call: thisWeek },
              { label: "Last week", call: lastWeek },
            ]
              .filter((w): w is { label: string; call: CallRecord } => Boolean(w.call))
              .map(({ label, call }) => (
                <li key={label} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <span className="text-muted">{label}: </span>
                    <Link href={callHref(me, call)} className="font-medium hover:underline">
                      {nameOf(call.personId)}&apos;s call with {call.client.name}
                    </Link>
                    <span className="text-muted">
                      {" "}
                      · {formatShortDay(call.startedAt)}, {formatClock(call.startedAt)} · listen to the whole call
                    </span>
                  </div>
                  <BandBadge score={call.final!.score} band={call.final!.band} />
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No call has scored Amber or Green yet this week or last.</p>
        )}
      </Card>

      <div className="space-y-6">
        {questions.map((q) => {
          const mine = pinned.filter((p) => p.questionId === q.id);
          const options = candidates.filter((c) => c.questionId === q.id);
          if (!me.canSeeAll && mine.length === 0) return null;
          return (
            <Card key={q.id} title={`${q.number}. ${q.question}`}>
              {mine.length === 0 && <p className="text-sm text-muted">No example picked yet.</p>}
              <ul className="space-y-4">
                {mine.map((ex) => (
                  <li key={ex.id} className="space-y-1.5">
                    <p className="border-l-2 border-border pl-3 text-sm italic">“{ex.quote}”</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>
                        {nameOf(ex.personId)} with {ex.clientName} · {ex.startedAt ? formatShortDay(ex.startedAt) : ""} · at {formatTimestamp(ex.startSec)}
                      </span>
                      {ex.score !== null && ex.band && <BandBadge score={ex.score} band={ex.band} />}
                      <Link href={callHref(me, { id: ex.callId, personId: ex.personId }, ex.startSec)} className="hover:text-foreground hover:underline">
                        Whole call
                      </Link>
                      {me.canSeeAll && <RemoveButton id={ex.id} />}
                    </div>
                    {ex.recordingUrl ? (
                      <ClipPlayer url={ex.recordingUrl} start={ex.startSec} end={ex.endSec} />
                    ) : (
                      <p className="text-xs text-muted">The recording isn&apos;t kept any more; the quote stays.</p>
                    )}
                  </li>
                ))}
              </ul>
              {me.canSeeAll && options.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted">Covered well on recent calls, best score first</p>
                  <ul className="space-y-3">
                    {options.map((c) => (
                      <li key={`${c.callId}:${c.startSec}`} className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 text-sm">
                          <p>
                            <span className="text-muted">{c.speaker === "agent" ? "DNY: " : "Client: "}</span>
                            <span className="italic">“{c.quote}”</span>
                          </p>
                          <p className="text-xs text-muted">
                            {nameOf(c.personId)} with {c.clientName} · {formatShortDay(c.startedAt)} ·{" "}
                            <Link href={`/calls/${c.callId}?t=${Math.floor(c.startSec)}`} className="hover:text-foreground hover:underline">
                              hear it at {formatTimestamp(c.startSec)}
                            </Link>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <BandBadge score={c.score} band={c.band} />
                          <PinButton questionId={q.id} callId={c.callId} startSec={c.startSec} quote={c.quote} speaker={c.speaker} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {me.canSeeAll && options.length === 0 && mine.length === 0 && (
                <p className="mt-2 text-xs text-muted">No scored call in the last 60 days covered this question fully yet.</p>
              )}
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
