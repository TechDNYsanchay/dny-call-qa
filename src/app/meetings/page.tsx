import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { BandBadge, Card, Loading, PageHeader, StatusLabel, WhatsAppButton } from "@/components/ui";
import { meetingLinkMessage } from "@/lib/booking";
import { requireMe } from "@/lib/data";
import { listBookings, type BookingRow } from "@/lib/data/meetings";
import { formatClock, formatDay } from "@/lib/format";
import { connection as googleConnection, googleConfigured } from "@/lib/google";
import { CancelMeetingButton, CopyLinkButton } from "./meeting-buttons";

export const metadata = { title: "Meetings · DNY Sales Agent" };

/** A meeting with no recording this long after it ended is shown as not recorded. */
const RECORDING_GRACE_MS = 3 * 3600_000;

export default function MeetingsPage({ searchParams }: PageProps<"/meetings">) {
  return (
    <Suspense fallback={<Loading what="meetings" />}>
      <Meetings searchParams={searchParams} />
    </Suspense>
  );
}

const PRIMARY = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90";
const ACTION = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-background";

/** The time this request is served. */
async function now() {
  await connection();
  return Date.now();
}

async function Meetings({ searchParams }: Pick<PageProps<"/meetings">, "searchParams">) {
  const me = await requireMe();
  const nowMs = await now();
  const params = await searchParams;
  const [rows, google] = await Promise.all([listBookings(me), googleConnection()]);
  const ready = googleConfigured() && google !== null;
  const ends = (r: BookingRow) => Date.parse(r.startsAt) + r.durationMin * 60_000;
  const upcoming = rows.filter((r) => r.status === "booked" && ends(r) > nowMs);
  const earlier = rows.filter((r) => !upcoming.includes(r)).reverse();

  return (
    <>
      <PageHeader
        title={me.canSeeAll ? "Meetings" : "My meetings"}
        subtitle="Book sales meetings here: everyone gets a Google Meet invite, tl;dv records the call, and it's scored the same night."
      >
        {ready ? (
          <Link href="/meetings/new" className={PRIMARY}>
            <span aria-hidden="true">+</span> Book a sales meeting
          </Link>
        ) : null}
      </PageHeader>

      <GoogleNotice status={typeof params.google === "string" ? params.google : null} reason={typeof params.reason === "string" ? params.reason : null} />
      <GoogleSetup admin={me.role === "admin"} configured={googleConfigured()} google={google} />

      <div className="space-y-6">
        <Card>
          <SectionTitle title="Coming up" count={upcoming.length} />
          {upcoming.length === 0 ? (
            <p className="py-2 text-sm text-muted">{ready ? "Nothing booked. Book the next vision call from here." : "Nothing booked yet."}</p>
          ) : (
            <ul className="-mx-4 divide-y divide-border sm:-mx-5">
              {upcoming.map((r) => (
                <MeetingRow key={r.id} row={r} showBooker={me.canSeeAll} canCancel={me.canSeeAll || r.bookedBy?.id === me.id || r.consultant?.id === me.id} live={Date.parse(r.startsAt) <= nowMs} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle title="Earlier" count={earlier.length} note="last 30 days" />
          {earlier.length === 0 ? (
            <p className="py-2 text-sm text-muted">No past meetings yet.</p>
          ) : (
            <ul className="-mx-4 divide-y divide-border sm:-mx-5">
              {earlier.map((r) => (
                <MeetingRow key={r.id} row={r} showBooker={me.canSeeAll} result={result(r, nowMs, ends(r))} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function SectionTitle({ title, count, note }: { title: string; count: number; note?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="rounded-full border border-border px-2 py-px text-xs tabular-nums text-muted">{count}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

/** What became of a past meeting. */
function result(r: BookingRow, nowMs: number, endMs: number) {
  if (r.status === "cancelled") return <span className="text-muted">Cancelled</span>;
  if (r.call?.score !== null && r.call?.score !== undefined && r.call.band)
    return (
      <Link href={`/calls/${r.call.id}`} className="inline-flex items-center gap-2 hover:underline">
        <BandBadge score={r.call.score} band={r.call.band} /> <span className="text-muted">Open the call →</span>
      </Link>
    );
  if (r.call)
    return (
      <Link href={`/calls/${r.call.id}`} className="text-muted hover:text-foreground hover:underline">
        Recorded · scored tonight
      </Link>
    );
  if (nowMs - endMs > RECORDING_GRACE_MS) return <StatusLabel band="amber">Not recorded</StatusLabel>;
  return <span className="text-muted">Waiting for tl;dv</span>;
}

function DateTile({ iso }: { iso: string }) {
  const day = Number(iso.slice(8, 10));
  const month = formatDay(iso).split(" ")[1];
  const weekday = new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return (
    <span className="grid w-12 shrink-0 overflow-hidden rounded-lg border border-border text-center" aria-hidden="true">
      <span className="bg-foreground/[0.04] py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">{month}</span>
      <span className="pt-0.5 text-lg font-semibold leading-6 tabular-nums">{day}</span>
      <span className="pb-1 text-2xs text-muted">{weekday}</span>
    </span>
  );
}

function MeetingRow({ row: r, showBooker, canCancel = false, live = false, result }: { row: BookingRow; showBooker: boolean; canCancel?: boolean; live?: boolean; result?: ReactNode }) {
  const detail = [`${formatClock(r.startsAt)} · ${r.durationMin} min`, r.consultant ? `with ${r.consultant.name}` : "host not on the team list", showBooker && r.bookedBy ? `booked by ${r.bookedBy.name}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-background/60 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <DateTile iso={r.startsAt} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            {r.leadId ? (
              <Link href={`/leads/${r.leadId}`} className="truncate hover:underline">
                {r.clientName}
              </Link>
            ) : (
              <span className="truncate">{r.clientName}</span>
            )}
            {live && <StatusLabel band="green">Now</StatusLabel>}
          </div>
          <div className="truncate text-xs text-muted">{detail}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {result ?? (
          <>
            {r.meetUrl && (
              <a href={r.meetUrl} target="_blank" rel="noopener noreferrer" className={ACTION}>
                Join
              </a>
            )}
            {r.meetUrl && <WhatsAppButton phone={r.clientPhone} text={meetingLinkMessage(r.clientName, r.startsAt, r.meetUrl)} label="Send link" />}
            {r.meetUrl && <CopyLinkButton text={r.meetUrl} />}
            {canCancel && <CancelMeetingButton id={r.id} client={r.clientName} />}
          </>
        )}
      </div>
    </li>
  );
}

/** After the Google consent page: connected, or why not. */
function GoogleNotice({ status, reason }: { status: string | null; reason: string | null }) {
  if (!status) return null;
  const text =
    status === "connected"
      ? `Google Calendar connected${reason ? ` as ${reason}` : ""}. Meetings booked here are now created on that calendar.`
      : status === "admin-only"
        ? "Only the admin can connect Google Calendar."
        : status === "not-configured"
          ? "The app's Google keys aren't set yet, so Google Calendar can't be connected."
          : `Google Calendar wasn't connected: ${reason ?? "something went wrong"}.`;
  return (
    <Card className={`mb-6 ${status === "connected" ? "" : "border-critical/40"}`}>
      <p className="text-sm">{text}</p>
    </Card>
  );
}

/** The admin connects the recording account once; everyone else sees whether booking is open. */
function GoogleSetup({ admin, configured, google }: { admin: boolean; configured: boolean; google: { email: string; connectedAt: string } | null }) {
  if (google && configured) {
    return admin ? (
      <p className="-mt-3 mb-5 text-xs text-muted">
        Meetings are created on <span className="font-medium text-foreground">{google.email}</span>&apos;s calendar, the account tl;dv records with ·{" "}
        <a href="/api/google/connect" className="underline hover:text-foreground">
          reconnect
        </a>
      </p>
    ) : null;
  }
  return (
    <Card className="mb-6 border-brand/40">
      <h2 className="text-sm font-semibold">Booking isn&apos;t switched on yet</h2>
      {admin ? (
        configured ? (
          <>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Connect the Google account tl;dv records with (tech@dnyhospitality.com). Meetings booked here are then created on its calendar, so tl;dv records every one.
            </p>
            <a href="/api/google/connect" className={`${PRIMARY} mt-3`}>
              Connect Google Calendar
            </a>
          </>
        ) : (
          <p className="mt-1 max-w-2xl text-sm text-muted">The app&apos;s Google Calendar keys (GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET) aren&apos;t set yet. Once they are, connect Google Calendar here.</p>
        )
      ) : (
        <p className="mt-1 text-sm text-muted">Booking opens once the admin connects Google Calendar.</p>
      )}
    </Card>
  );
}
