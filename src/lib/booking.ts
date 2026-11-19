// Sales meetings booked from the app. The Google Calendar event goes on the recording account's
// calendar (it organises; the client, the consultant and the booker are guests), so tl;dv's bot
// records it, and the Meet code tl;dv sends back ties the recording to the booking. Pure.

import { z } from "zod";
import { toE164 } from "@/lib/callyzer";
import { DNY_EMAIL_DOMAIN } from "@/lib/tldv";
import { dayName, timeIn } from "@/lib/whatsapp";

export const DURATIONS = [30, 45, 60, 90] as const;
export const DEFAULT_DURATION = 45;
/** Meetings can be booked this far ahead. */
const MAX_DAYS_AHEAD = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The title also marks it as a sales meeting for the sorting in both apps. */
export const meetingTitle = (clientName: string) => `Vision call: ${clientName} × DNY Hospitality`;

/** "Vision call" in a meeting title (any spacing or hyphen) marks a sales meeting. */
export const isSalesTitle = (title: string | null | undefined) => /\bvision[\s-]*call\b/i.test(title ?? "");

/** "https://meet.google.com/abc-defg-hij?x" or "ABC-DEFG-HIJ" -> "abc-defg-hij"; null if neither. */
export function meetCode(value: string | null | undefined): string | null {
  const m = (value ?? "").toLowerCase().match(/\b([a-z]{3}-[a-z]{4}-[a-z]{3})\b/);
  return m ? m[1] : null;
}

const text = (max: number) => z.string().trim().max(max);

const BookingFormSchema = z.object({
  clientName: text(80).min(2, "Add the client's name"),
  clientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Check the client's email"))
    .refine((e) => !e.endsWith(`@${DNY_EMAIL_DOMAIN}`), "Use the client's own email: meetings with only DNY addresses aren't recorded"),
  clientPhone: text(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
  durationMin: z.coerce.number().refine((n) => (DURATIONS as readonly number[]).includes(n), "Pick a length"),
  consultantId: z.string().regex(UUID, "Pick who will take the meeting"),
  addMe: z.boolean(),
  leadId: z.string().regex(UUID).optional(),
  notes: text(500).optional(),
});

export interface BookingRequest {
  clientName: string;
  clientEmail: string;
  /** E.164, or null. */
  clientPhone: string | null;
  /** ISO timestamp, IST offset. */
  startsAt: string;
  durationMin: number;
  consultantId: string;
  addMe: boolean;
  leadId: string | null;
  notes: string | null;
}

export type FieldErrors = Partial<Record<keyof z.infer<typeof BookingFormSchema> | "form", string>>;

/** Checks the booking form; the meeting must start at least 5 minutes from `nowMs` and within 120 days. */
export function parseBookingForm(form: Record<string, FormDataEntryValue | null>, nowMs: number): { ok: true; value: BookingRequest } | { ok: false; errors: FieldErrors } {
  const raw = {
    clientName: form.clientName ?? "",
    clientEmail: form.clientEmail ?? "",
    clientPhone: (form.clientPhone as string) || undefined,
    date: form.date ?? "",
    time: form.time ?? "",
    durationMin: form.durationMin ?? DEFAULT_DURATION,
    consultantId: form.consultantId ?? "",
    addMe: form.addMe === "on" || form.addMe === "true",
    leadId: (form.leadId as string) || undefined,
    notes: (form.notes as string) || undefined,
  };
  const parsed = BookingFormSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FieldErrors;
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  const phoneDigits = (v.clientPhone ?? "").replace(/\D/g, "");
  if (v.clientPhone && phoneDigits.length < 10) return { ok: false, errors: { clientPhone: "Check the phone number" } };
  const startsAt = `${v.date}T${v.time}:00+05:30`;
  const startMs = Date.parse(startsAt);
  if (startMs < nowMs + 5 * 60_000) return { ok: false, errors: { time: "Pick a time at least 5 minutes from now" } };
  if (startMs > nowMs + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, errors: { date: "Pick a date within the next four months" } };
  return {
    ok: true,
    value: {
      clientName: v.clientName,
      clientEmail: v.clientEmail,
      clientPhone: phoneDigits ? toE164("91", phoneDigits) : null,
      startsAt,
      durationMin: v.durationMin,
      consultantId: v.consultantId,
      addMe: v.addMe,
      leadId: v.leadId ?? null,
      notes: v.notes || null,
    },
  };
}

export interface Guest {
  email: string;
  name: string | null;
}

/**
 * The Google Calendar event (Events: insert, with conferenceDataVersion=1): a Google Meet link,
 * invites to the client and DNY's people, and a line telling the client the call is recorded.
 */
export function calendarEvent(b: { bookingId: string; clientName: string; startsAt: string; durationMin: number; guests: Guest[]; notes: string | null }) {
  const start = new Date(b.startsAt);
  const end = new Date(start.getTime() + b.durationMin * 60_000);
  const description = [
    "A video call with DNY Hospitality to understand your plans and how we can help.",
    b.notes,
    "This call is recorded and transcribed so we can follow up accurately.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: meetingTitle(b.clientName),
    description,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
    attendees: dedupeGuests(b.guests).map((g) => ({ email: g.email, ...(g.name ? { displayName: g.name } : {}) })),
    guestsCanInviteOthers: false,
    conferenceData: { createRequest: { requestId: b.bookingId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
  };
}

function dedupeGuests(guests: Guest[]): Guest[] {
  const seen = new Set<string>();
  return guests.filter((g) => {
    const key = g.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "2026-11-05T11:00:00+05:30" -> "Thursday 5 Nov at 11 am" (IST). */
export function whenText(startsAt: string): string {
  const ist = new Date(Date.parse(startsAt) + 5.5 * 3600_000).toISOString();
  const time = timeIn(`${ist.slice(0, 10)} ${ist.slice(11, 16)}`);
  return `${dayName(ist.slice(0, 10))}${time ? ` at ${time}` : ""}`;
}

/** The WhatsApp message with the meeting link, for the booker to send the client. */
export function meetingLinkMessage(clientName: string, startsAt: string, meetUrl: string): string {
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  const hi = /^\p{L}{2,}$/u.test(first) ? `Hi ${first}` : "Hi";
  return `${hi}, your video call with DNY Hospitality is fixed for ${whenText(startsAt)}. Join here: ${meetUrl} You'll also get a calendar invite by email. Looking forward to it! – DNY Hospitality`;
}

// ---------------------------------------------------------------------------
// Meetings set up outside the app (on someone's own calendar), added by their Meet link
// ---------------------------------------------------------------------------

const ExistingFormSchema = z.object({
  meetLink: z.string().trim().refine((v) => meetCode(v) !== null, "Paste the Google Meet link, like meet.google.com/abc-defg-hij"),
  clientName: text(80).min(2, "Add the client's name"),
  clientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Check the client's email"))
    .refine((e) => !e.endsWith(`@${DNY_EMAIL_DOMAIN}`), "Use the client's own email, not a DNY one")
    .optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
  durationMin: z.coerce.number().refine((n) => (DURATIONS as readonly number[]).includes(n), "Pick a length"),
  consultantId: z.string().regex(UUID, "Pick who takes the meeting"),
  notes: text(500).optional(),
});

export interface ExistingMeetingRequest {
  meetCode: string;
  meetUrl: string;
  clientName: string;
  /** Lets tl;dv see an outside guest, so it records by itself; null when not given. */
  clientEmail: string | null;
  /** ISO timestamp, IST offset. */
  startsAt: string;
  durationMin: number;
  consultantId: string;
  notes: string | null;
}

export type ExistingFieldErrors = Partial<Record<keyof z.infer<typeof ExistingFormSchema> | "form", string>>;

/** Checks the "add an existing meeting" form; the meeting may have started up to 15 minutes ago. */
export function parseExistingMeetingForm(
  form: Record<string, FormDataEntryValue | null>,
  nowMs: number,
): { ok: true; value: ExistingMeetingRequest } | { ok: false; errors: ExistingFieldErrors } {
  const raw = {
    meetLink: form.meetLink ?? "",
    clientName: form.clientName ?? "",
    clientEmail: (form.clientEmail as string) || undefined,
    date: form.date ?? "",
    time: form.time ?? "",
    durationMin: form.durationMin ?? DEFAULT_DURATION,
    consultantId: form.consultantId ?? "",
    notes: (form.notes as string) || undefined,
  };
  const parsed = ExistingFormSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: ExistingFieldErrors = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as keyof ExistingFieldErrors] ??= issue.message;
    return { ok: false, errors };
  }
  const v = parsed.data;
  const startsAt = `${v.date}T${v.time}:00+05:30`;
  const startMs = Date.parse(startsAt);
  if (startMs < nowMs - 15 * 60_000) return { ok: false, errors: { time: "This meeting has already started; add it before it starts so tl;dv can join" } };
  if (startMs > nowMs + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, errors: { date: "Pick a date within the next four months" } };
  const code = meetCode(v.meetLink)!;
  return {
    ok: true,
    value: {
      meetCode: code,
      meetUrl: `https://meet.google.com/${code}`,
      clientName: v.clientName,
      clientEmail: v.clientEmail ?? null,
      startsAt,
      durationMin: v.durationMin,
      consultantId: v.consultantId,
      notes: v.notes || null,
    },
  };
}

/**
 * The copy on the recording account's calendar (Events: insert with conferenceDataVersion=1 and no
 * emails): the existing Meet as its video call, so tl;dv's bot joins it. The client, when given, is a
 * guest so tl;dv sees an outside participant; the title marks it as a sales meeting.
 */
export function existingMeetingEvent(m: Pick<ExistingMeetingRequest, "meetCode" | "meetUrl" | "clientName" | "clientEmail" | "startsAt" | "durationMin" | "notes">, withVideo = true) {
  const start = new Date(m.startsAt);
  const end = new Date(start.getTime() + m.durationMin * 60_000);
  return {
    summary: meetingTitle(m.clientName),
    description: [`Added to DNY Sales Agent so tl;dv records it. Join: ${m.meetUrl}`, m.notes].filter(Boolean).join("\n\n"),
    location: m.meetUrl,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
    attendees: m.clientEmail ? [{ email: m.clientEmail, displayName: m.clientName }] : [],
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    ...(withVideo
      ? {
          conferenceData: {
            conferenceId: m.meetCode,
            conferenceSolution: { key: { type: "hangoutsMeet" } },
            entryPoints: [{ entryPointType: "video", uri: m.meetUrl, label: `meet.google.com/${m.meetCode}` }],
          },
        }
      : {}),
  };
}
