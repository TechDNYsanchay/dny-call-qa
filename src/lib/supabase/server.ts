import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { io } from "next/cache";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

function env(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (see .env.example)`);
  return value;
}

/**
 * Acts as the signed-in person, so row-level security decides what they see. Screens use this.
 * Server Components can read the session but not write cookies; the proxy refreshes sessions.
 */
export async function supabaseUser() {
  const cookieStore = await cookies();
  // The auth client reads the clock (session expiry). io() keeps that out of any prerender,
  // including per-user prefetches that have cookies; during a real request it resolves at once.
  await io();
  return createServerClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there.
        }
      },
    },
  });
}

/**
 * Secret-key client that bypasses row-level security. Only for trusted server code that is not
 * acting for a viewer (the sign-in allowlist check, pipeline jobs). Never for rendering screens.
 */
export function supabaseAdmin() {
  return createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
