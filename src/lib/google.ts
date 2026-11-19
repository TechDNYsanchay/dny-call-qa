// Google Calendar for booked meetings: the recording account (tech@ for now) connects once, and the
// app creates and cancels meetings on its calendar. Needs GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET
// from an OAuth client in DNY's Google Cloud project (consent screen "Internal"). Server only.

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DNY_EMAIL_DOMAIN } from "@/lib/tldv";
import { meetCode } from "@/lib/booking";

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const TIMEOUT = 20_000;

export class GoogleNotReady extends Error {}

export const googleConfigured = () => Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);

export const redirectUri = (site: string) => `${site}/api/google/callback`;

/** Google's consent page for the recording account, asking for a refresh token. */
export function consentUrl(state: string, site: string, loginHint: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    redirect_uri: redirectUri(site),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    hd: DNY_EMAIL_DOMAIN,
    login_hint: loginHint,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "", ...body }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!response.ok) throw new Error(`Google sign-in: ${json.error_description ?? json.error ?? `HTTP ${response.status}`}`);
  return json;
}

/** The email in an ID token straight from Google's token endpoint (over TLS, so not re-verified). */
function emailOf(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; email_verified?: boolean };
    return payload.email && payload.email_verified !== false ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Finishes the consent: stores the refresh token for the account that signed in. */
export async function saveConnection(code: string, site: string, connectedBy: string): Promise<string> {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(site) });
  const email = emailOf(tokens.id_token);
  if (!email?.endsWith(`@${DNY_EMAIL_DOMAIN}`)) throw new Error(`Sign in with a @${DNY_EMAIL_DOMAIN} account`);
  if (!tokens.refresh_token) throw new Error("Google didn't return a long-lived token; remove the app's access in the Google account and connect again");
  const { error } = await supabaseAdmin()
    .from("google_connection")
    .upsert({ id: true, email, refresh_token: tokens.refresh_token, connected_by: connectedBy, connected_at: new Date().toISOString() });
  if (error) throw new Error(`save connection: ${error.message}`);
  return email;
}

/** Which account meetings are created with, or null when none is connected. */
export async function connection(): Promise<{ email: string; connectedAt: string } | null> {
  const { data, error } = await supabaseAdmin().from("google_connection").select("email, connected_at").maybeSingle();
  if (error) throw new Error(`connection: ${error.message}`);
  return data ? { email: data.email, connectedAt: data.connected_at } : null;
}

async function accessToken(): Promise<string> {
  if (!googleConfigured()) throw new GoogleNotReady("Google Calendar isn't set up yet (the app's Google keys are missing)");
  const { data, error } = await supabaseAdmin().from("google_connection").select("refresh_token").maybeSingle();
  if (error) throw new Error(`connection: ${error.message}`);
  if (!data) throw new GoogleNotReady("Google Calendar isn't connected yet: an admin connects it on the Meetings page");
  const tokens = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
  if (!tokens.access_token) throw new Error("Google didn't return an access token");
  return tokens.access_token;
}

async function calendar(path: string, init: { method: string; body?: unknown }): Promise<Response> {
  const token = await accessToken();
  return fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

type EventJson = { id?: string; hangoutLink?: string; conferenceData?: { conferenceId?: string; createRequest?: { status?: { statusCode?: string } } }; error?: { message?: string } };

/** Creates the event and emails the invites; returns the event id and its Meet link and code. */
export async function createMeeting(event: object): Promise<{ eventId: string; meetUrl: string; meetCode: string }> {
  const response = await calendar("?conferenceDataVersion=1&sendUpdates=all", { method: "POST", body: event });
  let json = (await response.json().catch(() => ({}))) as EventJson;
  if (!response.ok || !json.id) throw new Error(`Google Calendar: ${json.error?.message ?? `HTTP ${response.status}`}`);
  // The Meet link is usually ready at once; if Google is still making it, ask again shortly.
  for (let i = 0; i < 3 && !json.hangoutLink && json.conferenceData?.createRequest?.status?.statusCode === "pending"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const again = await calendar(`/${encodeURIComponent(json.id!)}`, { method: "GET" });
    if (again.ok) json = (await again.json()) as EventJson;
  }
  const code = meetCode(json.conferenceData?.conferenceId) ?? meetCode(json.hangoutLink);
  if (!json.hangoutLink || !code) throw new Error("Google Calendar made the event but no Meet link; check that Google Meet is on for this account");
  return { eventId: json.id!, meetUrl: json.hangoutLink, meetCode: code };
}

/**
 * Puts a copy of a meeting set up elsewhere on the calendar, emailing nobody, with its existing Meet as
 * the video call. If Google won't attach that Meet, the copy keeps the link in its location instead.
 */
export async function addExistingMeeting(withVideo: object, withoutVideo: object): Promise<{ eventId: string; videoAttached: boolean }> {
  const response = await calendar("?conferenceDataVersion=1&sendUpdates=none", { method: "POST", body: withVideo });
  const json = (await response.json().catch(() => ({}))) as EventJson;
  if (response.ok && json.id) return { eventId: json.id, videoAttached: Boolean(json.hangoutLink || json.conferenceData?.conferenceId) };
  if (response.status !== 400) throw new Error(`Google Calendar: ${json.error?.message ?? `HTTP ${response.status}`}`);
  const again = await calendar("?sendUpdates=none", { method: "POST", body: withoutVideo });
  const plain = (await again.json().catch(() => ({}))) as EventJson;
  if (!again.ok || !plain.id) throw new Error(`Google Calendar: ${plain.error?.message ?? json.error?.message ?? `HTTP ${again.status}`}`);
  return { eventId: plain.id, videoAttached: false };
}

/** Cancels the event, emailing the guests unless `notify` is false; an event already gone counts as cancelled. */
export async function cancelMeeting(eventId: string, notify = true): Promise<void> {
  const response = await calendar(`/${encodeURIComponent(eventId)}?sendUpdates=${notify ? "all" : "none"}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const json = (await response.json().catch(() => ({}))) as EventJson;
    throw new Error(`Google Calendar: ${json.error?.message ?? `HTTP ${response.status}`}`);
  }
}
