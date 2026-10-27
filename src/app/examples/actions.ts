"use server";

// Founders, managers and admins pin a moment from a call as the example for a question, or remove it.

import { getCurrentPerson } from "@/lib/data";
import { clipBounds } from "@/lib/examples";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface ExampleState {
  error?: string;
  done?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pinExample(_prev: ExampleState, form: FormData): Promise<ExampleState> {
  const me = await getCurrentPerson();
  if (!me?.canSeeAll) return { error: "Only founders, managers and admins can pick examples." };
  const questionId = String(form.get("questionId") ?? "");
  const callId = String(form.get("callId") ?? "");
  const startSec = Number(form.get("startSec"));
  const quote = String(form.get("quote") ?? "").trim().slice(0, 500);
  const speaker = form.get("speaker") === "client" ? "client" : "agent";
  if (!/^(fc|lc)\d{2}$/.test(questionId) || !UUID.test(callId) || !Number.isFinite(startSec) || startSec < 0 || !quote) {
    return { error: "Something was missing; refresh and try again." };
  }

  const db = supabaseAdmin();
  const { data: segments, error } = await db.from("transcript_segments").select("start_sec, end_sec").eq("call_id", callId);
  if (error) return { error: `Couldn't read the call: ${error.message}` };
  const clip = clipBounds(segments.map((s) => ({ startSec: Number(s.start_sec), endSec: Number(s.end_sec) })), startSec, speaker);
  const { error: saveError } = await db
    .from("call_examples")
    .insert({ question_id: questionId, call_id: callId, start_sec: clip.start, end_sec: clip.end, quote, created_by: me.id });
  if (saveError) return { error: saveError.code === "23505" ? "That moment is already an example." : `Couldn't save: ${saveError.message}` };
  return { done: true };
}

export async function removeExample(_prev: ExampleState, form: FormData): Promise<ExampleState> {
  const me = await getCurrentPerson();
  if (!me?.canSeeAll) return { error: "Only founders, managers and admins can remove examples." };
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Something was missing; refresh and try again." };
  const { error } = await supabaseAdmin().from("call_examples").delete().eq("id", id);
  return error ? { error: `Couldn't remove it: ${error.message}` } : { done: true };
}
