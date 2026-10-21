import Link from "next/link";
import { Suspense } from "react";
import { BandBadge, Card, Chip, EmptyState, Loading, PageHeader } from "@/components/ui";
import { getReportDay, listCalls, listPeople } from "@/lib/data";
import { formatClock, formatDay, formatDuration, NOT_SCORED_LABEL, STREAM_LABEL } from "@/lib/format";

export const metadata = { title: "Calls · DNY Sales Agent" };

export default function CallsPage() {
  return (
    <Suspense fallback={<Loading what="calls" />}>
      <Calls />
    </Suspense>
  );
}

async function Calls() {
  const day = await getReportDay();
  if (!day) return <EmptyState title="Calls" />;
  const [calls, people] = await Promise.all([listCalls(day), listPeople()]);

  return (
    <>
      <PageHeader title="Calls" subtitle={`${calls.length} calls logged on ${formatDay(day)}`} />
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
                  <td className="px-2 py-3">{people.find((p) => p.id === call.personId)?.name}</td>
                  <td className="px-2 py-3 text-muted">{STREAM_LABEL[call.stream]}</td>
                  <td className="px-2 py-3">
                    {call.client.name}
                    <span className="text-muted"> · {call.client.city}</span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{formatDuration(call.durationSec)}</td>
                  <td className="px-4 py-3 sm:px-5">
                    {call.final ? (
                      <BandBadge score={call.final.score} band={call.final.band} />
                    ) : (
                      <Chip>{call.notScored ? NOT_SCORED_LABEL[call.notScored] : "Not scored"}</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
