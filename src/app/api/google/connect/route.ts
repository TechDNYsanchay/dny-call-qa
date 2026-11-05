import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/data";
import { consentUrl, googleConfigured } from "@/lib/google";

// An admin connects the recording account's Google Calendar (tech@ for now): this sends them to
// Google's consent page; /api/google/callback stores the result.
const STATE_COOKIE = "dny_google_state";
const RECORDING_ACCOUNT = process.env.RECORDING_ACCOUNT_EMAIL ?? "tech@dnyhospitality.com";

export async function GET(request: Request) {
  const site = new URL(request.url).origin;
  const me = await getCurrentPerson();
  if (me?.role !== "admin") return NextResponse.redirect(`${site}/meetings?google=admin-only`);
  if (!googleConfigured()) return NextResponse.redirect(`${site}/meetings?google=not-configured`);
  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(consentUrl(state, site, RECORDING_ACCOUNT));
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: site.startsWith("https://"), sameSite: "lax", maxAge: 600, path: "/api/google" });
  return response;
}
