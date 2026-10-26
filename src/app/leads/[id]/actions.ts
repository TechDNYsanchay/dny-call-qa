"use server";

// Founders, managers and admins set a lead's outcome; it feeds the funnel on the Roll-ups page.

import { getCurrentPerson, LEAD_STATUSES, type LeadStatus } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface LeadState {
  error?: string;
  done?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateLead(_prev: LeadState, form: FormData): Promise<LeadState> {
  const me = await getCurrentPerson();
  if (!me?.canSeeAll) return { error: "Only founders, managers and admins can update a lead." };
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as LeadStatus;
  const stageRaw = String(form.get("stage") ?? "");
  const ownerId = String(form.get("ownerId") ?? "") || null;
  const valueRaw = String(form.get("value") ?? "").replace(/[,\s₹]/g, "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000) || null;

  if (!UUID.test(id)) return { error: "Something was missing; refresh and try again." };
  if (!LEAD_STATUSES.includes(status)) return { error: "Choose a status." };
  const stage = stageRaw === "1" ? 1 : stageRaw === "2" ? 2 : null;
  if (ownerId && !UUID.test(ownerId)) return { error: "Choose an owner from the list." };
  const value = valueRaw ? Number(valueRaw) : null;
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1e11)) return { error: "Enter the deal value in rupees, e.g. 500000." };

  const db = supabaseAdmin();
  const { data: before, error: readError } = await db.from("leads").select("status").eq("id", id).maybeSingle();
  if (readError || !before) return { error: "That lead isn't there any more." };
  const { error } = await db
    .from("leads")
    .update({
      status,
      stage,
      owner_id: ownerId,
      value_inr: value,
      notes,
      updated_at: new Date().toISOString(),
      ...(before.status !== status ? { status_updated_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  return error ? { error: `Couldn't save: ${error.message}` } : { done: "Saved." };
}
