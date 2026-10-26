// Data access for the screens, read from Supabase as the signed-in person, so row-level
// security decides what each person sees. Every function runs on the server only.

import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { formatPhone, istDayRange, toIst } from "@/lib/format";
import type { Band, Level, NotScoredReason } from "@/lib/scoring/compute";
import { CallResultSchema, FirstCallCaptureSchema } from "@/lib/scoring/schema";
import { activeSheet, sheetVersion, type Sheet } from "@/lib/scoring/sheets";
import type { Stream } from "@/lib/scoring/call-sheets";
import type { FirstCallCapture } from "@/lib/scoring/schema";
import { supabaseAdmin, supabaseUser } from "@/lib/supabase/server";
import type { CallRecord, Person, PersonRole } from "./types";

export type { CallRecord, Person } from "./types";

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
  id, stream, person_id, agent_phone, client_phone, started_at, duration_sec, recording_status, transcript_status, scoring_status, not_scored_reason,
  leads ( name, city ),
  call_metrics ( * ),
  call_scores ( score, band, levels, hard_fails, overrides, result, reference_version_ids,
    review_verdict, reviewed_at, override_reason, ai_score, ai_band, ai_levels, ai_hard_fails, reviewer:people!call_scores_overridden_by_fkey ( full_name ) )
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
  started_at: string;
  duration_sec: number;
  recording_status: CallRecord["recordingStatus"];
  recording_path?: string | null;
  source?: string;
  recording_source_url?: string | null;
  transcript_status: "not_needed" | "pending" | "processing" | "done" | "failed";
  scoring_status: "not_eligible" | "waiting" | "ready" | "scored" | "failed";
  not_scored_reason: string | null;
  leads: { name: string | null; city: string | null } | null;
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
  if (!UUID.test(id)) return null;
  const { data, error } = await (await supabaseUser())
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
 * A one-hour link to play the recording. Only made after the row-level-security read above
 * returned the call, so the viewer is allowed to see it; the bucket itself stays private.
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

export const pipelineReads = {
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
  /** What the latest scored first call captured (record_lead_capture). */
  capture: FirstCallCapture;
  lastCall: { id: string; startedAt: string; personId: string | null; score: number | null; band: Band | null } | null;
  callCount: number;
}

/** Leads a scored call has captured details for, most recent call first. Row-level security limits executives to their own. */
export const listLeads = cache(async (): Promise<LeadRow[]> => {
  const { data, error } = await (await supabaseUser())
    .from("leads")
    .select("id, phone, email, first_call_capture, calls ( id, started_at, person_id, call_scores ( score, band ) )")
    .not("first_call_capture", "is", null);
  if (error) fail("leads", error);
  type Row = { id: string; phone: string | null; email: string | null; first_call_capture: unknown;
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
