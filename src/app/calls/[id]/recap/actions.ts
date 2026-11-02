"use server";

// Ticking off a next step agreed on a vision call. The consultant who ran the meeting, or a
// founder, manager or admin, can tick it. Ticking off the proposal moves the lead to "Proposal sent".

import { refresh } from "next/cache";
import { getCurrentPerson } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setActionDone(id: string, done: boolean): Promise<{ error?: string }> {
  const me = await getCurrentPerson();
  if (!me) return { error: "Sign in again to do this." };
  if (!UUID.test(id)) return { error: "Something was missing; refresh and try again." };

  const db = supabaseAdmin();
  const { data: action, error } = await db.from("meeting_actions").select("id, owner, kind, lead_id, calls ( person_id )").eq("id", id).maybeSingle();
  if (error) return { error: `Couldn't load it: ${error.message}` };
  if (!action) return { error: "This step is gone; refresh the page." };
  if (!me.canSeeAll && action.calls?.person_id !== me.id) return { error: "Only the consultant on the call or a founder can tick this." };

  const { error: saveError } = await db
    .from("meeting_actions")
    .update(done ? { done_at: new Date().toISOString(), done_by: me.id } : { done_at: null, done_by: null })
    .eq("id", id);
  if (saveError) return { error: `Couldn't save: ${saveError.message}` };

  // The proposal went out: the lead moves on, unless it is already further along (or lost).
  if (done && action.kind === "proposal" && action.owner === "dny" && action.lead_id) {
    const { error: leadError } = await db
      .from("leads")
      .update({ status: "proposal", status_updated_at: new Date().toISOString() })
      .eq("id", action.lead_id)
      .in("status", ["open", "vc_held"]);
    if (leadError) return { error: `Ticked, but the lead couldn't move to "Proposal sent": ${leadError.message}` };
  }
  // The page re-renders with the change, in the same round trip.
  refresh();
  return {};
}
