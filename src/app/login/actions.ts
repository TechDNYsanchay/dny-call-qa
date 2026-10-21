"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { NEXT_PATH_COOKIE, safeNextPath } from "@/lib/auth-paths";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";

export type SignInState = { sent?: string; error?: string };

const EmailSchema = z.email();

export async function sendSignInLink(_: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EmailSchema.safeParse(email).success) return { error: "Enter a valid email address." };

  // Only active people on the team list get a link. The reply is the same either way, so the
  // form never reveals who is on the list.
  const { data: person, error: lookupError } = await supabaseAdmin()
    .from("people")
    .select("id")
    .eq("email", email)
    .eq("active", true)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (lookupError) return { error: "Something went wrong. Try again in a minute." };

  if (person) {
    const cookieStore = await cookies();
    cookieStore.set(NEXT_PATH_COOKIE, safeNextPath(String(formData.get("next") ?? "")), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60,
      path: "/",
    });
    const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL;
    const { error } = await (await supabaseUser()).auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      console.error("sign-in link:", error.message);
      return { error: "The link couldn't be sent just now. Wait a minute and try again." };
    }
  }
  return { sent: email };
}
