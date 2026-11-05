import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/data";
import { saveConnection } from "@/lib/google";
import { secretMatches } from "@/lib/webhooks";

// Google sends the admin back here after the consent page; the refresh token is stored for the
// account they signed in with, and meetings are created on that account's calendar from then on.
const STATE_COOKIE = "dny_google_state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = url.origin;
  const back = (status: string, reason?: string) => {
    const response = NextResponse.redirect(`${site}/meetings?google=${status}${reason ? `&reason=${encodeURIComponent(reason.slice(0, 200))}` : ""}`);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return response;
  };

  const me = await getCurrentPerson();
  if (me?.role !== "admin") return back("admin-only");
  const state = (await cookies()).get(STATE_COOKIE)?.value;
  if (!state || !secretMatches(url.searchParams.get("state"), state)) return back("error", "The sign-in took too long or was opened twice; try Connect again");
  if (url.searchParams.get("error")) return back("error", url.searchParams.get("error") === "access_denied" ? "Access wasn't allowed on Google's page" : url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  if (!code) return back("error", "Google didn't send a sign-in code");

  try {
    const email = await saveConnection(code, site, me.id);
    return back("connected", email);
  } catch (error) {
    return back("error", error instanceof Error ? error.message : String(error));
  }
}
