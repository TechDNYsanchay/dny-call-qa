// Display helpers. Dates are formatted from their ISO strings rather than with Date,
// so pages stay deterministic when Next.js prerenders them.

import type { Stream } from "@/lib/scoring/call-sheets";
import type { NotScoredReason } from "@/lib/scoring/compute";
import { hardFailsFor } from "@/lib/scoring/scorecards";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-20" -> "20 Oct 2026" */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS.at(Number(m) - 1)} ${y}`;
}

/** "2026-10-20T10:12:00+05:30" -> "10:12" (the IST wall-clock time as stored) */
export function formatClock(iso: string): string {
  return iso.slice(11, 16);
}

/** Seconds -> "m:ss" or "h:mm:ss" */
export function formatTimestamp(totalSec: number): string {
  const s = Math.floor(totalSec % 60);
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const formatDuration = formatTimestamp;

export const formatPct = (share: number) => `${Math.round(share * 100)}%`;

export const STREAM_LABEL: Record<Stream, string> = {
  first_call: "First call",
  vision_call: "Vision call",
};

export const NOT_SCORED_LABEL: Record<NotScoredReason, string> = {
  under_2_min: "Under 2 minutes, logged only",
  recording_declined: "Client declined recording",
  recording_missing: "Recording missing",
  recording_pending: "Waiting for recording",
};

export function hardFailLabel(stream: Stream, id: string): string {
  return hardFailsFor(stream).find((f) => f.id === id)?.label ?? id;
}
