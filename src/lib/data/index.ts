// Data access for the screens, read from Supabase as the signed-in person, so row-level
// security decides what each person sees. Every function runs on the server only.

import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { istDayRange, toIst } from "@/lib/format";
import type { Band, Level, NotScoredReason } from "@/lib/scoring/compute";
import { CallResultSchema } from "@/lib/scoring/schema";
import { supabaseUser } from "@/lib/supabase/server";
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
  id, stream, person_id, agent_phone, started_at, duration_sec, recording_status, transcript_status, scoring_status, not_scored_reason,
  leads ( name, city ),
  call_metrics ( * ),
  call_scores ( score, band, levels, hard_fails, overrides, result )
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

/** Everyone active on the team list. Email is null for people tracked only by their Callyzer phone. */
export const listPeople = cache(async (): Promise<(Person & { email: string | null })[]> => {
  const { data, error } = await (await supabaseUser())
    .from("people")
    .select("id, full_name, role, email")
    .eq("active", true)
    .order("role")
    .order("full_name");
  if (error) fail("people", error);
  return data.map((p) => ({ id: p.id, name: p.full_name, role: p.role, title: TITLE[p.role], email: p.email }));
});

export async function getPerson(id: string): Promise<Person | null> {
  return (await listPeople()).find((p) => p.id === id) ?? null;
}

export const isSampleData = cache(async () => (await listPeople()).some((p) => p.email?.endsWith(SAMPLE_EMAIL_DOMAIN)));

/** The report covers the most recent IST day with calls; null before the first call arrives. */
export const getReportDay = cache(async (): Promise<string | null> => {
  const { data, error } = await (await supabaseUser()).from("calls").select("started_at").order("started_at", { ascending: false }).limit(1);
  if (error) fail("latest call", error);
  return data[0] ? toIst(data[0].started_at).slice(0, 10) : null;
});

type CallRow = {
  id: string;
  stream: CallRecord["stream"];
  person_id: string | null;
  agent_phone: string | null;
  started_at: string;
  duration_sec: number;
  recording_status: CallRecord["recordingStatus"];
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
  call_scores: { score: number; band: Band; levels: unknown; hard_fails: string[]; overrides: string[]; result: unknown } | null;
  transcript_segments?: { role: string; start_sec: number; end_sec: number; text: string; topic: string | null }[];
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
    client: { name: row.leads?.name ?? "Unknown client", city: row.leads?.city ?? "" },
    recordingStatus: row.recording_status,
    transcript: (row.transcript_segments ?? []).map((s) => ({
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
    notScored: row.scoring_status === "not_eligible" ? ((row.not_scored_reason ?? undefined) as NotScoredReason | undefined) : undefined,
    inProgress:
      row.scoring_status === "waiting" || row.scoring_status === "ready"
        ? row.recording_status === "pending"
          ? "recording"
          : row.transcript_status === "done"
            ? "scoring"
            : "transcription"
        : undefined,
    agentPhone: row.agent_phone ?? undefined,
  };
}

/** Calls on one IST day, earliest first. */
export const listCalls = cache(async (day: string): Promise<CallRecord[]> => {
  const [from, to] = istDayRange(day);
  const { data, error } = await (await supabaseUser())
    .from("calls")
    .select(CALL_FIELDS)
    .gte("started_at", from)
    .lt("started_at", to)
    .order("started_at");
  if (error) fail("calls", error);
  return (data as unknown as CallRow[]).map(toCallRecord);
});

export async function getCall(id: string): Promise<CallRecord | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await (await supabaseUser())
    .from("calls")
    .select(`${CALL_FIELDS}, transcript_segments ( idx, role, start_sec, end_sec, text, topic )`)
    .eq("id", id)
    .order("idx", { referencedTable: "transcript_segments" })
    .maybeSingle();
  if (error) fail("call", error);
  return data ? toCallRecord(data as unknown as CallRow) : null;
}

/** Daily averages for the six days before `day`, oldest first, per person id. */
export async function previousDayAverages(day: string): Promise<Record<string, number[]>> {
  const [weekStart] = istDayRange(day, -6);
  const { data, error } = await (await supabaseUser())
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
