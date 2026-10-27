import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RecordingPlayer, Transcript } from "@/components/call-recording";
import { Avatar, Card, Loading, Quote, ScoreFigure, StatusLabel } from "@/components/ui";
import { getActiveSheets, getCallOfWeek, getSharedCall, listCallExamples, requireMe, teamNames } from "@/lib/data";
import { formatClock, formatDay, formatDuration, formatTimestamp } from "@/lib/format";

export const metadata = { title: "Example call · DNY Sales Agent" };

// A colleague's call shared with the team (a pinned example or the call of the week): the
// recording, the transcript, the picked moments and what went well. Not the score breakdown or
// the review.
export default function SharedCallPage({ params, searchParams }: PageProps<"/examples/call/[id]">) {
  return (
    <Suspense fallback={<Loading what="call" />}>
      <SharedCall params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SharedCall({ params, searchParams }: PageProps<"/examples/call/[id]">) {
  const { id } = await params;
  const me = await requireMe();
  const call = await getSharedCall(id);
  if (!call) notFound();
  if (me.canSeeAll || call.personId === me.id) redirect(`/calls/${call.id}`);
  // ?t=SECONDS opens the call at a picked moment.
  const t = Number((await searchParams).t);
  const startAt = Number.isFinite(t) && t > 0 ? Math.floor(t) : undefined;
  const [names, moments, sheets, callOfWeek] = await Promise.all([teamNames(), listCallExamples(call.id), getActiveSheets(), getCallOfWeek(call.startedAt.slice(0, 10))]);
  const who = names.get(call.personId) ?? "A colleague";
  const strengths = call.result?.feedback.strengths ?? [];
  const spoken = call.result?.stream === "first_call" ? call.result.capture.clientName : null;
  const questionOf = (qid: string) => sheets.questions.find((q) => q.id === qid);
  const why = callOfWeek?.id === call.id ? "Call of the week" : "Picked as an example";

  return (
    <>
      <Link href="/examples" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Examples
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={who} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{why}</p>
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {who}&apos;s call with {spoken ?? call.client.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {formatDay(call.startedAt)}, {formatClock(call.startedAt)} · {formatDuration(call.durationSec)} · shared with the team to learn from
            </p>
          </div>
        </div>
        {call.final && <ScoreFigure score={call.final.score} band={call.final.band} />}
      </div>

      <RecordingPlayer url={call.recordingUrl} startAt={startAt} fallback="The recording isn't kept any more; the transcript below stays." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">
            <StatusLabel band="green">What went well</StatusLabel>
          </h2>
          {strengths.length === 0 ? (
            <p className="text-sm text-muted">Listen to the whole call below.</p>
          ) : (
            <ul className="space-y-4">
              {strengths.map((s, i) => (
                <li key={i}>
                  <p className="text-sm">{s.text}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Quote evidence={s.evidence} />
                    <PlayFrom href={`/examples/call/${call.id}?t=${seconds(s.evidence.at)}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Moments picked from this call</h2>
          {moments.length === 0 ? (
            <p className="text-sm text-muted">No single moment pinned; the whole call is the example.</p>
          ) : (
            <ul className="space-y-3">
              {moments.map((m) => {
                const q = questionOf(m.questionId);
                return (
                  <li key={`${m.questionId}:${m.startSec}`} className="rounded-lg border border-border bg-background/50 p-3">
                    {q && (
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-2xs font-semibold tabular-nums text-background">
                          {q.number}
                        </span>
                        {q.question}
                      </div>
                    )}
                    <p className="text-sm italic">“{m.quote}”</p>
                    <div className="mt-2">
                      <PlayFrom href={`/examples/call/${call.id}?t=${Math.floor(m.startSec)}`} label={`Play from ${formatTimestamp(m.startSec)}`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {call.transcript.length > 0 && <Transcript lines={call.transcript} focusSec={startAt} />}
    </>
  );
}

/** "1:05" -> 65 */
function seconds(at: string): number {
  return at.split(":").map(Number).reduce((total, p) => total * 60 + p, 0);
}

function PlayFrom({ href, label = "Hear it" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-background">
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
        <path d="M3.5 2.2v7.6L9.6 6Z" fill="currentColor" />
      </svg>
      {label}
    </Link>
  );
}
