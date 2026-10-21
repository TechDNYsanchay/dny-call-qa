// Loads the sample calls into Supabase so the screens can be checked end to end, or removes them.
// Sample rows are marked: people have @sample.invalid emails and leads have +91 90000 numbers.
//
//   npm run db:sample            load (safe to re-run; it upserts)
//   npm run db:sample -- --remove

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/supabase/database.types";
import { CALLS, PEOPLE, PREVIOUS_DAYS, REPORT_DATE } from "../src/lib/data/sample-data";
import { RUBRIC_VERSION } from "../src/lib/scoring/scorecards";

const SAMPLE_EMAIL_DOMAIN = "sample.invalid";
const SAMPLE_PHONE_PREFIX = "+9190000";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Run with --env-file=.env.local (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY)");
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** REPORT_DATE minus n days, as YYYY-MM-DD. Scripts may use Date; pages may not. */
function daysBefore(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

async function remove() {
  const people = must(await db.from("people").select("id").like("email", `%@${SAMPLE_EMAIL_DOMAIN}`), "find sample people");
  const ids = people.map((p) => p.id);
  if (ids.length) {
    must(await db.from("daily_reports").delete().in("person_id", ids).select("id"), "delete reports");
    // Segments, metrics and scores go with their calls (on delete cascade).
    must(await db.from("calls").delete().in("person_id", ids).select("id"), "delete calls");
  }
  const leads = must(await db.from("leads").delete().like("phone", `${SAMPLE_PHONE_PREFIX}%`).select("id"), "delete leads");
  must(await db.from("people").delete().like("email", `%@${SAMPLE_EMAIL_DOMAIN}`).select("id"), "delete people");
  console.log(`Removed ${ids.length} sample people, their calls and reports, and ${leads.length} sample leads.`);
}

async function load() {
  const people = must(
    await db
      .from("people")
      .upsert(
        PEOPLE.map((p) => ({ full_name: p.name, email: `${p.id}@${SAMPLE_EMAIL_DOMAIN}`, role: p.role })),
        { onConflict: "email" },
      )
      .select("id, email"),
    "upsert people",
  );
  const personId = (sampleId: string) => people.find((p) => p.email === `${sampleId}@${SAMPLE_EMAIL_DOMAIN}`)!.id;

  for (const [i, call] of CALLS.entries()) {
    const phone = `${SAMPLE_PHONE_PREFIX}${String(i + 1).padStart(5, "0")}`;
    const capture = call.result?.capture as unknown as Json | undefined;
    const [lead] = must(
      await db
        .from("leads")
        .upsert(
          {
            phone,
            name: call.client.name,
            city: call.client.city,
            ...(call.result?.stream === "first_call" ? { first_call_capture: capture } : {}),
            ...(call.result?.stream === "vision_call" ? { vision_call_capture: capture } : {}),
          },
          { onConflict: "phone" },
        )
        .select("id"),
      `upsert lead for ${call.id}`,
    );

    const [row] = must(
      await db
        .from("calls")
        .upsert(
          {
            stream: call.stream,
            source: call.stream === "first_call" ? "callyzer" : "tldv",
            source_id: call.id,
            person_id: personId(call.personId),
            lead_id: lead.id,
            client_phone: phone,
            started_at: call.startedAt,
            duration_sec: call.durationSec,
            recording_status: call.recordingStatus,
            transcript_status: call.transcript.length ? "done" : "not_needed",
            scoring_status: call.final ? "scored" : "not_eligible",
            not_scored_reason: call.notScored ?? null,
          },
          { onConflict: "source,source_id" },
        )
        .select("id"),
      `upsert call ${call.id}`,
    );

    must(await db.from("transcript_segments").delete().eq("call_id", row.id).select("id"), "clear transcript");
    if (call.transcript.length) {
      must(
        await db
          .from("transcript_segments")
          .insert(
            call.transcript.map((line, idx) => ({
              call_id: row.id,
              idx,
              speaker_label:
                line.role === "agent" ? (call.result?.speakerRoles.agent ?? "Speaker A") : (call.result?.speakerRoles.client ?? "Speaker B"),
              role: line.role,
              start_sec: line.startSec,
              end_sec: line.endSec,
              text: line.text,
              topic: line.topic ?? null,
            })),
          )
          .select("id"),
        `insert transcript for ${call.id}`,
      );
    }

    if (call.metrics) {
      const m = call.metrics;
      must(
        await db
          .from("call_metrics")
          .upsert({
            call_id: row.id,
            agent_talk_sec: m.agentTalkSec,
            client_talk_sec: m.clientTalkSec,
            client_share: m.clientShare,
            agent_share_first_half: m.agentShareFirstHalf,
            silences_over_8s: m.silencesOver8s,
            longest_silence_sec: m.longestSilenceSec,
            credentials_sec: m.credentialsSec,
            service_share_of_agent: m.serviceShareOfAgent,
          })
          .select("call_id"),
        `upsert metrics for ${call.id}`,
      );
    }

    if (call.final && call.result) {
      must(
        await db
          .from("call_scores")
          .upsert({
            call_id: row.id,
            rubric_version: RUBRIC_VERSION,
            score: call.final.score,
            band: call.final.band,
            levels: call.final.levels as unknown as Json,
            hard_fails: call.final.hardFails,
            overrides: call.final.overrides,
            result: call.result as unknown as Json,
          })
          .select("call_id"),
        `upsert score for ${call.id}`,
      );
    }
  }

  const reports = PEOPLE.flatMap((p) =>
    (PREVIOUS_DAYS[p.id] ?? []).map((average, i, all) => ({
      person_id: personId(p.id),
      report_date: daysBefore(REPORT_DATE, all.length - i),
      summary: { average, sample: true },
    })),
  );
  must(await db.from("daily_reports").upsert(reports, { onConflict: "person_id,report_date" }).select("id"), "upsert reports");

  console.log(`Loaded ${PEOPLE.length} people, ${CALLS.length} calls (${CALLS.filter((c) => c.final).length} scored) and ${reports.length} past daily averages.`);
}

await (process.argv.includes("--remove") ? remove() : load());
