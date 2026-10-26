"use server";

// Adding, editing and pausing people, and where reports go (founders, managers and admins only).

import { z } from "zod";
import { getCurrentPerson } from "@/lib/data";
import type { PersonRole } from "@/lib/data/types";
import { setReportsTestInbox } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  done?: string;
}

const ROLES: PersonRole[] = ["executive", "consultant", "manager", "founder", "admin"];
const READERS: PersonRole[] = ["founder", "manager", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Email = z.email();

async function requireAdmin() {
  const me = await getCurrentPerson();
  return me?.canSeeAll ? me : null;
}

/** "93225 40272", "+91-9322540272" or "09322540272" -> "+919322540272". */
function toPhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const local = digits.replace(/^0+/, "");
  return /^\d{10}$/.test(local) ? `+91${local}` : null;
}

/** The person's sign-in (created if it doesn't exist; sign-ups are closed, so this is the way in). */
async function ensureLogin(email: string): Promise<string> {
  const auth = supabaseAdmin().auth.admin;
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`logins: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 1000) break;
  }
  const { data, error } = await auth.createUser({ email, email_confirm: true });
  if (error) throw new Error(`create login: ${error.message}`);
  return data.user.id;
}

export async function savePerson(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  if (!me) return { error: "Only founders, managers and admins can change the team list." };
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const role = String(form.get("role") ?? "") as PersonRole;
  const email = String(form.get("email") ?? "").trim().toLowerCase() || null;
  const phoneInput = String(form.get("phone") ?? "").trim();
  const tldvEmail = String(form.get("tldvEmail") ?? "").trim().toLowerCase() || null;

  if (name.length < 2) return { error: "Add their name." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (email && !Email.safeParse(email).success) return { error: "That email doesn't look right." };
  if (tldvEmail && !Email.safeParse(tldvEmail).success) return { error: "That tl;dv email doesn't look right." };
  const phone = phoneInput ? toPhone(phoneInput) : null;
  if (phoneInput && !phone) return { error: "Use a 10-digit mobile number, e.g. 93225 40272." };
  if (!email && !phone) return { error: "Add an email, a Callyzer number, or both." };
  if (READERS.includes(role) && !email) return { error: "Founders, managers and admins need an email to sign in and get the summary." };
  if (id && id === me.id && role !== me.role) return { error: "You can't change your own role." };
  if (id && !UUID.test(id)) return { error: "Something was missing; refresh and try again." };

  const db = supabaseAdmin();
  let authUserId: string | null = null;
  try {
    if (email) authUserId = await ensureLogin(email);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the sign-in." };
  }
  const fields = { full_name: name, role, email, callyzer_phone: phone, tldv_email: tldvEmail, auth_user_id: authUserId };
  const { data, error } = id
    ? await db.from("people").update(fields).eq("id", id).select("id").single()
    : await db.from("people").insert({ ...fields, active: true }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      const what = error.message.includes("email") ? "email" : error.message.includes("phone") ? "Callyzer number" : "detail";
      return { error: `That ${what} already belongs to someone on the list (paused people included).` };
    }
    return { error: `Couldn't save: ${error.message}` };
  }

  // Calls the sync stored from this number before they were on the list.
  let linked = 0;
  if (phone) {
    const { data: rows } = await db.from("calls").update({ person_id: data.id }).eq("agent_phone", phone).is("person_id", null).select("id");
    linked = rows?.length ?? 0;
  }
  return { done: `${id ? "Saved" : "Added"} ${name}${linked ? `; linked ${linked} earlier call${linked === 1 ? "" : "s"}` : ""}.` };
}

export async function setActive(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  if (!me) return { error: "Only founders, managers and admins can change the team list." };
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "true";
  if (!UUID.test(id)) return { error: "Something was missing; refresh and try again." };
  if (id === me.id && !active) return { error: "You can't pause yourself." };
  const { error } = await supabaseAdmin().from("people").update({ active }).eq("id", id);
  return error ? { error: `Couldn't save: ${error.message}` } : { done: active ? "Resumed." : "Paused: they can't sign in, and their calls aren't transcribed or scored." };
}

export async function setDelivery(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  if (!me) return { error: "Only founders, managers and admins can change this." };
  const mode = form.get("mode");
  const inbox = String(form.get("inbox") ?? "").trim().toLowerCase();
  if (mode === "test") {
    if (!Email.safeParse(inbox).success) return { error: "Enter the test inbox's email." };
    await setReportsTestInbox(inbox, me.id);
    return { done: `Every report now goes to ${inbox}.` };
  }
  if (mode === "live") {
    await setReportsTestInbox(null, me.id);
    return { done: "Live: each person gets their own report, and founders, managers and admins get the summary." };
  }
  return { error: "Choose where reports go." };
}
