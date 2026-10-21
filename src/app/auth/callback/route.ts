import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_PATH_COOKIE, safeNextPath } from "@/lib/auth-paths";
import { supabaseUser } from "@/lib/supabase/server";

// The emailed sign-in link lands here. The email template links with token_hash, which works on
// any device; ?code= (PKCE) is also handled for links started from this browser.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const cookieStore = await cookies();
  const next = safeNextPath(cookieStore.get(NEXT_PATH_COOKIE)?.value);
  cookieStore.delete(NEXT_PATH_COOKIE);

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));
  if (url.searchParams.get("error")) return fail("link");

  const supabase = await supabaseUser();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("No sign-in code in the link") };
  if (error) return fail("link");

  return NextResponse.redirect(new URL(next, url.origin));
}
