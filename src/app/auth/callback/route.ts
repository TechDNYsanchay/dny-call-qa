import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_PATH_COOKIE, safeNextPath } from "@/lib/auth-paths";
import { supabaseUser } from "@/lib/supabase/server";

// Sign-in lands here from the emailed link (token_hash, works on any device) or from Google
// (?code=, PKCE started in this browser). Either way, only active people on the team list stay in.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const cookieStore = await cookies();
  const next = safeNextPath(cookieStore.get(NEXT_PATH_COOKIE)?.value);
  cookieStore.delete(NEXT_PATH_COOKIE);

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));

  // Supabase sends errors back as query parameters, e.g. a Google account that has no login here.
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return fail(/signups? not allowed/i.test(providerError) ? "no-access" : "link");

  const supabase = await supabaseUser();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error("No sign-in code in the link") };
  if (error || !data.user) return fail(code ? "google" : "link");

  // Row-level security lets a person read only their own row, so this finds them or nothing.
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!person) {
    await supabase.auth.signOut();
    return fail("no-access");
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
