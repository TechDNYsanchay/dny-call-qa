// What each executive should act on today: missed client calls nobody returned, call-backs that
// were promised, meetings booked, and hot or warm leads with no meeting yet. Pure functions over
// call records, so the Follow-ups page, the 8 am email and the missed-call alert agree.

import type { CallRecord } from "@/lib/data/types";
import { addDays } from "@/lib/format";

/** A missed call counts as unanswered after this long without a call back. */
export const MISSED_OVERDUE_HOURS = 2;
/** Leads come off the list when their last scored call is older than this. */
export const LEAD_WINDOW_DAYS = 14;
/** Missed calls come off the list after this. */
export const MISSED_WINDOW_DAYS = 7;
/** Numbers the executive saved on the phone as junk or spam aren't clients. */
const NOT_A_CLIENT = /\b(junk|spam)\b/i;

export interface MissedItem {
  phone: string;
  leadId?: string;
  /** The lead's name, else the formatted number. */
  name: string;
  /** Whose phone it rang on (the latest miss). */
  personId: string;
  /** IST timestamps of the first and latest miss since the last contact. */
  firstAt: string;
  lastAt: string;
  count: number;
  callIds: string[];
  /** Every miss in it was already in an alert email. */
  alerted: boolean;
}

const isMissed = (c: CallRecord) => c.direction === "missed" || c.direction === "rejected";
/** Any call DNY made to the number, or any call that connected, counts as getting back to them. */
const isContact = (c: CallRecord) => c.direction === "outgoing" || c.durationSec > 0;
const byTime = (a: CallRecord, b: CallRecord) => a.startedAt.localeCompare(b.startedAt);

/**
 * Client numbers whose latest missed or rejected calls haven't been returned, one item per number.
 * A later outgoing call (answered or not) or any connected call clears it, as does marking it handled.
 * Calls between team phones are left out.
 */
export function openMissedCalls(calls: CallRecord[], teamPhones: ReadonlySet<string>): MissedItem[] {
  const byPhone = new Map<string, CallRecord[]>();
  for (const c of [...calls].sort(byTime)) {
    if (!c.clientPhone || teamPhones.has(c.clientPhone)) continue;
    const list = byPhone.get(c.clientPhone) ?? [];
    list.push(c);
    byPhone.set(c.clientPhone, list);
  }
  const items: MissedItem[] = [];
  for (const [phone, list] of byPhone) {
    let open: CallRecord[] = [];
    for (const c of list) {
      if (isMissed(c)) open = c.missedHandled ? [] : [...open, c];
      else if (isContact(c)) open = [];
    }
    if (open.length === 0) continue;
    const last = open[open.length - 1];
    if (NOT_A_CLIENT.test(last.client.name)) continue;
    items.push({
      phone,
      leadId: last.leadId,
      name: last.client.name,
      personId: last.personId,
      firstAt: open[0].startedAt,
      lastAt: last.startedAt,
      count: open.length,
      callIds: open.map((c) => c.id),
      alerted: open.every((c) => c.missedAlerted),
    });
  }
  return items.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

/** Waiting longer than MISSED_OVERDUE_HOURS at `nowMs`. */
export function isOverdue(item: MissedItem, nowMs: number): boolean {
  return Date.parse(item.firstAt) <= nowMs - MISSED_OVERDUE_HOURS * 3600_000;
}

export type LeadFollowUpKind = "call_back" | "meeting" | "book_meeting";

export interface LeadFollowUp {
  kind: LeadFollowUpKind;
  leadId: string;
  name: string;
  city: string | null;
  phone?: string;
  personId: string;
  /** The scored call it comes from. */
  callId: string;
  /** As said on the call, e.g. "Sunday 25 Oct 2026, 4:00 pm" or "after Diwali". */
  when: string | null;
  /** YYYY-MM-DD when known. */
  date: string | null;
  quality: "hot" | "warm" | "cold" | null;
  /** IST timestamp of the latest call with the lead, answered or not. */
  lastCallAt: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Sunday 25 Oct 2026, 4 pm" -> "2026-10-25". Without a year, the next such date on or after `fromDay`'s month. */
export function dateFromText(text: string, fromDay: string): string | null {
  const m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?(?:\s+(\d{4}))?/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (day < 1 || day > 31) return null;
  let year = m[3] ? Number(m[3]) : Number(fromDay.slice(0, 4));
  const iso = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // "5 Jan" said in December means next year.
  if (!m[3] && iso(year) < addDays(fromDay, -60)) year += 1;
  return iso(year);
}

/**
 * One item per open lead, from its latest scored first call: the booked meeting (if it's still to
 * come), else a promised call-back not yet made, else a hot or warm lead with no meeting. A later
 * call that connected counts as the follow-up done. Leads past "open" are left to the lead page.
 */
export function leadFollowUps(calls: CallRecord[], today: string): LeadFollowUp[] {
  const byLead = new Map<string, CallRecord[]>();
  for (const c of [...calls].sort(byTime)) {
    if (!c.leadId) continue;
    const list = byLead.get(c.leadId) ?? [];
    list.push(c);
    byLead.set(c.leadId, list);
  }
  const items: LeadFollowUp[] = [];
  for (const [leadId, list] of byLead) {
    const last = list[list.length - 1];
    if (last.leadStatus && last.leadStatus !== "open") continue;
    const scored = list.filter((c) => c.final && c.result?.stream === "first_call");
    const source = scored[scored.length - 1];
    if (!source || source.result?.stream !== "first_call") continue;
    const capture = source.result.capture;
    const callDay = source.startedAt.slice(0, 10);
    const connectedSince = list.some((c) => c.startedAt > source.startedAt && c.durationSec > 0);
    const base = {
      leadId,
      name: capture.clientName ?? source.client.name,
      city: capture.city,
      phone: source.clientPhone,
      personId: source.personId,
      callId: source.id,
      quality: capture.leadQuality,
      lastCallAt: last.startedAt,
    };
    if (capture.vcDateTime) {
      const date = capture.vcDate ?? dateFromText(capture.vcDateTime, callDay);
      const upcoming = date ? date >= today : callDay >= addDays(today, -7);
      if (upcoming) items.push({ ...base, kind: "meeting", when: capture.vcDateTime, date });
    } else if (capture.callBack && !connectedSince) {
      const date = capture.callBack.date;
      if (date || callDay >= addDays(today, -LEAD_WINDOW_DAYS)) items.push({ ...base, kind: "call_back", when: capture.callBack.when, date });
    } else if ((capture.leadQuality === "hot" || capture.leadQuality === "warm") && !connectedSince && callDay >= addDays(today, -LEAD_WINDOW_DAYS)) {
      items.push({ ...base, kind: "book_meeting", when: null, date: null });
    }
  }
  // Soonest date first (undated last), then hot before warm, then the most recent call.
  return items.sort(
    (a, b) =>
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      Number(b.quality === "hot") - Number(a.quality === "hot") ||
      b.lastCallAt.localeCompare(a.lastCallAt),
  );
}

export interface FollowUps {
  missed: MissedItem[];
  callBacks: LeadFollowUp[];
  meetings: LeadFollowUp[];
  toBook: LeadFollowUp[];
}

/** Everything, or one person's share. */
export function followUps(calls: CallRecord[], teamPhones: ReadonlySet<string>, today: string, personId?: string): FollowUps {
  const mine = <T extends { personId: string }>(list: T[]) => (personId ? list.filter((x) => x.personId === personId) : list);
  const leads = mine(leadFollowUps(calls, today));
  return {
    missed: mine(openMissedCalls(calls, teamPhones)).filter((m) => m.lastAt.slice(0, 10) >= addDays(today, -MISSED_WINDOW_DAYS)),
    callBacks: leads.filter((f) => f.kind === "call_back"),
    meetings: leads.filter((f) => f.kind === "meeting"),
    toBook: leads.filter((f) => f.kind === "book_meeting"),
  };
}

export function forPerson(f: FollowUps, personId: string): FollowUps {
  const mine = <T extends { personId: string }>(list: T[]) => list.filter((x) => x.personId === personId);
  return { missed: mine(f.missed), callBacks: mine(f.callBacks), meetings: mine(f.meetings), toBook: mine(f.toBook) };
}

export const followUpCount = (f: FollowUps) => f.missed.length + f.callBacks.length + f.meetings.length + f.toBook.length;

/** "Today", "Tomorrow", "Yesterday", else null (caller formats the date). */
export function relativeDay(date: string, today: string): string | null {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return null;
}
