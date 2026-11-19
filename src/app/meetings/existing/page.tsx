import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, Loading, PageHeader } from "@/components/ui";
import { requireMe } from "@/lib/data";
import { listMeetingHosts } from "@/lib/data/meetings";
import { toIst } from "@/lib/format";
import { connection as googleConnection, googleConfigured } from "@/lib/google";
import { ExistingMeetingForm } from "./existing-form";

export const metadata = { title: "Add an existing meeting · DNY Sales Agent" };

export default function ExistingMeetingPage() {
  return (
    <Suspense fallback={<Loading what="form" />}>
      <ExistingMeeting />
    </Suspense>
  );
}

/** The time this request is served. */
async function now() {
  await connection();
  return Date.now();
}

async function ExistingMeeting() {
  const me = await requireMe();
  const nowMs = await now();
  const [hosts, google] = await Promise.all([listMeetingHosts(), googleConnection()]);
  const ready = googleConfigured() && google !== null;
  const today = toIst(new Date(nowMs).toISOString()).slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/meetings" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← Meetings
      </Link>
      <PageHeader
        title="Add an existing meeting"
        subtitle="For a sales meeting someone set up on their own calendar. Paste its Google Meet link: the app puts a copy on the recording calendar so tl;dv records it, and scores it minutes after it ends. Nobody gets an email."
      />
      <Card>
        {ready ? (
          <ExistingMeetingForm hosts={hosts} defaultHost={hosts.find((h) => h.id === me.id)?.id ?? null} today={today} />
        ) : (
          <p className="text-sm text-muted">This opens once the admin connects Google Calendar on the Meetings page.</p>
        )}
      </Card>
    </div>
  );
}
