import Link from "next/link";
import { Suspense } from "react";
import { DayNav } from "@/components/day-nav";
import { BandBadge, Card, Chip, EmptyState, Loading, PageHeader } from "@/components/ui";
import { getAdjacentDays, getReportDay, listCalls, listPeople, requireMe } from "@/lib/data";
import { formatClock, formatDay, formatDuration, IN_PROGRESS_LABEL, NOT_SCORED_LABEL, parseDayParam, STREAM_LABEL } from "@/lib/format";

export const metadata = { title: "Calls · DNY Sales Agent" };

export default function CallsPage({ searchParams }: PageProps<"/calls">) {
  return (
    <Suspense fallback={<Loading what="calls" />}>
      <Calls searchParams={searchParams} />
    </Suspense>
  );
}

async function Calls({ searchParams }: Pick<PageProps<"/calls">, "searchParams">) {
  const me = await requireMe();
  const title = me.canSeeAll ? "Calls" : "My calls";
  const latest = await getReportDay();
  const day = parseDayParam((await searchParams).day) ?? latest;
  if (!day) return <EmptyState title={title} />;
  const [calls, people, around] = await Promise.all([listCalls(day), listPeople(), getAdjacentDays(day)]);

  return (
    <>
      <PageHeader title={title} subtitle={`${calls.length} calls logged on ${formatDay(day)}`}>
        <DayNav path="/calls" day={day} latest={latest} {...around} />
      </PageHeader>
      <Card>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Time</th>
                <th className="px-2 py-2 font-medium">Person</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-2 py-2 text-right font-medium">Length</th>
                <th className="px-4 py-2 font-medium sm:px-5">Result</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-b border-border last:border-0 hover:bg-background">
                  <td className="px-4 py-3 tabular-nums sm:px-5">
                    <Link href={`/calls/${call.id}`} className="font-medium hover:underline">
                      {formatClock(call.startedAt)}
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    {people.find((p) => p.id === call.personId)?.name ?? (
                      <span className="text-muted">Not on the team list{call.agentPhone ? ` (${call.agentPhone})` : ""}</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-muted">{STREAM_LABEL[call.stream]}</td>
                  <td className="px-2 py-3">
                    {call.client.name}
                    {call.client.city && <span className="text-muted"> · {call.client.city}</span>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{formatDuration(call.durationSec)}</td>
                  <td className="px-4 py-3 sm:px-5">
                    {call.final ? (
                      <BandBadge score={call.final.score} band={call.final.band} />
                    ) : (
                      <Chip>
                        {call.notScored ? NOT_SCORED_LABEL[call.notScored] : call.inProgress ? IN_PROGRESS_LABEL[call.inProgress] : "Not scored"}
                      </Chip>
                    )}
                  </td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted sm:px-5">
                    No calls logged on this day.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
