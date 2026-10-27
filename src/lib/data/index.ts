// Data access for the screens, read from Supabase as the signed-in person, so row-level
// security decides what each person sees. Every function runs on the server only.

import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Focus } from "@/lib/coaching";
import { exampleCandidates, type ExampleCandidate } from "@/lib/examples";
import { followUps, LEAD_WINDOW_DAYS, type FollowUps } from "@/lib/follow-ups";
import { bestCall, weekStart } from "@/lib/rollups";
import { addDays, formatPhone, istDayRange, toIst } from "@/lib/format";
import type { Band, Level, NotScoredReason } from "@/lib/scoring/compute";
import { CallResultSchema, FirstCallCaptureSchema } from "@/lib/scoring/schema";
import { activeSheet, sheetVersion, type Sheet } from "@/lib/scoring/sheets";
import type { Stream } from "@/lib/scoring/call-sheets";
import type { FirstCallCapture } from "@/lib/scoring/schema";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";
import type { CallDirection } from "@/lib/callyzer";
import type { CallRecord, LeadStatus, Person, PersonRole } from "./types";

export type { CallRecord, LeadStatus, Person } from "./types";
export { LEAD_STATUSES } from "./types";

const TITLE: Record<PersonRole, string> = {
  founder: "Founder",
  manager: "Manager",
  executive: "First Calls Executive",
  consultant: "Lead Consultant, Sales",
  admin: "Admin",
};
const SAMPLE_EMAIL_DOMAIN = "@sample.invalid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CALL_FIELDS = `
  id, stream, person_id, agent_phone, client_phone, lead_id, started_at, duration_sec, recording_status, transcript_status, scoring_status, not_scored_reason,
  call_direction, missed_alerted_at, missed_resolved_at,
  leads ( name, city, status ),
  call_metrics ( * ),
  call_scores ( score, band, levels, hard_fails, overrides, result, reference_version_ids,
    review_verdict, reviewed_at, override_reason, ai_score, ai_band, ai_levels, ai_hard_fails, reviewer:people!call_scores_overridden_by_fkey ( full_name ),
    dispute_comment, disputed_at, dispute_resolved_at, disputer:people!call_scores_disputed_by_fkey ( full_name ) )
`;

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

/** Roles that see every call and every person's report. */
const SEES_ALL: PersonRole[] = ["founder", "manager", "admin"];

export interface Me extends Person {
  email: string | null;
  canSeeAll: boolean;
}

/** The signed-in person, or null when signed in but not (or no longer) on the team list. */
export const getCurrentPerson = cache(async (): Promise<Me | null> => {
  const supabase = await supabaseUser();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("people")
    .select("id, full_name, role, email")
    .eq("auth_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) fail("current person", error);
  if (!data) return null;
  return { id: data.id, name: data.full_name, role: data.role, title: TITLE[data.role], email: data.email, canSeeAll: SEES_ALL.includes(data.role) };
});

/** For pages: the signed-in person, or sign out with a "no access" message. */
export async function requireMe(): Promise<Me> {
  const me = await getCurrentPerson();
  if (!me) redirect("/auth/signout?reason=no-access");
  return me;
}

type Client = Awaited<ReturnType<typeof supabaseUser>> | ReturnType<typeof supabaseAdmin>;

async function readPeople(db: Client): Promise<(Person & { email: string | null })[]> {
  const { data, error } = await db.from("people").select("id, full_name, role, email").eq("active", true).order("role").order("full_name");
  if (error) fail("people", error);
  return data.map((p) => ({ id: p.id, name: p.full_name, role: p.role, title: TITLE[p.role], email: p.email }));
}

/** Everyone active on the team list. Email is null for people tracked only by their Callyzer phone. */
export const listPeople = cache(async () => readPeople(await supabaseUser()));

export async function getPerson(id: string): Promise<Person | null> {
  return (await listPeople()).find((p) => p.id === id) ?? null;
}

export const isSampleData = cache(async () => (await listPeople()).some((p) => p.email?.endsWith(SAMPLE_EMAIL_DOMAIN)));

/** The report covers the most recent IST day with calls; null before the first call arrives. */
export const getReportDay = cache(async (scoredOnly: boolean = false): Promise<string | null> => {
  const query = (await supabaseUser()).from("calls").select("started_at");
  const { data, error } = await (scoredOnly ? query.eq("scoring_status", "scored") : query).order("started_at", { ascending: false }).limit(1);
  if (error) fail("latest call", error);
  return data[0] ? toIst(data[0].started_at).slice(0, 10) : null;
});

/** The first IST day with calls, the earliest date the date picker offers. */
export const getFirstDay = cache(async (): Promise<string | null> => {
  const { data, error } = await (await supabaseUser()).from("calls").select("started_at").order("started_at").limit(1);
  if (error) fail("first call", error);
  return data[0] ? toIst(data[0].started_at).slice(0, 10) : null;
});

type CallRow = {
  id: string;
  stream: CallRecord["stream"];
  person_id: string | null;
  agent_phone: string | null;
  client_phone: string | null;
  lead_id: string | null;
  call_direction: CallDirection | null;
  missed_alerted_at: string | null;
  missed_resolved_at: string | null;
  started_at: string;
  duration_sec: number;
  recording_status: CallRecord["recordingStatus"];
  recording_path?: string | null;
  source?: string;
  recording_source_url?: string | null;
  transcript_status: "not_needed" | "pending" | "processing" | "done" | "failed";
  scoring_status: "not_eligible" | "waiting" | "ready" | "scored" | "failed";
  not_scored_reason: string | null;
  leads: { name: string | null; city: string | null; status: LeadStatus } | null;
  call_metrics: {
    agent_talk_sec: number;
    client_talk_sec: number;
    client_share: number;
    agent_share_first_half: number;
    silences_over_8s: number;
    longest_silence_sec: number;
    credentials_sec: number;
    service_share_of_agent: number;
  } | null;
  call_scores: {
    score: number;
    band: Band;
    levels: unknown;
    hard_fails: string[];
    overrides: string[];
    result: unknown;
    reference_version_ids: string[] | null;
    review_verdict: "agree" | "corrected" | null;
    reviewed_at: string | null;
    override_reason: string | null;
    ai_score: number | null;
    ai_band: Band | null;
    ai_levels: unknown;
    ai_hard_fails: string[] | null;
    reviewer: { full_name: string } | null;
    dispute_comment: string | null;
    disputed_at: string | null;
    dispute_resolved_at: string | null;
    disputer: { full_name: string } | null;
  } | null;
  transcript_segments?: { speaker_label: string; role: string; start_sec: number; end_sec: number; text: string; topic: string | null }[];
};

function toCallRecord(row: CallRow): CallRecord {
  const parsed = row.call_scores ? CallResultSchema.safeParse(row.call_scores.result) : null;
  if (parsed && !parsed.success) console.error(`Call ${row.id}: stored result fails the schema`, parsed.error.issues.slice(0, 3));
  const scored = row.call_scores && parsed?.success;
  const m = row.call_metrics;
  const agentShare = m ? 1 - Number(m.client_share) : 0;

  return {
    id: row.id,
    stream: row.stream,
    personId: row.person_id ?? "",
    startedAt: toIst(row.started_at),
    durationSec: row.duration_sec,
    // Callyzer rarely knows the client's name, so the number stands in until scoring captures it.
    client: { name: row.leads?.name ?? (row.client_phone ? formatPhone(row.client_phone) : "Unknown client"), city: row.leads?.city ?? "" },
    recordingStatus: row.recording_status,
    transcript: (row.transcript_segments ?? []).map((s) => ({
      speaker: s.speaker_label,
      role: s.role as CallRecord["transcript"][number]["role"],
      startSec: Number(s.start_sec),
      endSec: Number(s.end_sec),
      text: s.text,
      topic: (s.topic ?? undefined) as CallRecord["transcript"][number]["topic"],
    })),
    metrics: m
      ? {
          durationSec: row.duration_sec,
          agentTalkSec: Number(m.agent_talk_sec),
          clientTalkSec: Number(m.client_talk_sec),
          clientShare: Number(m.client_share),
          agentShareFirstHalf: Number(m.agent_share_first_half),
          agentShareOverall: agentShare,
          silencesOver8s: m.silences_over_8s,
          longestSilenceSec: Number(m.longest_silence_sec),
          credentialsSec: Number(m.credentials_sec),
          serviceShareOfAgent: Number(m.service_share_of_agent),
        }
      : undefined,
    result: scored ? parsed.data : undefined,
    final: scored
      ? {
          score: Number(row.call_scores!.score),
          band: row.call_scores!.band,
          levels: row.call_scores!.levels as Record<string, Level>,
          hardFails: row.call_scores!.hard_fails,
          overrides: row.call_scores!.overrides,
        }
      : undefined,
    sheetVersionId: scored ? (row.call_scores!.reference_version_ids?.[0] ?? null) : undefined,
    review:
      scored && row.call_scores!.review_verdict && row.call_scores!.reviewed_at
        ? {
            verdict: row.call_scores!.review_verdict,
            reviewer: row.call_scores!.reviewer?.full_name ?? null,
            at: toIst(row.call_scores!.reviewed_at),
            note: row.call_scores!.override_reason,
            ai:
              row.call_scores!.ai_score !== null && row.call_scores!.ai_band
                ? {
                    score: Number(row.call_scores!.ai_score),
                    band: row.call_scores!.ai_band,
                    levels: (row.call_scores!.ai_levels ?? {}) as Record<string, Level>,
                    hardFails: row.call_scores!.ai_hard_fails ?? [],
                  }
                : null,
          }
        : undefined,
    dispute:
      scored && row.call_scores!.dispute_comment && row.call_scores!.disputed_at
        ? {
            comment: row.call_scores!.dispute_comment,
            by: row.call_scores!.disputer?.full_name ?? null,
            at: toIst(row.call_scores!.disputed_at),
            resolvedAt: row.call_scores!.dispute_resolved_at ? toIst(row.call_scores!.dispute_resolved_at) : null,
          }
        : undefined,
    leadId: row.lead_id ?? undefined,
    leadStatus: row.leads?.status,
    notScored: row.scoring_status === "not_eligible" ? ((row.not_scored_reason ?? undefined) as NotScoredReason | undefined) : undefined,
    inProgress:
      row.scoring_status === "waiting" || row.scoring_status === "ready"
        ? row.recording_status === "pending"
          ? "recording"
          : row.transcript_status === "done"
            ? "scoring"
            : row.transcript_status === "failed"
              ? "transcription_failed"
              : "transcription"
        : undefined,
    agentPhone: row.agent_phone ?? undefined,
    direction: row.call_direction ?? undefined,
    clientPhone: row.client_phone ?? undefined,
    missedHandled: Boolean(row.missed_resolved_at),
    missedAlerted: Boolean(row.missed_alerted_at),
  };
}

/**
 * The nearest earlier and later IST days with calls (or with scored calls), for the day buttons.
 * Executives only see their own calls (row-level security), so their buttons skip days they
 * made no calls.
 */
type AdjacentDays = { previous: string | null; next: string | null };

export const getAdjacentDays = cache(async (day: string, personId: string | null = null, scoredOnly: boolean = false): Promise<AdjacentDays> => {
  const [from, to] = istDayRange(day);
  const supabase = await supabaseUser();
  const calls = () => {
    let query = supabase.from("calls").select("started_at");
    if (personId) query = query.eq("person_id", personId);
    if (scoredOnly) query = query.eq("scoring_status", "scored");
    return query;
  };
  const [before, after] = await Promise.all([
    calls().lt("started_at", from).order("started_at", { ascending: false }).limit(1),
    calls().gte("started_at", to).order("started_at").limit(1),
  ]);
  if (before.error) fail("earlier day", before.error);
  if (after.error) fail("later day", after.error);
  const istDay = (rows: { started_at: string }[]) => (rows[0] ? toIst(rows[0].started_at).slice(0, 10) : null);
  return { previous: istDay(before.data), next: istDay(after.data) };
});

async function readCalls(db: Client, day: string): Promise<CallRecord[]> {
  const [from, to] = istDayRange(day);
  const { data, error } = await db.from("calls").select(CALL_FIELDS).gte("started_at", from).lt("started_at", to).order("started_at");
  if (error) fail("calls", error);
  return (data as unknown as CallRow[]).map(toCallRecord);
}

/** Calls on one IST day, earliest first. */
export const listCalls = cache(async (day: string) => readCalls(await supabaseUser(), day));

async function readCallsBetween(db: Client, fromDay: string, toDay: string): Promise<CallRecord[]> {
  const [from] = istDayRange(fromDay);
  const [, to] = istDayRange(toDay);
  const { data, error } = await db.from("calls").select(CALL_FIELDS).gte("started_at", from).lt("started_at", to).order("started_at");
  if (error) fail("calls", error);
  return (data as unknown as CallRow[]).map(toCallRecord);
}

/** Calls from `fromDay` to `toDay` (IST, inclusive), for the weekly and monthly roll-ups. */
export const listCallsBetween = cache(async (fromDay: string, toDay: string) => readCallsBetween(await supabaseUser(), fromDay, toDay));

export async function getCall(id: string): Promise<CallRecord | null> {
  return readFullCall(await supabaseUser(), id);
}

async function readFullCall(db: Client, id: string): Promise<CallRecord | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await db
    .from("calls")
    .select(`${CALL_FIELDS}, recording_path, source, recording_source_url, transcript_segments ( idx, speaker_label, role, start_sec, end_sec, text, topic )`)
    .eq("id", id)
    .order("idx", { referencedTable: "transcript_segments" })
    .maybeSingle();
  if (error) fail("call", error);
  if (!data) return null;
  const row = data as unknown as CallRow;
  return {
    ...toCallRecord(row),
    recordingUrl: await recordingLink(row),
    // tl;dv keeps vision-call recordings; the call links to the meeting there.
    recordingPageUrl: row.source === "tldv" ? (row.recording_source_url ?? undefined) : undefined,
  };
}

/**
 * A one-hour link to play the recording. Only made after the viewer is known to be allowed the
 * call (the row-level-security read, or a shared example); the bucket itself stays private.
 */
async function recordingLink(row: CallRow): Promise<string | undefined> {
  if (row.recording_status !== "available" || !row.recording_path) return undefined;
  const { data, error } = await supabaseAdmin().storage.from("recordings").createSignedUrl(row.recording_path, 60 * 60);
  if (error) {
    console.error(`Call ${row.id}: recording link failed: ${error.message}`);
    return undefined;
  }
  return data.signedUrl;
}

/** Daily averages for the six days before `day`, oldest first, per person id. */
export async function previousDayAverages(day: string): Promise<Record<string, number[]>> {
  return readPreviousDayAverages(await supabaseUser(), day);
}

async function readPreviousDayAverages(db: Client, day: string): Promise<Record<string, number[]>> {
  const [weekStart] = istDayRange(day, -6);
  const { data, error } = await db
    .from("daily_reports")
    .select("person_id, report_date, summary")
    .gte("report_date", weekStart.slice(0, 10))
    .lt("report_date", day)
    .order("report_date");
  if (error) fail("daily reports", error);
  const byPerson: Record<string, number[]> = {};
  for (const r of data) {
    const average = (r.summary as { average?: unknown } | null)?.average;
    if (typeof average === "number") (byPerson[r.person_id] ??= []).push(average);
  }
  return byPerson;
}

/**
 * The same reads for the report jobs, which run with no viewer: the secret key, so row-level
 * security doesn't apply. Never use these to render a page.
 */
async function readActiveSheets(db: Client) {
  const [first_call, vision_call] = await Promise.all([activeSheet(db, "first_call"), activeSheet(db, "vision_call")]);
  return { first_call, vision_call, questions: [...first_call.questions, ...vision_call.questions] };
}

/** The latest published FC-01 and LC-01 (what scoring uses now), plus both question lists together. */
export const getActiveSheets = cache(async () => readActiveSheets(await supabaseUser()));

/** The sheet a call was scored against, for its coverage list. */
export async function getCallSheet(stream: Stream, versionId: string | null | undefined): Promise<Sheet> {
  return sheetVersion(await supabaseUser(), stream, versionId);
}

async function readTeamPhones(db: Client): Promise<Set<string>> {
  const { data, error } = await db.from("people").select("callyzer_phone").not("callyzer_phone", "is", null);
  if (error) fail("team phones", error);
  return new Set(data.map((p) => p.callyzer_phone!));
}

async function readFollowUps(today: string, personId?: string): Promise<FollowUps> {
  const db = supabaseAdmin();
  const [calls, phones] = await Promise.all([readCallsBetween(db, addDays(today, -LEAD_WINDOW_DAYS), today), readTeamPhones(db)]);
  return followUps(calls, phones, today, personId);
}

/**
 * The viewer's follow-ups; everyone's for founders, managers and admins. Read with the secret key
 * so a missed call returned from another team phone still counts as returned, then cut down to
 * the viewer's own items.
 */
export async function getFollowUps(me: Me, today: string): Promise<FollowUps> {
  return readFollowUps(today, me.canSeeAll ? undefined : me.id);
}

async function readActiveFocuses(db: Client): Promise<Focus[]> {
  const { data, error } = await db
    .from("coaching_focus")
    .select("id, person_id, kind, target_id, note, set_at, setter:people!coaching_focus_set_by_fkey ( full_name )")
    .is("ended_at", null);
  if (error) fail("coaching focus", error);
  return (data as unknown as { id: string; person_id: string; kind: Focus["kind"]; target_id: string; note: string | null; set_at: string; setter: { full_name: string } | null }[]).map((r) => ({
    id: r.id,
    personId: r.person_id,
    kind: r.kind,
    targetId: r.target_id,
    note: r.note,
    setAt: toIst(r.set_at),
    setBy: r.setter?.full_name ?? null,
  }));
}

/** Each person's current coaching focus (row-level security: executives see their own). */
export const listActiveFocuses = cache(async () => readActiveFocuses(await supabaseUser()));

export const pipelineReads = {
  focuses: () => readActiveFocuses(supabaseAdmin()),
  followUps: (today: string) => readFollowUps(today),
  activeSheets: () => readActiveSheets(supabaseAdmin()),
  people: () => readPeople(supabaseAdmin()),
  calls: (day: string) => readCalls(supabaseAdmin(), day),
  callsBetween: (fromDay: string, toDay: string) => readCallsBetween(supabaseAdmin(), fromDay, toDay),
  previousDayAverages: (day: string) => readPreviousDayAverages(supabaseAdmin(), day),
};

export interface Calibration {
  reviewed: number;
  agreed: number;
  /** Average points the founders' corrections moved the score (negative = AI was generous). */
  averageChange: number | null;
  /** Scorecard areas founders changed most, with how often. */
  areasCorrected: { id: string; count: number }[];
}

/** How often founders agree with the AI's scores: the brief's calibration measure. */
export const getCalibration = cache(async (): Promise<Calibration> => {
  const { data, error } = await (await supabaseUser())
    .from("call_scores")
    .select("review_verdict, score, ai_score, levels, ai_levels")
    .not("review_verdict", "is", null);
  if (error) fail("calibration", error);
  const corrected = data.filter((r) => r.review_verdict === "corrected");
  const changes = corrected.map((r) => Number(r.score) - Number(r.ai_score ?? r.score));
  const counts = new Map<string, number>();
  for (const r of corrected) {
    const ai = (r.ai_levels ?? {}) as Record<string, number>;
    const now = (r.levels ?? {}) as Record<string, number>;
    for (const id of Object.keys(now)) if (ai[id] !== undefined && ai[id] !== now[id]) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    reviewed: data.length,
    agreed: data.filter((r) => r.review_verdict === "agree").length,
    averageChange: changes.length ? Math.round((changes.reduce((s, x) => s + x, 0) / changes.length) * 10) / 10 : null,
    areasCorrected: [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
  };
});


export interface LeadRow {
  id: string;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  /** What the latest scored first call captured (record_lead_capture). */
  capture: FirstCallCapture;
  lastCall: { id: string; startedAt: string; personId: string | null; score: number | null; band: Band | null } | null;
  callCount: number;
}

/** Leads a scored call has captured details for, most recent call first. Row-level security limits executives to their own. */
export const listLeads = cache(async (): Promise<LeadRow[]> => {
  const { data, error } = await (await supabaseUser())
    .from("leads")
    .select("id, phone, email, status, first_call_capture, calls ( id, started_at, person_id, call_scores ( score, band ) )")
    .not("first_call_capture", "is", null);
  if (error) fail("leads", error);
  type Row = { id: string; phone: string | null; email: string | null; status: LeadStatus; first_call_capture: unknown;
    calls: { id: string; started_at: string; person_id: string | null; call_scores: { score: number; band: Band } | null }[] };
  const rows: LeadRow[] = [];
  for (const lead of data as unknown as Row[]) {
    const capture = FirstCallCaptureSchema.safeParse(lead.first_call_capture);
    if (!capture.success) continue;
    // The latest scored call (where the details came from), else the latest call.
    const newestFirst = [...lead.calls].sort((a, b) => b.started_at.localeCompare(a.started_at));
    const last = newestFirst.find((c) => c.call_scores) ?? newestFirst[0];
    rows.push({
      id: lead.id,
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      capture: capture.data,
      callCount: lead.calls.length,
      lastCall: last
        ? { id: last.id, startedAt: toIst(last.started_at), personId: last.person_id, score: last.call_scores ? Number(last.call_scores.score) : null, band: last.call_scores?.band ?? null }
        : null,
    });
  }
  return rows.sort((a, b) => (b.lastCall?.startedAt ?? "").localeCompare(a.lastCall?.startedAt ?? ""));
});

export interface SheetVersionRow {
  id: string;
  stream: Stream;
  version: number;
  label: string;
  notes: string | null;
  storagePath: string | null;
  createdAt: string;
  createdBy: string | null;
}

/** Every published call sheet version, newest first. */
export const listSheetVersions = cache(async (): Promise<SheetVersionRow[]> => {
  const { data, error } = await (await supabaseUser())
    .from("reference_versions")
    .select("id, kind, version, label, notes, storage_path, created_at, creator:people ( full_name )")
    .in("kind", ["first_call_sheet", "vision_call_sheet"])
    .not("questions", "is", null)
    .order("version", { ascending: false });
  if (error) fail("call sheet versions", error);
  return (data as unknown as { id: string; kind: string; version: number; label: string; notes: string | null; storage_path: string | null; created_at: string; creator: { full_name: string } | null }[]).map((r) => ({
    id: r.id,
    stream: r.kind === "first_call_sheet" ? "first_call" : "vision_call",
    version: r.version,
    label: r.label,
    notes: r.notes,
    storagePath: r.storage_path,
    createdAt: toIst(r.created_at),
    createdBy: r.creator?.full_name ?? null,
  }));
});

/** One-hour links to the sheet PDFs. Only for founders, managers and admins (checked by the caller). */
export async function sheetPdfLinks(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return {};
  const { data, error } = await supabaseAdmin().storage.from("references").createSignedUrls(unique, 60 * 60);
  if (error) fail("sheet links", error);
  return Object.fromEntries(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])));
}

export interface TeamMember extends Person {
  email: string | null;
  callyzerPhone: string | null;
  tldvEmail: string | null;
  active: boolean;
  canSignIn: boolean;
}

/** Everyone on the team list, paused people too, for the Team members page (founders and admins see all). */
export const listTeamMembers = cache(async (): Promise<TeamMember[]> => {
  const { data, error } = await (await supabaseUser())
    .from("people")
    .select("id, full_name, role, email, callyzer_phone, tldv_email, active, auth_user_id")
    .order("active", { ascending: false })
    .order("role")
    .order("full_name");
  if (error) fail("team members", error);
  return data.map((p) => ({
    id: p.id,
    name: p.full_name,
    role: p.role,
    title: TITLE[p.role],
    email: p.email,
    callyzerPhone: p.callyzer_phone,
    tldvEmail: p.tldv_email,
    active: p.active,
    canSignIn: Boolean(p.auth_user_id && p.email),
  }));
});

/** Search text made safe for a filter: no characters PostgREST treats as syntax or wildcards. */
export function searchTerm(raw: string): string {
  return raw.replace(/[,()*%_\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export interface SaidOnCall {
  call: CallRecord;
  /** Matching transcript lines, earliest first. */
  lines: { startSec: number; text: string }[];
}

export interface SearchResults {
  leads: LeadRow[];
  calls: CallRecord[];
  said: SaidOnCall[];
}

/** Leads and calls matching a name, phone, email, city or concept. Row-level security limits executives to their own. */
export const search = cache(async (raw: string): Promise<SearchResults> => {
  const term = searchTerm(raw);
  if (term.length < 2) return { leads: [], calls: [], said: [] };
  const digits = term.replace(/\D/g, "");
  const supabase = await supabaseUser();
  const text = `*${term}*`;
  const leadFilters = [
    `name.ilike.${text}`,
    `email.ilike.${text}`,
    `first_call_capture->>clientName.ilike.${text}`,
    `first_call_capture->>city.ilike.${text}`,
    `first_call_capture->>concept.ilike.${text}`,
    ...(digits.length >= 4 ? [`phone.ilike.*${digits}*`] : []),
  ].join(",");
  const [{ data: leadIds, error: leadError }, { data: callRows, error: callError }, { data: lineRows, error: lineError }] = await Promise.all([
    supabase.from("leads").select("id").or(leadFilters).limit(40),
    digits.length >= 4
      ? supabase.from("calls").select(CALL_FIELDS).ilike("client_phone", `%${digits}%`).order("started_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    // What was said: `term` has no wildcards left in it (searchTerm), so it matches as typed.
    term.length >= 3 && digits.length < 4
      ? supabase.from("transcript_segments").select("call_id, start_sec, text").ilike("text", `%${term}%`).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (leadError) fail("search leads", leadError);
  if (callError) fail("search calls", callError);
  if (lineError) fail("search transcripts", lineError);
  const ids = new Set(leadIds.map((l) => l.id));
  const leads = (await listLeads()).filter((l) => ids.has(l.id));

  const linesByCall = new Map<string, { startSec: number; text: string }[]>();
  for (const l of lineRows as { call_id: string; start_sec: number; text: string }[]) {
    linesByCall.set(l.call_id, [...(linesByCall.get(l.call_id) ?? []), { startSec: Number(l.start_sec), text: l.text }]);
  }
  let said: SaidOnCall[] = [];
  if (linesByCall.size) {
    const { data: saidRows, error: saidError } = await supabase.from("calls").select(CALL_FIELDS).in("id", [...linesByCall.keys()].slice(0, 30));
    if (saidError) fail("search calls said", saidError);
    said = (saidRows as unknown as CallRow[])
      .map(toCallRecord)
      .map((call) => ({ call, lines: linesByCall.get(call.id)!.sort((a, b) => a.startSec - b.startSec) }))
      .sort((a, b) => b.call.startedAt.localeCompare(a.call.startedAt));
  }
  return { leads, calls: (callRows as unknown as CallRow[]).map(toCallRecord), said };
});

/** Scores executives have disputed that no founder has reviewed yet, oldest first. */
export const listOpenDisputes = cache(async (): Promise<CallRecord[]> => {
  const supabase = await supabaseUser();
  const { data: open, error } = await supabase
    .from("call_scores")
    .select("call_id")
    .not("dispute_comment", "is", null)
    .is("dispute_resolved_at", null)
    .order("disputed_at")
    .limit(50);
  if (error) fail("disputes", error);
  if (open.length === 0) return [];
  const { data: rows, error: callsError } = await supabase.from("calls").select(CALL_FIELDS).in("id", open.map((r) => r.call_id));
  if (callsError) fail("disputed calls", callsError);
  const calls = (rows as unknown as CallRow[]).map(toCallRecord);
  return calls.sort((a, b) => (a.dispute?.at ?? "").localeCompare(b.dispute?.at ?? ""));
});

export interface LeadDetail {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  stage: 1 | 2 | null;
  ownerId: string | null;
  valueInr: number | null;
  notes: string | null;
  statusUpdatedAt: string | null;
  capture: FirstCallCapture | null;
  calls: CallRecord[];
}

/** One lead with every call to it that the viewer may see. */
export async function getLead(id: string): Promise<LeadDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await supabaseUser();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, email, status, stage, owner_id, value_inr, notes, status_updated_at, first_call_capture")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("lead", error);
  if (!data) return null;
  const { data: calls, error: callsError } = await supabase.from("calls").select(CALL_FIELDS).eq("lead_id", id).order("started_at", { ascending: false });
  if (callsError) fail("lead calls", callsError);
  const capture = FirstCallCaptureSchema.safeParse(data.first_call_capture);
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    status: data.status as LeadStatus,
    stage: (data.stage as 1 | 2 | null) ?? null,
    ownerId: data.owner_id,
    valueInr: data.value_inr === null ? null : Number(data.value_inr),
    notes: data.notes,
    statusUpdatedAt: data.status_updated_at ? toIst(data.status_updated_at) : null,
    capture: capture.success ? capture.data : null,
    calls: (calls as unknown as CallRow[]).map(toCallRecord),
  };
}

export interface ExampleClip {
  id: string;
  questionId: string;
  callId: string;
  personId: string;
  clientName: string;
  startedAt: string;
  startSec: number;
  endSec: number;
  quote: string;
  score: number | null;
  band: Band | null;
  /** A one-hour link to the recording; the player plays only the clip. */
  recordingUrl?: string;
}

type ExampleRow = {
  id: string;
  question_id: string;
  call_id: string;
  start_sec: number;
  end_sec: number;
  quote: string;
  calls: {
    person_id: string | null;
    started_at: string;
    client_phone: string | null;
    recording_path: string | null;
    recording_status: string;
    leads: { name: string | null } | null;
    call_scores: { score: number; band: Band } | null;
  } | null;
};

/**
 * The pinned examples, which everyone signed in may hear, and (for founders, managers and admins)
 * the best candidates to pin from the last 60 days. Read with the secret key because executives
 * can't otherwise see colleagues' calls; only the clip and quote are shown.
 */
export async function getExamples(me: Me, today: string): Promise<{ pinned: ExampleClip[]; candidates: ExampleCandidate[] }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("call_examples")
    .select("id, question_id, call_id, start_sec, end_sec, quote, calls ( person_id, started_at, client_phone, recording_path, recording_status, leads ( name ), call_scores ( score, band ) )")
    .order("created_at");
  if (error) fail("examples", error);
  const rows = data as unknown as ExampleRow[];
  const paths = [...new Set(rows.flatMap((r) => (r.calls?.recording_status === "available" && r.calls.recording_path ? [r.calls.recording_path] : [])))];
  const links = new Map<string, string>();
  if (paths.length) {
    const { data: signed, error: signError } = await db.storage.from("recordings").createSignedUrls(paths, 60 * 60);
    if (signError) console.error(`example recording links failed: ${signError.message}`);
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }
  const pinned = rows.map((r) => ({
    id: r.id,
    questionId: r.question_id,
    callId: r.call_id,
    personId: r.calls?.person_id ?? "",
    clientName: r.calls?.leads?.name ?? (r.calls?.client_phone ? formatPhone(r.calls.client_phone) : "a client"),
    startedAt: r.calls ? toIst(r.calls.started_at) : "",
    startSec: Number(r.start_sec),
    endSec: Number(r.end_sec),
    quote: r.quote,
    score: r.calls?.call_scores ? Number(r.calls.call_scores.score) : null,
    band: r.calls?.call_scores?.band ?? null,
    recordingUrl: r.calls?.recording_path ? links.get(r.calls.recording_path) : undefined,
  }));
  if (!me.canSeeAll) return { pinned, candidates: [] };
  const recent = await readCallsBetween(await supabaseUser(), addDays(today, -60), today);
  return { pinned, candidates: exampleCandidates(recent, new Set(pinned.map((p) => `${p.questionId}:${p.callId}`))) };
}

/** The call of the week for the week containing `day`, from everyone's calls. */
export async function getCallOfWeek(day: string): Promise<CallRecord | null> {
  const monday = weekStart(day);
  return bestCall(await readCallsBetween(supabaseAdmin(), monday, addDays(monday, 6)));
}

/**
 * A call shared with the whole team: one with a pinned example, or the call of its week. Null for
 * any other call, so executives still can't open colleagues' calls in general.
 */
export async function getSharedCall(id: string): Promise<CallRecord | null> {
  if (!UUID.test(id)) return null;
  const db = supabaseAdmin();
  const call = await readFullCall(db, id);
  if (!call) return null;
  const { count, error } = await db.from("call_examples").select("id", { count: "exact", head: true }).eq("call_id", id);
  if (error) fail("example check", error);
  if ((count ?? 0) > 0) return call;
  return (await getCallOfWeek(call.startedAt.slice(0, 10)))?.id === id ? call : null;
}

/** Everyone's name, so an example or the call of the week can say whose call it is. Names only. */
export const teamNames = cache(async (): Promise<Map<string, string>> => {
  const { data, error } = await supabaseAdmin().from("people").select("id, full_name");
  if (error) fail("team names", error);
  return new Map(data.map((p) => [p.id, p.full_name]));
});

/** The moments pinned from one call, earliest first (readable by everyone signed in). */
export async function listCallExamples(callId: string): Promise<{ questionId: string; startSec: number; quote: string }[]> {
  if (!UUID.test(callId)) return [];
  const { data, error } = await (await supabaseUser()).from("call_examples").select("question_id, start_sec, quote").eq("call_id", callId).order("start_sec");
  if (error) fail("call examples", error);
  return data.map((r) => ({ questionId: r.question_id, startSec: Number(r.start_sec), quote: r.quote }));
}

/** Every team phone number, so calls between colleagues aren't counted as client calls. Numbers only. */
export const getTeamPhones = cache(async (): Promise<Set<string>> => readTeamPhones(supabaseAdmin()));
