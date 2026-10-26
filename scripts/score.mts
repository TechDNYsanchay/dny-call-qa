// The scoring step's tool: hands out one transcribed call with everything needed to score it,
// and saves a result after checking it. Claude does the judging; this script does the maths
// (weights, bands, measured rules) so the numbers can't drift with the prompt.
//
//   npm run score -- next [--call <id>]          print the next call ready for scoring (or that call)
//   npm run score -- save <callId> <result.json>  check the result, save score, metrics and lead fields
//
// The result must match CallResultSchema (src/lib/scoring/schema.ts). Uses the secret key for
// now; the nightly routine will use the restricted scoring_agent role.

import { readFileSync } from "node:fs";
import { formatTimestamp, toIst } from "../src/lib/format";
import { expectedQuestions, FIRST_CALL_QUESTIONS, VISION_CALL_QUESTIONS, type Stream } from "../src/lib/scoring/call-sheets";
import { finaliseScore, type Level } from "../src/lib/scoring/compute";
import { computeMetrics, silences } from "../src/lib/scoring/metrics";
import { CallResultSchema, speakerLabels } from "../src/lib/scoring/schema";
import { areasFor, hardFailsFor, RUBRIC_VERSION } from "../src/lib/scoring/scorecards";
import { db, must } from "./lib.mjs";

const [command, ...args] = process.argv.slice(2);

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

async function loadCall(callId: string) {
  const { data: call, error } = await db
    .from("calls")
    .select("id, stream, started_at, duration_sec, call_direction, lead_id, transcript_status, scoring_status, people ( full_name, role )")
    .eq("id", callId)
    .maybeSingle<CallInfo>();
  if (error) throw new Error(`call: ${error.message}`);
  if (!call) throw new Error(`No call ${callId}`);
  const segments = must(
    await db.from("transcript_segments").select("idx, speaker_label, start_sec, end_sec, text").eq("call_id", callId).order("idx"),
    "transcript",
  );
  return { call, segments: segments.map((s) => ({ ...s, start_sec: Number(s.start_sec), end_sec: Number(s.end_sec) })) };
}

if (command === "next") {
  const flag = args.indexOf("--call");
  const callId =
    flag >= 0
      ? args[flag + 1]
      : must(await db.from("calls").select("id").eq("scoring_status", "ready").order("started_at").limit(1), "next call")[0]?.id;
  if (!callId) {
    console.log("No calls are ready for scoring.");
    process.exit(0);
  }
  const { call, segments } = await loadCall(callId);
  if (call.transcript_status !== "done" || segments.length === 0) throw new Error(`Call ${callId} has no transcript yet`);

  // Facts measured from the timings, per speaker label (who is who is the scorer's call).
  const talk: Record<string, number> = {};
  for (const s of segments) talk[s.speaker_label] = (talk[s.speaker_label] ?? 0) + (s.end_sec - s.start_sec);
  const gaps = silences(segments.map((s) => ({ role: "unknown" as const, startSec: s.start_sec, endSec: s.end_sec, text: s.text })));

  console.log(
    JSON.stringify(
      {
        call: {
          id: call.id,
          stream: call.stream,
          startedAtIst: toIst(call.started_at),
          durationSec: call.duration_sec,
          direction: call.call_direction,
          person: call.people,
        },
        measured: {
          talkSecondsBySpeaker: Object.fromEntries(Object.entries(talk).map(([k, v]) => [k, Math.round(v)])),
          silencesOver8s: gaps.filter((g) => g > 8).length,
          longestSilenceSec: Math.round(Math.max(0, ...gaps)),
        },
        rubric: {
          version: RUBRIC_VERSION,
          areas: areasFor(call.stream),
          questions: call.stream === "first_call" ? FIRST_CALL_QUESTIONS : VISION_CALL_QUESTIONS,
          hardFails: hardFailsFor(call.stream).filter((h) => !h.measured),
        },
        transcript: segments.map((s) => `[${formatTimestamp(s.start_sec)}] ${s.speaker_label}: ${s.text}`),
      },
      null,
      2,
    ),
  );
} else if (command === "save") {
  const [callId, file] = args;
  if (!callId || !file) throw new Error("Usage: npm run score -- save <callId> <result.json>");
  const { call, segments } = await loadCall(callId);
  const parsed = CallResultSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    console.error("The result doesn't match the schema:");
    for (const issue of parsed.error.issues.slice(0, 15)) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  const result = parsed.data;
  if (result.stream !== call.stream) throw new Error(`Call is a ${call.stream}, result is a ${result.stream}`);
  const labels = new Set(segments.map((s) => s.speaker_label));
  const agentLabels = speakerLabels(result.speakerRoles.agent);
  const clientLabels = speakerLabels(result.speakerRoles.client);
  for (const label of [...agentLabels, ...clientLabels]) {
    if (!labels.has(label)) throw new Error(`Speaker "${label}" isn't in the transcript (${[...labels].join(", ")})`);
  }
  if (agentLabels.some((l) => clientLabels.includes(l))) throw new Error("A speaker can't be both the executive and the client");
  const expected = expectedQuestions(call.stream, result.isRunningBusiness).map((q) => q.id);
  const missing = expected.filter((id) => !result.coverage.some((c) => c.question === id));
  if (missing.length) throw new Error(`Coverage is missing questions: ${missing.join(", ")}`);

  // Speaker roles onto the transcript, then the measured rules.
  const roleOf = (label: string) => (agentLabels.includes(label) ? "agent" : clientLabels.includes(label) ? "client" : "unknown");
  for (const label of labels) {
    must(await db.from("transcript_segments").update({ role: roleOf(label) }).eq("call_id", callId).eq("speaker_label", label).select("idx"), "roles");
  }
  const metrics = computeMetrics(
    segments.map((s) => ({ role: roleOf(s.speaker_label), startSec: s.start_sec, endSec: s.end_sec, text: s.text })),
    call.duration_sec,
  );
  must(
    await db
      .from("call_metrics")
      .upsert({
        call_id: callId,
        agent_talk_sec: metrics.agentTalkSec,
        client_talk_sec: metrics.clientTalkSec,
        client_share: metrics.clientShare,
        agent_share_first_half: metrics.agentShareFirstHalf,
        silences_over_8s: metrics.silencesOver8s,
        longest_silence_sec: metrics.longestSilenceSec,
        credentials_sec: metrics.credentialsSec,
        service_share_of_agent: metrics.serviceShareOfAgent,
      })
      .select("call_id"),
    "metrics",
  );

  const levels = Object.fromEntries(Object.entries(result.areas).map(([id, a]) => [id, a.level])) as Record<string, Level>;
  const final = finaliseScore(call.stream, { levels, hardFails: result.hardFails.map((h) => h.id) }, metrics);
  must(
    await db.rpc("record_call_score", {
      p_call_id: callId,
      p_rubric_version: RUBRIC_VERSION,
      p_reference_version_ids: [],
      p_score: final.score,
      p_band: final.band,
      p_levels: final.levels,
      p_hard_fails: final.hardFails,
      p_overrides: final.overrides,
      p_result: result as never,
    }),
    "save score",
  );
  if (call.lead_id) {
    must(await db.rpc("record_lead_capture", { p_lead_id: call.lead_id, p_stream: call.stream, p_capture: result.capture as never }), "lead capture");
  }
  console.log(
    `Saved: ${final.score}/100, ${final.band}` +
      (final.hardFails.length ? `, hard fails: ${final.hardFails.join(", ")}` : "") +
      ` · client talked ${Math.round(metrics.clientShare * 100)}%`,
  );
} else {
  console.log("Usage: npm run score -- next [--call <id>] | save <callId> <result.json>  (see scripts/score.mts)");
  process.exitCode = 1;
}
