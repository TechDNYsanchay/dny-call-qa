// Patterns across many calls: when clients pick up, and how fast missed calls are returned.
// Pure functions over call records, for the Roll-ups page.

import type { CallRecord } from "@/lib/data/types";
import { isNotAClient, MISSED_OVERDUE_HOURS } from "@/lib/follow-ups";

export interface HourStat {
  /** IST hour of the day, 0-23. */
  hour: number;
  /** Outgoing calls made in that hour, and how many connected. */
  attempts: number;
  connected: number;
  /** Clients calling in during that hour. */
  incoming: number;
}

const istHour = (c: CallRecord) => Number(c.startedAt.slice(11, 13));

/** Outgoing calls and how many connected, per IST hour, from the first to the last hour with calls. */
export function pickupByHour(calls: CallRecord[]): HourStat[] {
  const byHour = new Map<number, HourStat>();
  const at = (hour: number) => byHour.get(hour) ?? byHour.set(hour, { hour, attempts: 0, connected: 0, incoming: 0 }).get(hour)!;
  for (const c of calls) {
    if (c.direction === "outgoing") {
      const h = at(istHour(c));
      h.attempts++;
      if (c.durationSec > 0) h.connected++;
    } else if (c.direction === "incoming" || c.direction === "missed" || c.direction === "rejected") {
      at(istHour(c)).incoming++;
    }
  }
  if (byHour.size === 0) return [];
  const hours = [...byHour.keys()];
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  return Array.from({ length: last - first + 1 }, (_, i) => byHour.get(first + i) ?? { hour: first + i, attempts: 0, connected: 0, incoming: 0 });
}

/** Hours with too few outgoing calls to read a pickup rate from. */
export const MIN_ATTEMPTS = 3;

export interface MissedResponse {
  personId: string;
  phone: string;
  /** IST timestamp of the first miss since the last contact. */
  missedAt: string;
  /** The first call back (or connected call) after it, if any. */
  returnedAt: string | null;
  minutes: number | null;
  /** Marked handled on the Follow-ups page instead of called back. */
  handled: boolean;
}

/**
 * Each time a client's call went unanswered: when, and how long until DNY called back (any
 * outgoing call, or a call that connected). Repeat misses before a call back count once.
 * Calls between team phones and numbers saved as junk are left out.
 */
export function missedResponses(calls: CallRecord[], teamPhones: ReadonlySet<string>): MissedResponse[] {
  const byPhone = new Map<string, CallRecord[]>();
  for (const c of [...calls].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (!c.clientPhone || teamPhones.has(c.clientPhone)) continue;
    byPhone.set(c.clientPhone, [...(byPhone.get(c.clientPhone) ?? []), c]);
  }
  const out: MissedResponse[] = [];
  for (const [phone, list] of byPhone) {
    if (isNotAClient(list[list.length - 1].client.name)) continue;
    let open: MissedResponse | null = null;
    for (const c of list) {
      const missed = c.direction === "missed" || c.direction === "rejected";
      if (missed) {
        if (c.missedHandled) {
          if (open) open.handled = true;
          else out.push({ personId: c.personId, phone, missedAt: c.startedAt, returnedAt: null, minutes: null, handled: true });
          open = null;
        } else if (!open) {
          open = { personId: c.personId, phone, missedAt: c.startedAt, returnedAt: null, minutes: null, handled: false };
          out.push(open);
        }
      } else if (open && (c.direction === "outgoing" || c.durationSec > 0)) {
        open.returnedAt = c.startedAt;
        open.minutes = Math.round((Date.parse(c.startedAt) - Date.parse(open.missedAt)) / 60_000);
        open = null;
      }
    }
  }
  return out.sort((a, b) => a.missedAt.localeCompare(b.missedAt));
}

export interface ResponseSummary {
  missed: number;
  withinTarget: number;
  later: number;
  never: number;
  handled: number;
  /** Median minutes to the call back, over the ones returned. */
  medianMinutes: number | null;
}

export function summariseResponses(list: MissedResponse[]): ResponseSummary {
  const returned = list.filter((r) => r.minutes !== null).map((r) => r.minutes!).sort((a, b) => a - b);
  const mid = Math.floor(returned.length / 2);
  return {
    missed: list.length,
    withinTarget: returned.filter((m) => m <= MISSED_OVERDUE_HOURS * 60).length,
    later: returned.filter((m) => m > MISSED_OVERDUE_HOURS * 60).length,
    never: list.filter((r) => r.minutes === null && !r.handled).length,
    handled: list.filter((r) => r.handled).length,
    medianMinutes: returned.length === 0 ? null : returned.length % 2 ? returned[mid] : Math.round((returned[mid - 1] + returned[mid]) / 2),
  };
}

/** 95 -> "1 h 35 min", 2900 -> "2 days" */
export function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const days = Math.round(minutes / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** 13 -> "1 pm" */
export function hourLabel(hour: number): string {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}
