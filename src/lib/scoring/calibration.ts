// The founders' reviews, handed to the scorer with every call so it learns how DNY judges: for each
// recent review, the areas the founders changed (with the AI's original reason), the hard fails
// they added or removed, and their note.

import type { Json } from "@/lib/supabase/database.types";
import type { Stream } from "./call-sheets";
import type { Db } from "./pipeline";
import { areasFor } from "./scorecards";

export interface ReviewRow {
  review_verdict: string | null;
  override_reason: string | null;
  reviewed_at: string | null;
  score: number;
  ai_score: number | null;
  levels: Json;
  ai_levels: Json | null;
  hard_fails: string[];
  ai_hard_fails: string[] | null;
  result: Json;
}

export interface CalibrationNote {
  reviewedOn: string;
  verdict: "agree" | "corrected";
  aiScore: number;
  foundersScore: number;
  /** Areas the founders scored differently, with the AI's reason for its level. */
  changed: { area: string; ai: number; founders: number; aiReason: string | null }[];
  hardFailsAdded: string[];
  hardFailsRemoved: string[];
  note: string | null;
}

const MAX_NOTES = 12;

const asLevels = (json: Json | null): Record<string, number> => (json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, number>) : {});

function aiReason(result: Json, area: string): string | null {
  const areas = result && typeof result === "object" && !Array.isArray(result) ? (result.areas as Record<string, { reason?: string }> | undefined) : undefined;
  return areas?.[area]?.reason ?? null;
}

/** A review worth learning from: a correction, or an agreement the founder explained. Null otherwise. */
export function calibrationNote(row: ReviewRow, stream: Stream): CalibrationNote | null {
  if (!row.reviewed_at || (row.review_verdict !== "agree" && row.review_verdict !== "corrected")) return null;
  const ai = asLevels(row.ai_levels ?? row.levels);
  const founders = asLevels(row.levels);
  const changed = areasFor(stream)
    .filter((a) => ai[a.id] !== undefined && founders[a.id] !== undefined && ai[a.id] !== founders[a.id])
    .map((a) => ({ area: a.id, ai: ai[a.id]!, founders: founders[a.id]!, aiReason: aiReason(row.result, a.id) }));
  const aiFails = row.ai_hard_fails ?? row.hard_fails;
  const hardFailsAdded = row.hard_fails.filter((h) => !aiFails.includes(h));
  const hardFailsRemoved = aiFails.filter((h) => !row.hard_fails.includes(h));
  const note = row.override_reason?.trim() || null;
  if (!changed.length && !hardFailsAdded.length && !hardFailsRemoved.length && !note) return null;
  return {
    reviewedOn: row.reviewed_at.slice(0, 10),
    verdict: row.review_verdict,
    aiScore: Number(row.ai_score ?? row.score),
    foundersScore: Number(row.score),
    changed,
    hardFailsAdded,
    hardFailsRemoved,
    note,
  };
}

/** The founders' recent reviews of this kind of call, newest first, and how often they agreed overall. */
export async function calibrationFor(db: Db, stream: Stream) {
  const { data, error } = await db
    .from("call_scores")
    .select("review_verdict, override_reason, reviewed_at, score, ai_score, levels, ai_levels, hard_fails, ai_hard_fails, result, calls!inner ( stream )")
    .eq("calls.stream", stream)
    .not("reviewed_at", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`calibration: ${error.message}`);
  const notes = data.map((row) => calibrationNote(row, stream)).filter((n): n is CalibrationNote => n !== null);
  return {
    reviewed: data.length,
    agreed: data.filter((r) => r.review_verdict === "agree").length,
    notes: notes.slice(0, MAX_NOTES),
  };
}
