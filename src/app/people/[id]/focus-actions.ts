"use server";

// Founders, managers and admins set or end a person's coaching focus. Setting a new one ends the
// current one, so each person has one at a time.

import { getCurrentPerson } from "@/lib/data";
import { activeSheet } from "@/lib/scoring/sheets";
import { areasFor } from "@/lib/scoring/scorecards";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface FocusState {
  error?: string;
  done?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setFocus(_prev: FocusState, form: FormData): Promise<FocusState> {
  const me = await getCurrentPerson();
  if (!me?.canSeeAll) return { error: "Only founders, managers and admins can set a coaching focus." };
  const personId = String(form.get("personId") ?? "");
  const [kind, targetId] = String(form.get("target") ?? "").split(":");
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID.test(personId)) return { error: "Something was missing; refresh and try again." };

  const db = supabaseAdmin();
  if (kind === "question") {
    const sheets = await Promise.all([activeSheet(db, "first_call"), activeSheet(db, "vision_call")]);
    if (!sheets.some((s) => s.questions.some((q) => q.id === targetId))) return { error: "Choose a question from the list." };
  } else if (kind === "area") {
    if (![...areasFor("first_call"), ...areasFor("vision_call")].some((a) => a.id === targetId)) return { error: "Choose an area from the list." };
  } else return { error: "Choose what to focus on." };

  const now = new Date().toISOString();
  const { error: endError } = await db.from("coaching_focus").update({ ended_at: now }).eq("person_id", personId).is("ended_at", null);
  if (endError) return { error: `Couldn't save: ${endError.message}` };
  const { error } = await db.from("coaching_focus").insert({ person_id: personId, kind, target_id: targetId, note, set_by: me.id, set_at: now });
  return error ? { error: `Couldn't save: ${error.message}` } : { done: "Focus set." };
}

export async function endFocus(_prev: FocusState, form: FormData): Promise<FocusState> {
  const me = await getCurrentPerson();
  if (!me?.canSeeAll) return { error: "Only founders, managers and admins can end a coaching focus." };
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Something was missing; refresh and try again." };
  const { error } = await supabaseAdmin().from("coaching_focus").update({ ended_at: new Date().toISOString() }).eq("id", id).is("ended_at", null);
  return error ? { error: `Couldn't save: ${error.message}` } : { done: "Focus ended." };
}
