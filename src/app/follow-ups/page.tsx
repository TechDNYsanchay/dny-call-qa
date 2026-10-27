import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, Chip, Loading, PageHeader, StatTile } from "@/components/ui";
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

const QUALITY = { hot: "Hot", warm: "Warm", cold: "Cold" } as const;

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
  const who = (id: string) => (me.canSeeAll ? ` · ${nameOf(id)}` : "");
  const day = (date: string) => relativeDay(date, today) ?? formatShortDay(date);
  const overdue = f.missed.filter((m) => isOverdue(m, nowMs));
  const callBacksDue = f.callBacks.filter((c) => !c.date || c.date <= today);

  return (
    <>
      <PageHeader
        title={me.canSeeAll ? "Follow-ups" : "My follow-ups"}
        subtitle={`${followUpCount(f)} to act on · updated every 15 minutes from Callyzer and each night's scoring`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Missed calls to return" value={f.missed.length} note={overdue.length ? `${overdue.length} waiting over ${MISSED_OVERDUE_HOURS} hours` : "none overdue"} />
        <StatTile label="Call-backs promised" value={f.callBacks.length} note={`${callBacksDue.length} due today or earlier`} />
        <StatTile label="Meetings coming up" value={f.meetings.length} note="booked on first calls" />
        <StatTile label="Leads to book" value={f.toBook.length} note={`hot or warm, no meeting, last ${14} days`} />
      </div>

      <div className="space-y-6">
        <Card title="Missed calls to return">
          <p className="mb-3 text-xs text-muted">
            Clients who called and haven&apos;t been called back. Calling them, or any call that connects, clears it. Mark it handled if they were reached another way or it wasn&apos;t a client. Numbers saved as Junk on the phone are left out, and misses drop off after 7 days.
          </p>
          {f.missed.length === 0 ? (
            <p className="text-sm text-muted">Every missed call has been returned.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.missed.map((m) => (
                <MissedRow key={m.phone} item={m} overdue={isOverdue(m, nowMs)} nowMs={nowMs} today={today} who={who(m.personId)} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Call-backs promised">
          {f.callBacks.length === 0 ? (
            <p className="text-sm text-muted">No call-backs waiting. They appear when a scored call ends with &quot;I&apos;ll call you back&quot; or the client asks to be called at a time.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.callBacks.map((c) => (
                <LeadRow key={c.leadId} item={c} who={who(c.personId)} badge={c.date ? (c.date < today ? `Overdue · ${day(c.date)}` : day(c.date)) : "No date"} late={Boolean(c.date && c.date < today)} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Meetings coming up">
          <p className="mb-3 text-xs text-muted">Video or in-person meetings fixed on a first call. Make sure the consultant has the details and the client has a WhatsApp reminder.</p>
          {f.meetings.length === 0 ? (
            <p className="text-sm text-muted">No meetings booked for the coming days.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.meetings.map((c) => (
                <LeadRow key={c.leadId} item={c} who={who(c.personId)} badge={c.date ? day(c.date) : "Date not clear"} late={false} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hot and warm leads with no meeting">
          <p className="mb-3 text-xs text-muted">From scored first calls in the last 14 days, with no call since that connected. One more call could book the meeting.</p>
          {f.toBook.length === 0 ? (
            <p className="text-sm text-muted">None: every hot or warm lead has a meeting or a later call.</p>
          ) : (
            <ul className="divide-y divide-border">
              {f.toBook.map((c) => (
                <LeadRow key={c.leadId} item={c} who={who(c.personId)} badge={c.quality ? QUALITY[c.quality] : null} late={false} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function MissedRow({ item, overdue, nowMs, today, who }: { item: MissedItem; overdue: boolean; nowMs: number; today: string; who: string }) {
  const hours = Math.floor((nowMs - Date.parse(item.firstAt)) / 3600_000);
  const waited = hours < 1 ? "under an hour" : hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""}`;
  const when = `${relativeDay(item.firstAt.slice(0, 10), today) ?? formatShortDay(item.firstAt)} ${formatClock(item.firstAt)}`;
  // Callyzer often has only the number; then the number is the heading, tap-to-call.
  const named = item.name !== formatPhone(item.phone);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="font-medium">
          {!named ? (
            <a href={`tel:${item.phone}`} className="hover:underline">
              {formatPhone(item.phone)}
            </a>
          ) : item.leadId ? (
            <Link href={`/leads/${item.leadId}`} className="hover:underline">
              {item.name}
            </Link>
          ) : (
            item.name
          )}
        </div>
        <div className="text-xs text-muted">
          {named && (
            <a href={`tel:${item.phone}`} className="hover:text-foreground">
              {formatPhone(item.phone)}
            </a>
          )}
          {`${named ? " · " : ""}missed ${item.count === 1 ? "once" : `${item.count} times`} · first at ${when} · waiting ${waited}${who}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {overdue && <Chip>Over 2 hours</Chip>}
        <HandledButton callIds={item.callIds} />
      </div>
    </li>
  );
}

function LeadRow({ item, who, badge, late }: { item: LeadFollowUp; who: string; badge: string | null; late: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <Link href={`/leads/${item.leadId}`} className="font-medium hover:underline">
          {item.name}
        </Link>
        <div className="text-xs text-muted">
          {[item.city, item.when, item.kind === "book_meeting" ? `last call ${formatShortDay(item.lastCallAt)}` : null].filter(Boolean).join(" · ")}
          {who}
          {" · "}
          <Link href={`/calls/${item.callId}`} className="hover:text-foreground hover:underline">
            the call
          </Link>
        </div>
      </div>
      {badge && <span className={`whitespace-nowrap text-xs ${late ? "font-semibold text-critical" : "text-muted"}`}>{badge}</span>}
    </li>
  );
}
