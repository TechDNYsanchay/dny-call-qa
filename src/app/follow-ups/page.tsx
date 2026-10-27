import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Avatar, CalendarIcon, Card, DownloadButton, Loading, PageHeader, QualityPill, StatTile, StatusLabel } from "@/components/ui";
import { getFollowUps, listPeople, requireMe } from "@/lib/data";
import { followUpCount, isOverdue, MISSED_OVERDUE_HOURS, relativeDay, type LeadFollowUp, type MissedItem } from "@/lib/follow-ups";
import { formatClock, formatPhone, formatShortDay, toIst } from "@/lib/format";
import { HandledButton } from "./handled-button";

export const metadata = { title: "Follow-ups · DNY Sales Agent" };

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<Loading what="follow-ups" />}>
      <FollowUpList />
    </Suspense>
  );
}

/** The time this request is served, and its IST day. */
async function now() {
  await connection();
  const nowMs = Date.now();
  return { nowMs, today: toIst(new Date(nowMs).toISOString()).slice(0, 10) };
}

async function FollowUpList() {
  const me = await requireMe();
  const { nowMs, today } = await now();
  const [f, people] = await Promise.all([getFollowUps(me, today), listPeople()]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Not on the team list";
  const day = (date: string) => relativeDay(date, today) ?? formatShortDay(date);
  const overdue = f.missed.filter((m) => isOverdue(m, nowMs));
  const callBacksDue = f.callBacks.filter((c) => !c.date || c.date <= today);

  const nextMeeting = f.meetings.find((m) => m.date)?.date;
  const hotToBook = f.toBook.filter((c) => c.quality === "hot").length;
  const person = (id: string) => (me.canSeeAll ? nameOf(id) : null);

  return (
    <>
      <PageHeader
        title={me.canSeeAll ? "Follow-ups" : "My follow-ups"}
        subtitle={`${followUpCount(f)} to act on · updated every 15 minutes from Callyzer and each night's scoring`}
      >
        <DownloadButton href="/api/export/follow-ups" />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Missed calls to return"
          value={overdue.length ? <StatusLabel band="red">{f.missed.length}</StatusLabel> : f.missed.length}
          note={overdue.length ? `${overdue.length} waiting over ${MISSED_OVERDUE_HOURS} hours` : "none waiting long"}
        />
        <StatTile
          label="Call-backs promised"
          value={callBacksDue.length ? <StatusLabel band="amber">{f.callBacks.length}</StatusLabel> : f.callBacks.length}
          note={`${callBacksDue.length} due today or earlier`}
        />
        <StatTile label="Meetings coming up" value={f.meetings.length} note={nextMeeting ? `next: ${day(nextMeeting)}` : "booked on first calls"} />
        <StatTile label="Leads to book" value={f.toBook.length} note={`${hotToBook} hot · last 14 days`} />
      </div>

      <div className="space-y-6">
        <Section
          title="Missed calls to return"
          count={f.missed.length}
          description="Clients who called and haven't been called back. Calling them, or any call that connects, clears it. Mark it handled if they were reached another way or it wasn't a client. Numbers saved as Junk are left out; misses drop off after 7 days."
          empty="Every missed call has been returned."
        >
          {f.missed.map((m) => (
            <MissedRow key={m.phone} item={m} overdue={isOverdue(m, nowMs)} nowMs={nowMs} today={today} person={person(m.personId)} />
          ))}
        </Section>

        <Section
          title="Call-backs promised"
          count={f.callBacks.length}
          description="When a scored call ends with “I'll call you back”, or the client asks to be called at a time."
          empty="No call-backs waiting."
        >
          {f.callBacks.map((c) => {
            const late = Boolean(c.date && c.date < today);
            const due = c.date === today;
            return (
              <LeadRow
                key={c.leadId}
                item={c}
                person={person(c.personId)}
                detail={c.when}
                aside={
                  c.date ? (
                    late ? (
                      <StatusLabel band="red">Overdue · {day(c.date)}</StatusLabel>
                    ) : due ? (
                      <StatusLabel band="amber">Today</StatusLabel>
                    ) : (
                      <span className="font-medium">{day(c.date)}</span>
                    )
                  ) : (
                    <span className="text-muted">No date</span>
                  )
                }
              />
            );
          })}
        </Section>

        <Section
          title="Meetings coming up"
          count={f.meetings.length}
          description="Video or in-person meetings fixed on a first call. Make sure the consultant has the details and the client has a WhatsApp reminder."
          empty="No meetings booked for the coming days."
        >
          {f.meetings.map((c) => (
            <LeadRow
              key={c.leadId}
              item={c}
              person={person(c.personId)}
              detail={c.when}
              aside={
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <CalendarIcon />
                  {c.date ? day(c.date) : "Date not clear"}
                </span>
              }
            />
          ))}
        </Section>

        <Section
          title="Hot and warm leads with no meeting"
          count={f.toBook.length}
          description="From scored first calls in the last 14 days, with no call since that connected. One more call could book the meeting."
          empty="None: every hot or warm lead has a meeting or a later call."
        >
          {f.toBook.map((c) => (
            <LeadRow
              key={c.leadId}
              item={c}
              person={person(c.personId)}
              detail={`last call ${formatShortDay(c.lastCallAt)}`}
              aside={c.quality && c.quality !== "cold" ? <QualityPill quality={c.quality} /> : null}
            />
          ))}
        </Section>
      </div>
    </>
  );
}

/** A card with its count beside the title, a line on what belongs in it, and the rows. */
function Section({ title, count, description, empty, children }: { title: string; count: number; description: string; empty: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full border border-border px-2 py-px text-xs tabular-nums text-muted">{count}</span>
      </div>
      <p className="mb-3 max-w-3xl text-xs text-muted">{description}</p>
      {count === 0 ? <p className="py-2 text-sm text-muted">{empty}</p> : <ul className="-mx-4 divide-y divide-border sm:-mx-5">{children}</ul>}
    </Card>
  );
}

/** Tap to call: dials on a phone, opens the dialer app on a computer. */
function CallButton({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      title={`Call ${formatPhone(phone)}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path
          d="M5.6 2.2 4 2c-1 0-1.9.9-1.8 1.9.4 4.9 4.9 9.4 9.8 9.8 1 .1 1.9-.8 1.9-1.8l-.2-1.6c-.1-.5-.5-.9-1-1l-1.8-.4c-.5-.1-.9.1-1.2.4l-.6.7c-1.5-.7-2.7-1.9-3.4-3.4l.7-.6c.4-.3.5-.8.4-1.2L6.6 3.2c-.1-.5-.5-.9-1-1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      Call
    </a>
  );
}

const ROW = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-background/60 sm:px-5";

function MissedRow({ item, overdue, nowMs, today, person }: { item: MissedItem; overdue: boolean; nowMs: number; today: string; person: string | null }) {
  const hours = Math.floor((nowMs - Date.parse(item.firstAt)) / 3600_000);
  const waited = hours < 1 ? "under an hour" : hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""}`;
  const when = `${relativeDay(item.firstAt.slice(0, 10), today) ?? formatShortDay(item.firstAt)} ${formatClock(item.firstAt)}`;
  // Callyzer often has only the number; then the number is the heading.
  const named = item.name !== formatPhone(item.phone);
  return (
    <li className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={named ? item.name : ""} />
        <div className="min-w-0">
          <div className="max-w-md truncate font-medium" title={item.name}>
            {named && item.leadId ? (
              <Link href={`/leads/${item.leadId}`} className="hover:underline">
                {item.name}
              </Link>
            ) : (
              item.name
            )}
          </div>
          <div className="text-xs text-muted">
            {[named ? formatPhone(item.phone) : null, `missed ${item.count === 1 ? "once" : `${item.count} times`}`, `first at ${when}`, person].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs">{overdue ? <StatusLabel band="red">Waiting {waited}</StatusLabel> : <span className="text-muted">Waiting {waited}</span>}</span>
        <CallButton phone={item.phone} />
        <HandledButton callIds={item.callIds} />
      </div>
    </li>
  );
}

function LeadRow({ item, person, detail, aside }: { item: LeadFollowUp; person: string | null; detail: string | null; aside: ReactNode }) {
  return (
    <li className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={item.name.startsWith("+") ? "" : item.name} />
        <div className="min-w-0">
          <Link href={`/leads/${item.leadId}`} title={item.name} className="block max-w-md truncate font-medium hover:underline">
            {item.name}
          </Link>
          <div className="max-w-xl truncate text-xs text-muted" title={detail ?? undefined}>
            {[detail, item.city, person].filter(Boolean).join(" · ")}
            {" · "}
            <Link href={`/calls/${item.callId}`} className="hover:text-foreground hover:underline">
              listen to the call
            </Link>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {aside && <span className="text-xs">{aside}</span>}
        {item.phone && <CallButton phone={item.phone} />}
      </div>
    </li>
  );
}
