// The scoring step, shared by `npm run score` and the scoring API the nightly routine uses.
// Claude does the judging; this code hands out calls, checks every result (schema, expected
// questions, speakers, quotes) and does the maths (weights, bands, measured rules) so the
// numbers can't drift with the prompt.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTimestamp, secondsFrom, toIst } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import type { Stream } from "./call-sheets";
import { calibrationFor } from "./calibration";
import { finaliseScore, type Level } from "./compute";
import { applyTopics, computeMetrics, silences, type SpeakerRole } from "./metrics";
import { resultFormat } from "./result-format";
import { CallSubmitSchema, speakerLabels } from "./schema";
import { disagrees, SECOND_OPINION_AFTER_MIN, SECOND_OPINION_WITHIN_DAYS, wantsSecondOpinion, type SecondOpinion } from "./second-opinion";
import { areasFor, hardFailsFor, RUBRIC_VERSION } from "./scorecards";
import { activeSheet, expectedFrom } from "./sheets";

export type Db = SupabaseClient<Database>;

interface CallInfo {
  id: string;
  stream: Stream;
  started_at: string;
  duration_sec: number;
  call_direction: string | null;
  lead_id: string | null;
  transcript_status: string;
  scoring_status: string;
  people: { full_name: string; role: string } | null;
}

async function loadCall(db: Db, callId: string) {
  const { data: call, error } = await db
    .from("calls")
    .select("id, stream, started_at, duration_sec, call_direction, lead_id, transcript_status, scoring_status, people!calls_person_id_fkey ( full_name, role )")
    .eq("id", callId)
    .maybeSingle<CallInfo>();
  if (error) throw new Error(`call: ${error.message}`);
  if (!call) return null;
  const { data: segments, error: segmentsError } = await db
    .from("transcript_segments")
    .select("idx, speaker_label, start_sec, end_sec, text")
    .eq("call_id", callId)
    .order("idx");
  if (segmentsError) throw new Error(`transcript: ${segmentsError.message}`);
  return { call, segments: segments.map((s) => ({ ...s, start_sec: Number(s.start_sec), end_sec: Number(s.end_sec) })) };
}

/** The oldest call ready for scoring (first calls and vision calls alike), leaving out `exclude` (calls a run has given up on). */
export async function nextReadyCallId(db: Db, exclude: string[] = [], stream?: Stream): Promise<string | null> {
  let query = db.from("calls").select("id").eq("scoring_status", "ready");
  if (stream) query = query.eq("stream", stream);
  if (exclude.length) query = query.not("id", "in", `(${exclude.join(",")})`);
  const { data, error } = await query.order("started_at").limit(1);
  if (error) throw new Error(`next call: ${error.message}`);
  return data[0]?.id ?? null;
}

/**
 * The oldest call that wants a second opinion (Red, or close to a band line), scored by an earlier
 * run at least an hour ago, not reviewed by a founder and not given one yet.
 */
export async function nextSecondOpinionCallId(db: Db, exclude: string[] = [], now = Date.now()): Promise<string | null> {
  let query = db
    .from("call_scores")
    .select("call_id, score, band")
    .is("second_opinion", null)
    .is("reviewed_at", null)
    .lt("scored_at", new Date(now - SECOND_OPINION_AFTER_MIN * 60_000).toISOString())
    .gt("scored_at", new Date(now - SECOND_OPINION_WITHIN_DAYS * 86_400_000).toISOString());
  if (exclude.length) query = query.not("call_id", "in", `(${exclude.join(",")})`);
  const { data, error } = await query.order("scored_at");
  if (error) throw new Error(`second opinions: ${error.message}`);
  return data.find((r) => wantsSecondOpinion(Number(r.score), r.band))?.call_id ?? null;
}

/** Everything needed to score one call: the call, measured facts, the rubric and the transcript. */
export async function scoringPackage(db: Db, callId: string) {
  const loaded = await loadCall(db, callId);
  if (!loaded) throw new Error(`No call ${callId}`);
  const { call, segments } = loaded;
  if (call.transcript_status !== "done" || segments.length === 0) throw new Error(`Call ${callId} has no transcript yet`);

  // Measured per speaker label; deciding who is who is the scorer's job.
  const talk: Record<string, number> = {};
  for (const s of segments) talk[s.speaker_label] = (talk[s.speaker_label] ?? 0) + (s.end_sec - s.start_sec);
  const gaps = silences(segments.map((s) => ({ role: "unknown" as const, startSec: s.start_sec, endSec: s.end_sec, text: s.text })));
  // The latest published call sheet; its questions are the ones coverage is judged against.
  const sheet = await activeSheet(db, call.stream);
  // A vision call is judged on building on the first call, not re-asking it (brief section 2).
  const lead = call.stream === "vision_call" && call.lead_id ? await leadNotes(db, call.lead_id) : null;
  // How the founders have corrected this kind of call: the scorer learns DNY's judgment from it.
  const calibration = await calibrationFor(db, call.stream);

  return {
    call: {
      id: call.id,
      stream: call.stream,
      startedAtIst: toIst(call.started_at),
      durationSec: call.duration_sec,
      direction: call.call_direction,
      person: call.people,
      ...(lead ? { lead } : {}),
    },
    measured: {
      talkSecondsBySpeaker: Object.fromEntries(Object.entries(talk).map(([k, v]) => [k, Math.round(v)])),
      silencesOver8s: gaps.filter((g) => g > 8).length,
      longestSilenceSec: Math.round(Math.max(0, ...gaps)),
    },
    rubric: {
      version: RUBRIC_VERSION,
      callSheet: sheet.label,
      areas: areasFor(call.stream),
      questions: sheet.questions,
      hardFails: hardFailsFor(call.stream).filter((h) => !h.measured),
    },
    resultFormat: resultFormat(call.stream),
    calibration,
    transcript: segments.map((s) => `[${formatTimestamp(s.start_sec)}] ${s.speaker_label}: ${s.text}`),
  };
}

async function leadNotes(db: Db, leadId: string) {
  const { data, error } = await db.from("leads").select("name, email, first_call_capture").eq("id", leadId).maybeSingle();
  if (error) throw new Error(`lead: ${error.message}`);
  return data && { name: data.name, email: data.email, firstCallNotes: data.first_call_capture };
}

/** A vision call's measured shares, in whole percent, for the scorer to square its levels with. */
interface VisionMeasures {
  consultantSharePct: number;
  consultantShareFirstHalfPct: number;
  serviceShareOfConsultantPct: number;
  credentialsMin: number;
}

export type SaveOutcome =
  | {
      ok: true;
      saved: boolean;
      score: number;
      band: string;
      hardFails: string[];
      clientSharePct: number;
      vision?: VisionMeasures;
      /** In second-opinion mode: the first score, and whether the two disagree enough to flag. */
      secondOpinion?: { firstScore: number; firstBand: string; disagrees: boolean };
      summary: string;
    }
  | { ok: false; errors: string[] };

const plain = (text: string) => text.normalize("NFC").toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * Checks a result and, unless `dryRun`, saves the speaker roles, measurements, score and lead fields.
 * With `secondOpinion`, the same checks, but only the score is kept, beside the first one.
 */
export async function checkAndSave(
  db: Db,
  callId: string,
  json: unknown,
  { dryRun, secondOpinion = false }: { dryRun: boolean; secondOpinion?: boolean },
): Promise<SaveOutcome> {
  const loaded = await loadCall(db, callId);
  if (!loaded) return { ok: false, errors: [`No call ${callId}`] };
  const { call, segments } = loaded;
  if (call.scoring_status === "not_eligible") return { ok: false, errors: ["This call isn't eligible for scoring"] };
  if (secondOpinion && call.scoring_status !== "scored") return { ok: false, errors: ["A second opinion needs a first score; this call hasn't been scored yet"] };

  const parsed = CallSubmitSchema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) };
  const result = parsed.data;
  const errors: string[] = [];
  if (result.stream !== call.stream) errors.push(`Call is a ${call.stream}, result is a ${result.stream}`);
  if (result.stream === "first_call") {
    if (result.capture.vcDateTime && result.capture.vcDate === null) errors.push("capture.vcDate must be set when vcDateTime is (work out the date from the call date)");
  }
  if (result.stream === "vision_call") {
    // Topic tags: in order, each a real stretch inside the call, so minutes per topic add up.
    let previousEnd = 0;
    for (const t of result.topics) {
      const [from, to] = [secondsFrom(t.from), secondsFrom(t.to)];
      if (!(to > from)) errors.push(`topics: ${t.from} to ${t.to} must end after it starts`);
      else if (from < previousEnd) errors.push(`topics: ${t.from} to ${t.to} overlaps the stretch before; list them in order without overlaps`);
      else if (to > call.duration_sec + 30) errors.push(`topics: ${t.to} is after the end of the call (${formatTimestamp(call.duration_sec)})`);
      previousEnd = Math.max(previousEnd, to);
    }
    if (result.topics.length === 0) errors.push("topics: tag the call's stretches (client_story, value, dny_credentials, services, fees, other)");
    const known = new Set((await activeSheet(db, call.stream)).questions.map((q) => q.id));
    const unknown = Object.keys(result.capture.answers).filter((id) => !known.has(id));
    if (unknown.length) errors.push(`capture.answers has questions that aren't on the sheet: ${unknown.join(", ")}`);
    if (result.hardFails.some((h) => h.id === "proposal_without_date") && result.capture.proposalDate) {
      errors.push("A proposal_without_date hard fail can't have a capture.proposalDate; one of them is wrong");
    }
  }

  const labels = new Set(segments.map((s) => s.speaker_label));
  const agentLabels = speakerLabels(result.speakerRoles.agent);
  const clientLabels = speakerLabels(result.speakerRoles.client);
  for (const label of [...agentLabels, ...clientLabels]) {
    if (!labels.has(label)) errors.push(`Speaker "${label}" isn't in the transcript (${[...labels].join(", ")})`);
  }
  if (agentLabels.some((l) => clientLabels.includes(l))) errors.push("A speaker can't be both the executive and the client");

  const sheet = await activeSheet(db, call.stream);
  const expected = expectedFrom(sheet.questions, result.isRunningBusiness).map((q) => q.id);
  const missing = expected.filter((id) => !result.coverage.some((c) => c.question === id));
  if (missing.length) errors.push(`Coverage is missing questions: ${missing.join(", ")}`);

  // No finding without evidence (brief section 7): every quote must be words from this transcript.
  const transcriptText = plain(segments.map((s) => s.text).join(" "));
  const evidence = [
    ...Object.values(result.areas).flatMap((a) => a.evidence),
    ...result.coverage.flatMap((c) => c.evidence),
    ...result.hardFails.flatMap((h) => h.evidence),
    ...result.feedback.strengths.map((f) => f.evidence),
    ...result.feedback.fixes.map((f) => f.evidence),
  ];
  for (const e of evidence) {
    if (!transcriptText.includes(plain(e.quote))) errors.push(`Quote isn't in the transcript (copy the words exactly): [${e.at}] ${e.quote}`);
  }
  if (errors.length) return { ok: false, errors };

  const roleOf = (label: string): SpeakerRole => (agentLabels.includes(label) ? "agent" : clientLabels.includes(label) ? "client" : "unknown");
  const roled = segments.map((s) => ({ role: roleOf(s.speaker_label), startSec: s.start_sec, endSec: s.end_sec, text: s.text }));
  const metrics = computeMetrics(result.stream === "vision_call" ? applyTopics(roled, result.topics) : roled, call.duration_sec);
  const levels = Object.fromEntries(Object.entries(result.areas).map(([id, a]) => [id, a.level])) as Record<string, Level>;
  const final = finaliseScore(call.stream, { levels, hardFails: result.hardFails.map((h) => h.id) }, metrics);
  const clientSharePct = Math.round(metrics.clientShare * 100);
  const vision: VisionMeasures | undefined =
    call.stream === "vision_call"
      ? {
          consultantSharePct: Math.round(metrics.agentShareOverall * 100),
          consultantShareFirstHalfPct: Math.round(metrics.agentShareFirstHalf * 100),
          serviceShareOfConsultantPct: Math.round(metrics.serviceShareOfAgent * 100),
          credentialsMin: Math.round((metrics.credentialsSec / 60) * 10) / 10,
        }
      : undefined;
  const summary =
    `${final.score}/100, ${final.band}` +
    (final.hardFails.length ? `, hard fails: ${final.hardFails.join(", ")}` : "") +
    ` · client talked ${clientSharePct}%` +
    (vision
      ? ` · consultant ${vision.consultantShareFirstHalfPct}% in the first half, ${vision.consultantSharePct}% overall · services ${vision.serviceShareOfConsultantPct}% of the consultant's talk · credentials ${vision.credentialsMin} min`
      : "") +
    ` · ${Object.entries(final.levels).map(([id, level]) => `${id} ${level}`).join(", ")}` +
    (final.overrides.length ? ` · ${final.overrides.join(" ")}` : "");
  const outcome = { ok: true as const, score: final.score, band: final.band, hardFails: final.hardFails, clientSharePct, ...(vision ? { vision } : {}), summary };

  if (secondOpinion) {
    const { data: first, error: firstError } = await db.from("call_scores").select("score, band, hard_fails, ai_score, ai_band, ai_hard_fails").eq("call_id", callId).single();
    if (firstError) throw new Error(`first score: ${firstError.message}`);
    // Compared with the AI's first score (a founder's review, if any, replaces score but keeps ai_*).
    const firstScore = Number(first.ai_score ?? first.score);
    const compared = { firstScore, firstBand: first.ai_band ?? first.band, disagrees: disagrees({ score: firstScore, hardFails: first.ai_hard_fails ?? first.hard_fails }, final) };
    if (dryRun) return { ...outcome, secondOpinion: compared, saved: false };
    const opinion: SecondOpinion = { score: final.score, band: final.band, levels: final.levels, hardFails: final.hardFails, at: new Date().toISOString() };
    const { data: saved, error } = await db.from("call_scores").update({ second_opinion: opinion as never }).eq("call_id", callId).is("second_opinion", null).select("call_id");
    if (error) throw new Error(`second opinion: ${error.message}`);
    return { ...outcome, secondOpinion: compared, saved: saved.length > 0 };
  }
  if (dryRun) return { ...outcome, saved: false };

  for (const label of labels) {
    const { error } = await db.from("transcript_segments").update({ role: roleOf(label) }).eq("call_id", callId).eq("speaker_label", label);
    if (error) throw new Error(`roles: ${error.message}`);
  }
  const { error: metricsError } = await db.from("call_metrics").upsert({
    call_id: callId,
    agent_talk_sec: metrics.agentTalkSec,
    client_talk_sec: metrics.clientTalkSec,
    client_share: metrics.clientShare,
    agent_share_first_half: metrics.agentShareFirstHalf,
    silences_over_8s: metrics.silencesOver8s,
    longest_silence_sec: metrics.longestSilenceSec,
    credentials_sec: metrics.credentialsSec,
    service_share_of_agent: metrics.serviceShareOfAgent,
  });
  if (metricsError) throw new Error(`metrics: ${metricsError.message}`);
  const { error: scoreError } = await db.rpc("record_call_score", {
    p_call_id: callId,
    p_rubric_version: RUBRIC_VERSION,
    // The call sheet version scored against, so the call page shows those questions later.
    p_reference_version_ids: sheet.versionId ? [sheet.versionId] : [],
    p_score: final.score,
    p_band: final.band,
    p_levels: final.levels,
    p_hard_fails: final.hardFails,
    p_overrides: final.overrides,
    p_result: result as never,
  });
  if (scoreError) throw new Error(`save score: ${scoreError.message}`);
  if (call.lead_id) {
    const { error } = await db.rpc("record_lead_capture", { p_lead_id: call.lead_id, p_stream: call.stream, p_capture: result.capture as never });
    if (error) throw new Error(`lead capture: ${error.message}`);
  }
  return { ...outcome, saved: true };
}

/** Not a sales call (vendor, telecom, job applicant, personal): never scored. False if it was already scored. */
export async function skipCall(db: Db, callId: string): Promise<boolean> {
  const { data, error } = await db
    .from("calls")
    .update({ scoring_status: "not_eligible", not_scored_reason: "not_sales_call" })
    .eq("id", callId)
    .neq("scoring_status", "scored")
    .select("id");
  if (error) throw new Error(`skip: ${error.message}`);
  return data.length > 0;
}
