import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-side client with the secret key. It bypasses row-level security, so it must never
// reach the browser ("server-only" makes that a build error). Once login is added, screens
// switch to the signed-in user's client so RLS decides what each person sees.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.example)");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
