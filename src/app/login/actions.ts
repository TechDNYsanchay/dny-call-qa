"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NEXT_PATH_COOKIE, safeNextPath } from "@/lib/auth-paths";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";

export type SignInState = { sent?: string; error?: string };

const EmailSchema = z.email();

/** The Google Workspace domain; only a hint to Google's account picker. The team list is the real gate. */
const WORKSPACE_DOMAIN = "dnyhospitality.com";

/** Remembers where to go after sign-in, so the link back from email or Google stays a fixed URL. */
async function rememberNextPath(formData: FormData) {
  (await cookies()).set(NEXT_PATH_COOKIE, safeNextPath(String(formData.get("next") ?? "")), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60,
    path: "/",
  });
}

async function callbackUrl() {
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL;
  return `${origin}/auth/callback`;
}

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

  if (!person && process.env.NODE_ENV !== "production") {
    console.info(`sign-in link: ${email} is not an active person on the team list, so no email was sent`);
  }

  if (person) {
    await rememberNextPath(formData);
    const { error } = await (await supabaseUser()).auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: await callbackUrl() },
    });
    if (error) {
      console.error("sign-in link:", error.message);
      return { error: "The link couldn't be sent just now. Wait a minute and try again." };
    }
  }
  return { sent: email };
}

/** Starts Google sign-in. Who may enter is checked in /auth/callback against the team list. */
export async function signInWithGoogle(formData: FormData) {
  await rememberNextPath(formData);
  const { data, error } = await (await supabaseUser()).auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: await callbackUrl(),
      queryParams: { hd: WORKSPACE_DOMAIN, prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("google sign-in:", error?.message ?? "no URL returned");
    redirect("/login?error=google");
  }
  redirect(data.url);
}
