"use server";

// Marking a missed call as handled: the client was reached another way, or it wasn't a client.

import { getCurrentPerson } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface HandledState {
  error?: string;
  done?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markMissedHandled(_prev: HandledState, form: FormData): Promise<HandledState> {
  const me = await getCurrentPerson();
  if (!me) return { error: "Sign in again to do this." };
  const ids = form.getAll("callId").map(String).filter((id) => UUID.test(id)).slice(0, 50);
  if (ids.length === 0) return { error: "Something was missing; refresh and try again." };

  const db = supabaseAdmin();
  const { data: calls, error } = await db.from("calls").select("id, person_id, call_direction").in("id", ids);
  if (error) return { error: `Couldn't load the calls: ${error.message}` };
  if (calls.length !== ids.length || calls.some((c) => c.call_direction !== "missed" && c.call_direction !== "rejected")) {
    return { error: "Those calls aren't missed calls; refresh and try again." };
  }
  if (!me.canSeeAll && calls.some((c) => c.person_id !== me.id)) return { error: "You can only mark your own missed calls." };

  const { error: saveError } = await db.from("calls").update({ missed_resolved_at: new Date().toISOString(), missed_resolved_by: me.id }).in("id", ids);
  return saveError ? { error: `Couldn't save: ${saveError.message}` } : { done: true };
}
