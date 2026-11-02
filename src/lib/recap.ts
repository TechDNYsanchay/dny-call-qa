// After a vision call: the next steps agreed (the consultant's to-do list), one-tap calendar
// entries for them, and a recap message ready for the consultant to send the client.
// Pure, so the screens and the emails agree.

import { addDays } from "@/lib/format";
import type { Recap } from "@/lib/scoring/schema";
import { dayName, timeIn } from "@/lib/whatsapp";

export type ActionOwner = "dny" | "client";
export type ActionKind = "proposal" | "review_call" | "other";

export interface MeetingAction {
  id: string;
  callId: string;
  leadId: string | null;
  owner: ActionOwner;
  kind: ActionKind;
  task: string;
  /** YYYY-MM-DD, or null when no day was said. */
  due: string | null;
  /** As said on the call: "by Friday", "Monday at 4". */
  dueText: string | null;
  quote: string | null;
  quoteAt: string | null;
  /** IST timestamp, or null while open. */
  doneAt: string | null;
  /** The consultant who ran the meeting. */
  personId: string;
  /** When the meeting started, IST. */
  meetingAt: string;
  client: { name: string; phone: string | null; email: string | null };
}

/** One meeting's recap with its next steps as they stand now (some may be ticked off). */
export interface MeetingRecap {
  callId: string;
  leadId: string | null;
  personId: string;
  meetingAt: string;
  client: MeetingAction["client"];
  summary: string;
  keyPoints: Recap["keyPoints"];
  openQuestions: string[];
  actions: MeetingAction[];
  score: { score: number; band: "green" | "amber" | "red" } | null;
}

export type ActionState = "done" | "overdue" | "today" | "upcoming" | "no_date";

export function actionState(a: Pick<MeetingAction, "due" | "doneAt">, today: string): ActionState {
  if (a.doneAt) return "done";
  if (!a.due) return "no_date";
  return a.due < today ? "overdue" : a.due === today ? "today" : "upcoming";
}

/** Open ones first, soonest due first (no date last); then the ones done. */
export function byDue(a: MeetingAction, b: MeetingAction): number {
  if (Boolean(a.doneAt) !== Boolean(b.doneAt)) return a.doneAt ? 1 : -1;
  return (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.meetingAt.localeCompare(b.meetingAt);
}

const MONTH = /^\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
// Transcripts often spell the hour out: "at eleven", "around four thirty".
const HOURS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const SPELLED = new RegExp(`\\b(at|around)\\s+(${HOURS.join("|")})(?:\\s+(thirty|fifteen|forty[ -]five))?\\b`, "gi");
const MINUTES: Record<string, string> = { thirty: ":30", fifteen: ":15", "forty five": ":45", "forty-five": ":45" };

/**
 * The time agreed, as "4 pm", from what was said. A plain "at 4" on a working day means 4 pm
 * (1 to 7 are afternoon, 8 to 11 morning); null when no time was said.
 */
export function agreedTime(said: string | null | undefined): string | null {
  if (!said) return null;
  const text = said.replace(SPELLED, (_, at: string, hour: string, minutes?: string) => `${at} ${HOURS.indexOf(hour.toLowerCase()) + 1}${minutes ? MINUTES[minutes.toLowerCase()] : ""}`);
  if (/\d\s*(?:am|pm)\b/i.test(text) || /\b(?:0\d|1[3-9]|2[0-3]):[0-5]\d\b/.test(text)) return timeIn(text);
  const m = text.match(/\b(?:at|around)\s+(\d{1,2})(?:[:.]([0-5]\d))?\b(.*)$/i);
  if (!m || MONTH.test(m[3])) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  const half = hour === 12 || hour <= 7 ? "pm" : "am";
  return m[2] && m[2] !== "00" ? `${hour}:${m[2]} ${half}` : `${hour} ${half}`;
}

/** "4:30 pm" -> [16, 30] */
function clock(time: string): [number, number] {
  const [, h, m, half] = time.match(/^(\d{1,2})(?::(\d{2}))? (am|pm)$/)!;
  return [(Number(h) % 12) + (half === "pm" ? 12 : 0), Number(m ?? 0)];
}

/** When it's due, for a list: "Mon 27 Oct, 4 pm" for a call, "by Fri 24 Oct" for a task, or what was said. */
export function dueLabel(a: Pick<MeetingAction, "kind" | "due" | "dueText">, short = false): string | null {
  const name = (d: string) => (short ? dayName(d).replace(/^(\w{3})\w*/, "$1") : dayName(d));
  if (!a.due) return a.dueText;
  const time = agreedTime(a.dueText);
  return a.kind === "review_call" ? `${name(a.due)}${time ? `, ${time}` : ""}` : `by ${name(a.due)}${time ? `, ${time}` : ""}`;
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const firstName = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return /^\p{L}{2,}$/u.test(first) ? first : null;
};

/** What the calendar entry is called: the task for DNY's own steps, a reminder to check for the client's. */
export function calendarTitle(a: Pick<MeetingAction, "owner" | "kind" | "task">, client: string): string {
  if (a.owner === "client") return `Check: ${firstName(client) ?? client} to ${lowerFirst(a.task)}`;
  return a.kind === "review_call" ? `Review call · ${client}` : `${a.task} · ${client}`;
}

/**
 * A Google Calendar link that opens a new event filled in: at the time agreed (30 minutes, IST),
 * or all day on the due date. Null when there is no date.
 */
export function calendarLink(a: Pick<MeetingAction, "owner" | "kind" | "task" | "due" | "dueText" | "quote">, client: string, recapUrl: string): string | null {
  if (!a.due) return null;
  const time = agreedTime(a.dueText);
  let dates: string;
  if (time) {
    const [h, m] = clock(time);
    const start = new Date(`${a.due}T00:00:00Z`);
    start.setUTCHours(h, m);
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").slice(0, 15);
    dates = `${stamp(start)}/${stamp(new Date(start.getTime() + 30 * 60_000))}`;
  } else {
    dates = `${a.due.replaceAll("-", "")}/${addDays(a.due, 1).replaceAll("-", "")}`;
  }
  const details = [a.quote ? `Agreed on the call: “${a.quote}”` : "Agreed on the vision call.", `Recap: ${recapUrl}`].join("\n\n");
  const params = new URLSearchParams({ action: "TEMPLATE", text: calendarTitle(a, client), dates, details, ctz: "Asia/Kolkata" });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const SIGN_OFF = "– DNY Hospitality";

/**
 * The recap for the consultant to send the client after the meeting (WhatsApp or email): thanks,
 * then each side's next steps with their dates. Only the agreed steps: the summary and key points
 * are notes for DNY, written about the client.
 */
export function clientRecapMessage(name: string, actions: Pick<MeetingAction, "owner" | "kind" | "task" | "due" | "dueText">[], meetingDay: string, today: string): string {
  const first = firstName(name);
  const when = meetingDay === today ? "today" : `on ${dayName(meetingDay)}`;
  const line = (a: (typeof actions)[number]) => {
    const due = dueLabel(a);
    return `• ${a.task}${due ? ` – ${due}` : ""}`;
  };
  const ours = actions.filter((a) => a.owner === "dny").map(line);
  const theirs = actions.filter((a) => a.owner === "client").map(line);
  const greeting = `${first ? `Hi ${first}` : "Hi"}, thank you for your time ${when}. It was great to hear about your plans.`;
  if (!ours.length && !theirs.length) return `${greeting} We'll be in touch with the next steps shortly. ${SIGN_OFF}`;
  return [
    `${greeting} A quick recap of the next steps we agreed:`,
    ours.length ? `From our side:\n${ours.join("\n")}` : null,
    theirs.length ? `From your side:\n${theirs.join("\n")}` : null,
    `Looking forward to it! ${SIGN_OFF}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A friendly nudge when the client's step is overdue. */
export function clientNudgeMessage(name: string, task: string, meetingDay: string): string {
  const first = firstName(name);
  return `${first ? `Hi ${first}` : "Hi"}, hope you're doing well. Following up on our call on ${dayName(meetingDay)}: whenever you're ready, please ${lowerFirst(task)}. Happy to help if you need anything. ${SIGN_OFF}`;
}

/** A link that opens the email app with the recap ready to send. */
export function recapMailto(email: string | null, text: string): string {
  return `mailto:${email ?? ""}?${new URLSearchParams({ subject: "Next steps from our call", body: text }).toString().replace(/\+/g, "%20")}`;
}
