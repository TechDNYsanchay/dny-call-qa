"use server";

// Uploading and publishing call sheet versions (founders, managers and admins only). A PDF is
// read into a draft list of questions; nothing changes until the reviewed list is published.

import { getCurrentPerson } from "@/lib/data";
import type { SheetQuestion, Stream } from "@/lib/scoring/call-sheets";
import { activeSheet, parseSheetText, SHEET_KIND, SheetQuestionsSchema } from "@/lib/scoring/sheets";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_BYTES = 4 * 1024 * 1024;
const STREAMS: Stream[] = ["first_call", "vision_call"];

export interface DraftState {
  error?: string;
  draft?: { stream: Stream; storagePath: string; fileName: string; questions: SheetQuestion[] };
}

export interface PublishState {
  error?: string;
  published?: { stream: Stream; version: number; label: string };
}

async function requireReviewer() {
  const me = await getCurrentPerson();
  return me?.canSeeAll ? me : null;
}

export async function readSheetPdf(_prev: DraftState, form: FormData): Promise<DraftState> {
  if (!(await requireReviewer())) return { error: "Only founders, managers and admins can change the call sheets." };
  const stream = form.get("stream") as Stream;
  const file = form.get("pdf");
  if (!STREAMS.includes(stream)) return { error: "Choose which call sheet this is." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the PDF to upload." };
  if (file.size > MAX_BYTES) return { error: "That PDF is over 4 MB; export it smaller and try again." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return { error: "That file isn't a PDF." };

  const db = supabaseAdmin();
  const storagePath = `sheets/${stream}/${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
  const { error: uploadError } = await db.storage.from("references").upload(storagePath, bytes, { contentType: "application/pdf" });
  if (uploadError) return { error: `Couldn't store the PDF: ${uploadError.message}` };

  let text: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    ({ text } = await extractText(await getDocumentProxy(bytes), { mergePages: true }));
  } catch {
    return { error: "Couldn't read text from that PDF. Is it a scanned image? Upload the original export, or edit the questions by hand." };
  }
  const current = await activeSheet(db, stream);
  const questions = parseSheetText(text, stream, current.questions);
  if (questions.length === 0) {
    return { error: "No numbered questions found in that PDF. Check it's the call sheet, or edit the questions by hand." };
  }
  return { draft: { stream, storagePath, fileName: file.name, questions } };
}

export async function publishSheet(_prev: PublishState, form: FormData): Promise<PublishState> {
  const me = await requireReviewer();
  if (!me) return { error: "Only founders, managers and admins can change the call sheets." };
  const stream = form.get("stream") as Stream;
  if (!STREAMS.includes(stream)) return { error: "Unknown call sheet." };
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000);
  if (label.length < 3) return { error: "Give this version a name, e.g. \"FC-01 (Nov 2026)\"." };

  let questions: SheetQuestion[];
  try {
    const parsed = SheetQuestionsSchema.safeParse(JSON.parse(String(form.get("questions") ?? "[]")));
    if (!parsed.success) return { error: `The questions aren't complete: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}` };
    questions = parsed.data;
  } catch {
    return { error: "The questions couldn't be read; refresh and try again." };
  }
  const prefix = stream === "first_call" ? "fc" : "lc";
  if (questions.some((q) => !q.id.startsWith(prefix)) || new Set(questions.map((q) => q.id)).size !== questions.length) {
    return { error: "Each question needs its own number." };
  }

  const db = supabaseAdmin();
  const current = await activeSheet(db, stream);
  // A new PDF must be one this page uploaded; editing keeps the current version's PDF.
  const uploaded = String(form.get("storagePath") ?? "");
  const storagePath = uploaded.startsWith(`sheets/${stream}/`) && !uploaded.includes("..") ? uploaded : current.storagePath;

  const { data: last } = await db.from("reference_versions").select("version").eq("kind", SHEET_KIND[stream]).order("version", { ascending: false }).limit(1);
  const version = (last?.[0]?.version ?? current.version) + 1;
  const { error } = await db.from("reference_versions").insert({
    kind: SHEET_KIND[stream],
    version,
    label,
    notes: notes || null,
    storage_path: storagePath,
    questions: questions as never,
    created_by: me.id,
  });
  if (error) return { error: `Couldn't publish: ${error.message}` };
  return { published: { stream, version, label } };
}
