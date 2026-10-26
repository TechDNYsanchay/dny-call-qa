// tl;dv's public API (https://doc.tldv.io). Needs TLDV_API_KEY from a paid (Pro, Business or
// Enterprise) seat; meetings are only returned when their organiser is on a paid plan.

import "server-only";
import { parseTldvMeeting, parseTldvTranscript, type TldvMeeting } from "@/lib/tldv";
import type { SpeakerTurn } from "@/lib/transcription/turns";

const PAGE_SIZE = 50;

async function get(path: string): Promise<Response> {
  const key = process.env.TLDV_API_KEY;
  if (!key) throw new Error("TLDV_API_KEY is not set");
  const base = process.env.TLDV_API_BASE ?? "https://pasta.tldv.io";
  return fetch(`${base}/v1alpha1${path}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(30_000) });
}

/** The transcript, or null when tl;dv hasn't finished it yet. */
export async function fetchTldvTranscript(meetingId: string): Promise<SpeakerTurn[] | null> {
  const response = await get(`/meetings/${encodeURIComponent(meetingId)}/transcript`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`tl;dv transcript: HTTP ${response.status}`);
  const turns = parseTldvTranscript(await response.json());
  return turns?.length ? turns : null;
}

/** One page of meetings the key can see, newest first as tl;dv lists them. */
export async function listTldvMeetings(page: number): Promise<{ meetings: TldvMeeting[]; pages: number }> {
  const response = await get(`/meetings?page=${page}&limit=${PAGE_SIZE}`);
  if (!response.ok) throw new Error(`tl;dv meetings: HTTP ${response.status}`);
  const json = (await response.json()) as { results?: unknown[]; pages?: number };
  const meetings = (json.results ?? []).map(parseTldvMeeting).filter((m): m is TldvMeeting => m !== null);
  return { meetings, pages: Number(json.pages) || 1 };
}
