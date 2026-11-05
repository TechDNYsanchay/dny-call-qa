import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, Loading, PageHeader } from "@/components/ui";
import { requireMe } from "@/lib/data";
import { bookingLead, listMeetingHosts } from "@/lib/data/meetings";
import { toIst } from "@/lib/format";
import { connection as googleConnection, googleConfigured } from "@/lib/google";
import { BookingForm } from "./booking-form";

export const metadata = { title: "Book a sales meeting · DNY Sales Agent" };

export default function NewMeetingPage({ searchParams }: PageProps<"/meetings/new">) {
  return (
    <Suspense fallback={<Loading what="booking form" />}>
      <NewMeeting searchParams={searchParams} />
    </Suspense>
  );
}

/** Today and the next half hour, in IST, to start the form. */
function startingValues(nowMs: number) {
  const next = new Date(Math.ceil((nowMs + 15 * 60_000) / (30 * 60_000)) * 30 * 60_000);
  const ist = toIst(next.toISOString());
  return { date: ist.slice(0, 10), time: ist.slice(11, 16), minDate: toIst(new Date(nowMs).toISOString()).slice(0, 10) };
}

/** The time this request is served. */
async function now() {
  await connection();
  return Date.now();
}

async function NewMeeting({ searchParams }: Pick<PageProps<"/meetings/new">, "searchParams">) {
  const me = await requireMe();
  const nowMs = await now();
  const { lead: leadParam } = await searchParams;
  const [hosts, google, lead] = await Promise.all([listMeetingHosts(), googleConnection(), typeof leadParam === "string" ? bookingLead(leadParam) : null]);
  const ready = googleConfigured() && google !== null;
  const defaultHost = hosts.find((h) => h.id === me.id)?.id ?? (hosts.length === 1 ? hosts[0].id : null);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/meetings" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Meetings
      </Link>
      <PageHeader
        title="Book a sales meeting"
        subtitle="The client, the person taking the meeting and you get a Google Calendar invite with the Meet link. tl;dv records it, and it's scored the same night."
      />
      <Card>
        {!ready ? (
          <p className="text-sm text-muted">Booking opens once the admin connects Google Calendar on the Meetings page.</p>
        ) : hosts.length === 0 ? (
          <p className="text-sm text-muted">
            Nobody on the team list has an email yet, so there&apos;s no one to take the meeting. Ask the admin to add the lead consultants with their emails.
          </p>
        ) : (
          <BookingForm hosts={hosts} defaultHost={defaultHost} defaults={startingValues(nowMs)} lead={lead} meHasEmail={Boolean(me.email)} />
        )}
      </Card>
    </div>
  );
}
