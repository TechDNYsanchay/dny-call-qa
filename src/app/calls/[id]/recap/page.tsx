import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MeetingRecapCard } from "@/components/meeting-recap";
import { Avatar, Loading } from "@/components/ui";
import { getMeetingRecap, getPerson, requireMe } from "@/lib/data";
import { formatClock, formatPhone, toIst } from "@/lib/format";
import { dayName } from "@/lib/whatsapp";

export const metadata = { title: "Meeting recap · DNY Sales Agent" };

// The page the same-day recap email opens: light (no recording or transcript), so it is quick on a phone.
export default function RecapPage({ params }: PageProps<"/calls/[id]/recap">) {
  return (
    <Suspense fallback={<Loading what="recap" />}>
      <Recap params={params} />
    </Suspense>
  );
}

async function todayIst() {
  await connection();
  return toIst(new Date().toISOString()).slice(0, 10);
}

async function Recap({ params }: Pick<PageProps<"/calls/[id]/recap">, "params">) {
  const { id } = await params;
  const [me, recap, today] = await Promise.all([requireMe(), getMeetingRecap(id), todayIst()]);
  if (!recap) notFound();
  const consultant = recap.personId ? await getPerson(recap.personId) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/calls/${recap.callId}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← The call and its score
      </Link>
      <div className="mb-5 flex min-w-0 items-center gap-3.5">
        <Avatar name={recap.client.name.startsWith("+") ? "" : recap.client.name} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{recap.client.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[
              `Vision call, ${dayName(recap.meetingAt.slice(0, 10))} at ${formatClock(recap.meetingAt)}`,
              consultant ? `with ${consultant.name}` : null,
              recap.client.phone ? formatPhone(recap.client.phone) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <MeetingRecapCard recap={recap} today={today} viewer={me} full />
      {recap.leadId && (
        <p className="mt-4 text-sm">
          <Link href={`/leads/${recap.leadId}`} className="text-muted hover:text-foreground hover:underline">
            Open the lead <span aria-hidden="true">→</span>
          </Link>
        </p>
      )}
    </div>
  );
}
