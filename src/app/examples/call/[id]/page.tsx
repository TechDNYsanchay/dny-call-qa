import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RecordingPlayer, Transcript } from "@/components/call-recording";
import { BandBadge, Card, Loading, PageHeader, Quote } from "@/components/ui";
import { getSharedCall, requireMe, teamNames } from "@/lib/data";
import { formatClock, formatDay, formatDuration } from "@/lib/format";

export const metadata = { title: "Example call · DNY Sales Agent" };

// A colleague's call shared with the team (a pinned example or the call of the week): the
// recording, the transcript and what went well. Not the score breakdown or the review.
export default function SharedCallPage({ params }: PageProps<"/examples/call/[id]">) {
  return (
    <Suspense fallback={<Loading what="call" />}>
      <SharedCall params={params} />
    </Suspense>
  );
}

async function SharedCall({ params }: Pick<PageProps<"/examples/call/[id]">, "params">) {
  const { id } = await params;
  const me = await requireMe();
  const call = await getSharedCall(id);
  if (!call) notFound();
  if (me.canSeeAll || call.personId === me.id) redirect(`/calls/${call.id}`);
  const who = (await teamNames()).get(call.personId) ?? "A colleague";
  const strengths = call.result?.feedback.strengths ?? [];

  return (
    <>
      <Link href="/examples" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Examples
      </Link>
      <PageHeader title={`${who}'s call with ${call.client.name}`} subtitle={`${formatDay(call.startedAt)}, ${formatClock(call.startedAt)} · ${formatDuration(call.durationSec)} · shared with the team as an example`}>
        {call.final && <BandBadge score={call.final.score} band={call.final.band} />}
      </PageHeader>
      <RecordingPlayer url={call.recordingUrl} fallback="The recording isn't kept any more." />
      {strengths.length > 0 && (
        <Card title="What went well">
          <ul className="space-y-3">
            {strengths.map((s, i) => (
              <li key={i} className="text-sm">
                <p>{s.text}</p>
                <Quote evidence={s.evidence} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {call.transcript.length > 0 && <Transcript lines={call.transcript} />}
    </>
  );
}
