// Versioned call sheets: the questions each published FC-01 / LC-01 version asks. Scoring follows
// the latest version; a score records the version it used. Without any published version the
// built-in lists in call-sheets.ts (October 2026) apply.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { FIRST_CALL_QUESTIONS, FIRST_CALL_SHEET_VERSION, VISION_CALL_QUESTIONS, VISION_CALL_SHEET_VERSION, type SheetQuestion, type Stream } from "./call-sheets";

export const SHEET_KIND: Record<Stream, "first_call_sheet" | "vision_call_sheet"> = {
  first_call: "first_call_sheet",
  vision_call: "vision_call_sheet",
};
const PREFIX: Record<Stream, string> = { first_call: "fc", vision_call: "lc" };

export const SheetQuestionSchema = z.object({
  id: z.string().regex(/^(fc|lc)\d{2}$/),
  number: z.number().int().min(1).max(99),
  question: z.string().min(3).max(300),
  captures: z.string().max(400),
  priority: z.enum(["must", "good_to_have"]),
  runningBusinessOnly: z.boolean(),
  section: z.enum(["vision", "business", "money", "decision"]).optional(),
});
export const SheetQuestionsSchema = z.array(SheetQuestionSchema).min(1).max(40);

export interface Sheet {
  stream: Stream;
  /** reference_versions id, or null for the built-in list. */
  versionId: string | null;
  version: number;
  label: string;
  questions: SheetQuestion[];
  storagePath: string | null;
  createdAt: string | null;
}

export function builtInSheet(stream: Stream): Sheet {
  return {
    stream,
    versionId: null,
    version: 1,
    label: stream === "first_call" ? FIRST_CALL_SHEET_VERSION : VISION_CALL_SHEET_VERSION,
    questions: stream === "first_call" ? FIRST_CALL_QUESTIONS : VISION_CALL_QUESTIONS,
    storagePath: null,
    createdAt: null,
  };
}

type Row = { id: string; version: number; label: string; questions: unknown; storage_path: string | null; created_at: string };

function toSheet(stream: Stream, row: Row): Sheet | null {
  const questions = SheetQuestionsSchema.safeParse(row.questions);
  if (!questions.success) return null;
  return { stream, versionId: row.id, version: row.version, label: row.label, questions: questions.data, storagePath: row.storage_path, createdAt: row.created_at };
}

/** The latest published version of a stream's sheet (the one scoring uses). */
export async function activeSheet(db: SupabaseClient<Database>, stream: Stream): Promise<Sheet> {
  const { data, error } = await db
    .from("reference_versions")
    .select("id, version, label, questions, storage_path, created_at")
    .eq("kind", SHEET_KIND[stream])
    .not("questions", "is", null)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(`call sheet: ${error.message}`);
  return (data[0] && toSheet(stream, data[0])) || builtInSheet(stream);
}

/** A specific version (what an older call was scored against), else the built-in list. */
export async function sheetVersion(db: SupabaseClient<Database>, stream: Stream, versionId: string | null | undefined): Promise<Sheet> {
  if (!versionId) return builtInSheet(stream);
  const { data, error } = await db.from("reference_versions").select("id, version, label, questions, storage_path, created_at").eq("id", versionId).maybeSingle();
  if (error) throw new Error(`call sheet version: ${error.message}`);
  return (data && toSheet(stream, data)) || builtInSheet(stream);
}

/** Questions expected on a call: must-capture ones, RB-only ones just for running businesses. */
export function expectedFrom(questions: SheetQuestion[], isRunningBusiness: boolean): SheetQuestion[] {
  return questions.filter((q) => q.priority === "must" && (isRunningBusiness || !q.runningBusinessOnly));
}

const SECTIONS = new Set(["VISION", "BUSINESS", "MONEY", "DECISION"]);
const QUESTION_LINE = /^(\d{1,2})\s+(RB\s+)?(.+)$/;

/**
 * Reads the questions from a call sheet PDF's text, as a draft to check before publishing.
 * Each question is a numbered line ("01 Whom am I speaking with?") with what to capture on the
 * next line. Must-capture vs good-to-have isn't in the text, so it's carried over from the
 * previous version by number (new questions default to must-capture).
 */
export function parseSheetText(text: string, stream: Stream, previous: SheetQuestion[]): SheetQuestion[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const questions: SheetQuestion[] = [];
  let section: SheetQuestion["section"];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SECTIONS.has(line)) {
      section = line.toLowerCase() as SheetQuestion["section"];
      continue;
    }
    const match = QUESTION_LINE.exec(line);
    if (!match) continue;
    const number = Number(match[1]);
    let question = match[3];
    // Options printed after the question ("Startup / RB / Investor? Startup RB …") are dropped.
    const lastMark = question.lastIndexOf("?");
    if (lastMark > 0) question = question.slice(0, lastMark + 1);
    if (question.length < 3 || questions.some((q) => q.number === number)) continue;

    const next = lines[i + 1] ?? "";
    const captures = !QUESTION_LINE.test(next) && !SECTIONS.has(next) && !/^[A-Z][A-Z ,:]+$/.test(next) ? next : "";
    const id = `${PREFIX[stream]}${String(number).padStart(2, "0")}`;
    const before = previous.find((q) => q.number === number);
    questions.push({
      id,
      number,
      question,
      captures,
      priority: before?.priority ?? "must",
      runningBusinessOnly: Boolean(match[2]),
      ...(stream === "vision_call" && section ? { section } : {}),
    });
  }
  return questions.sort((a, b) => a.number - b.number);
}
