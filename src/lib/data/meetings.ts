// Booked sales meetings, for the Meetings page. Read with the secret key after the viewer is known,
// with the same rule as the table's row-level security: founders, managers and admins see every
// booking, everyone else the ones they booked or take.

import "server-only";
import { toIst } from "@/lib/format";
import type { Band } from "@/lib/scoring/compute";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";
import type { Me } from "./index";

export interface BookingRow {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  /** IST timestamp. */
  startsAt: string;
  durationMin: number;
  consultant: { id: string; name: string } | null;
  bookedBy: { id: string; name: string } | null;
  meetUrl: string | null;
  status: "booked" | "cancelled";
  leadId: string | null;
  call: { id: string; score: number | null; band: Band | null; scoringStatus: string } | null;
}

type Row = {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  starts_at: string;
  duration_min: number;
  consultant_id: string | null;
  booked_by: string | null;
  meet_url: string | null;
  status: "booked" | "cancelled";
  lead_id: string | null;
  call_id: string | null;
  consultant: { full_name: string } | null;
  booker: { full_name: string } | null;
  calls: { scoring_status: string; call_scores: { score: number; band: Band } | null } | null;
};

/** Bookings from the last `days` days and everything ahead, soonest first. */
export async function listBookings(me: Me, days = 30): Promise<BookingRow[]> {
  let query = supabaseAdmin()
    .from("meeting_bookings")
    .select(
      `id, client_name, client_email, client_phone, starts_at, duration_min, consultant_id, booked_by, meet_url, status, lead_id, call_id,
       consultant:people!meeting_bookings_consultant_id_fkey ( full_name ),
       booker:people!meeting_bookings_booked_by_fkey ( full_name ),
       calls ( scoring_status, call_scores ( score, band ) )`,
    )
    .gte("starts_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("starts_at")
    .limit(300);
  if (!me.canSeeAll) query = query.or(`booked_by.eq.${me.id},consultant_id.eq.${me.id}`);
  const { data, error } = await query;
  if (error) throw new Error(`meetings: ${error.message}`);
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    clientName: r.client_name,
    clientEmail: r.client_email,
    clientPhone: r.client_phone,
    startsAt: toIst(r.starts_at),
    durationMin: r.duration_min,
    consultant: r.consultant_id && r.consultant ? { id: r.consultant_id, name: r.consultant.full_name } : null,
    bookedBy: r.booked_by && r.booker ? { id: r.booked_by, name: r.booker.full_name } : null,
    meetUrl: r.meet_url,
    status: r.status,
    leadId: r.lead_id,
    call: r.call_id && r.calls
      ? { id: r.call_id, score: r.calls.call_scores ? Number(r.calls.call_scores.score) : null, band: r.calls.call_scores?.band ?? null, scoringStatus: r.calls.scoring_status }
      : null,
  }));
}

export interface MeetingHost {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Who can take a meeting: active people with an email, consultants first (not the admin account). */
export async function listMeetingHosts(): Promise<MeetingHost[]> {
  const { data, error } = await supabaseAdmin()
    .from("people")
    .select("id, full_name, email, role")
    .eq("active", true)
    .not("email", "is", null)
    .neq("role", "admin")
    .order("full_name");
  if (error) throw new Error(`people: ${error.message}`);
  const order = ["consultant", "founder", "manager", "executive"];
  return data
    .map((p) => ({ id: p.id, name: p.full_name, email: p.email!, role: p.role }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
}

/** A lead's details to fill in the booking form, read as the viewer (only leads they may see). */
export async function bookingLead(leadId: string): Promise<{ id: string; name: string | null; email: string | null; phone: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  const { data, error } = await (await supabaseUser()).from("leads").select("id, name, email, phone, first_call_capture").eq("id", leadId).maybeSingle();
  if (error) throw new Error(`lead: ${error.message}`);
  if (!data) return null;
  const spoken = (data.first_call_capture as { clientName?: string | null } | null)?.clientName;
  return { id: data.id, name: spoken ?? data.name, email: data.email, phone: data.phone };
}
