// Shared by the scripts: a secret-key Supabase client and login (auth user) helpers.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Run with --env-file=.env.local (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY)");

export const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

export const SAMPLE_EMAIL_DOMAIN = "sample.invalid";

export function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

export async function findLogin(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list logins: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 1000) return null;
  }
}

/** Creates the Supabase login for an email (sign-ups are closed, so this is the only way in) and returns its id. */
export async function ensureLogin(email: string): Promise<string> {
  const existing = await findLogin(email);
  if (existing) return existing;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`create login for ${email}: ${error.message}`);
  return data.user.id;
}

export async function deleteLogin(email: string): Promise<boolean> {
  const id = await findLogin(email);
  if (!id) return false;
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) throw new Error(`delete login for ${email}: ${error.message}`);
  return true;
}
