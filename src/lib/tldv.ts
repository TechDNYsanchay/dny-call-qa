// Reads tl;dv's API and webhook formats into what the app stores. Pure, so it can be tested
// against the shapes in tl;dv's API reference (https://doc.tldv.io).

import { mergeTurns, type SpeakerTurn } from "@/lib/transcription/turns";

/** Email domain of DNY's own people; any other invitee is treated as the client. */
export const DNY_EMAIL_DOMAIN = "dnyhospitality.com";

export interface TldvPerson {
  name: string | null;
  email: string | null;
}

export interface TldvMeeting {
  /** tl;dv's meeting id, stored as calls.source_id. */
  sourceId: string;
  title: string | null;
  /** ISO timestamp the meeting happened. */
  startedAt: string;
  durationSec: number;
  organizer: TldvPerson;
  invitees: TldvPerson[];
  /** The meeting's page in tl;dv, where the recording plays. */
  url: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function person(value: unknown): TldvPerson {
  const v = (value ?? {}) as Record<string, unknown>;
  return { name: text(v.name), email: text(v.email)?.toLowerCase() ?? null };
}

/** A meeting from GET /v1alpha1/meetings/{id}, the list endpoint, or a webhook's `data`; null if unusable. */
export function parseTldvMeeting(value: unknown): TldvMeeting | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const sourceId = text(v.id);
  const happenedAt = text(v.happenedAt);
  const startedAt = happenedAt && !Number.isNaN(Date.parse(happenedAt)) ? new Date(happenedAt).toISOString() : null;
  const duration = Number(v.duration);
  if (!sourceId || !startedAt || !Number.isFinite(duration) || duration < 0) return null;
  const url = text(v.url);
  return {
    sourceId,
    title: text(v.name),
    startedAt,
    durationSec: Math.round(duration),
    organizer: person(v.organizer),
    invitees: Array.isArray(v.invitees) ? v.invitees.map(person) : [],
    url: url?.startsWith("https://") ? url : null,
  };
}

/** Transcript lines from GET .../transcript (`{ data: [...] }`) or a webhook's embedded transcript. */
export function parseTldvTranscript(value: unknown): SpeakerTurn[] | null {
  const v = value as { data?: unknown } | unknown[] | null;
  const lines = Array.isArray(v) ? v : Array.isArray((v as { data?: unknown })?.data) ? (v as { data: unknown[] }).data : null;
  if (!lines) return null;
  const turns: SpeakerTurn[] = [];
  for (const line of lines) {
    const l = (line ?? {}) as Record<string, unknown>;
    const start = Number(l.startTime);
    const end = Number(l.endTime);
    const words = text(l.text);
    if (!words || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    turns.push({ speaker: text(l.speaker) ?? "Unknown speaker", startSec: start, endSec: Math.max(start, end), text: words });
  }
  return mergeTurns(turns);
}

export interface TldvWebhook {
  event: string;
  meeting: TldvMeeting;
  /** Present when tl;dv embedded it (TranscriptReady, or MeetingReady with the transcript included). */
  transcript: SpeakerTurn[] | null;
}

export function parseTldvWebhook(value: unknown): TldvWebhook | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const event = text(v.event);
  const meeting = parseTldvMeeting(v.data);
  if (!event || !meeting) return null;
  const transcript = parseTldvTranscript((v.data as Record<string, unknown>).transcript ?? null);
  return { event, meeting, transcript: transcript?.length ? transcript : null };
}

const isDny = (p: TldvPerson) => p.email?.endsWith(`@${DNY_EMAIL_DOMAIN}`) ?? false;

/** The people outside DNY on the invite. A meeting without any is internal, not a vision call. */
export function clientsOf(meeting: TldvMeeting): TldvPerson[] {
  return meeting.invitees.filter((p) => p.email && !isDny(p) && p.email !== meeting.organizer.email);
}
