// The two morning jobs (brief section 6). 06:00 IST: flag calls that can't be scored and store
// each person's day. 08:00 IST: email each person their report and the founders the summary.
// Pipeline code: reads with the secret key because no viewer is involved.

import "server-only";
import { pipelineReads } from "@/lib/data";
import { personReportEmail, teamSummaryEmail, type Email } from "@/lib/email/report-emails";
import { alert } from "@/lib/alerts";
import { recipientFor, sendEmail } from "@/lib/email/send";
import { istDayRange } from "@/lib/format";
import { personDayReport, teamSummary } from "@/lib/reports";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { supabaseAdmin } from "@/lib/supabase/server";

const SCORED_ROLES = ["executive", "consultant"];
const READER_ROLES = ["founder", "manager", "admin"];

export interface BuildResult {
  day: string;
  recordingsFlaggedMissing: number;
  reportsStored: number;
}

/** Flags long calls whose recording never arrived ("missing", never a zero) and stores each person's day. */
export async function buildDailyReports(day: string): Promise<BuildResult> {
  const db = supabaseAdmin();
  const [from, to] = istDayRange(day);
  const { data: flagged, error: flagError } = await db
    .from("calls")
    .update({ recording_status: "missing", scoring_status: "not_eligible", not_scored_reason: "recording_missing", transcript_status: "not_needed" })
    .eq("recording_status", "pending")
    .gte("duration_sec", MIN_SCORED_DURATION_SEC)
    .gte("started_at", from)
    .lt("started_at", to)
    .select("id");
  if (flagError) throw new Error(`flag missing recordings: ${flagError.message}`);

  const [people, calls] = await Promise.all([pipelineReads.people(), pipelineReads.calls(day)]);
  let reportsStored = 0;
  for (const person of people.filter((p) => SCORED_ROLES.includes(p.role))) {
    const report = personDayReport(person, calls);
    if (report.calls.length === 0) continue;
    const { error } = await db.from("daily_reports").upsert(
      {
        person_id: person.id,
        report_date: day,
        summary: {
          average: report.average,
          band: report.band,
          calls: report.calls.length,
          scored: report.scored.length,
          hardFailCalls: report.hardFailCalls,
          notRecorded: report.notRecorded,
          notScored: report.notScored,
          totalMinutes: report.totalMinutes,
        },
      },
      { onConflict: "person_id,report_date" },
    );
    if (error) throw new Error(`daily report for ${person.name}: ${error.message}`);
    reportsStored++;
  }
  return { day, recordingsFlaggedMissing: flagged.length, reportsStored };
}

export interface SendResult {
  day: string;
  sent: { kind: "person" | "team"; subject: string; to: string }[];
  skipped: { kind: "person" | "team"; who: string; why: string }[];
  /** With preview: the emails that would go out, not sent. */
  preview?: Email[];
}

/** Sends the day's emails once each; a re-run skips what was already sent. `limit` caps sends, for trying it. */
export async function sendDailyReports(day: string, { preview = false, limit = Infinity } = {}): Promise<SendResult> {
  const db = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
  const [people, calls, previous] = await Promise.all([pipelineReads.people(), pipelineReads.calls(day), pipelineReads.previousDayAverages(day)]);
  const result: SendResult = { day, sent: [], skipped: [], ...(preview ? { preview: [] } : {}) };

  // The nightly scoring should have finished by now; say so if calls are still waiting.
  if (!preview) {
    const waiting = calls.filter((c) => c.inProgress === "scoring").length;
    const failed = calls.filter((c) => c.inProgress === "transcription_failed").length;
    if (waiting || failed) {
      await alert(`scoring:${day}`, `${waiting + failed} call(s) from ${day} weren't scored`, [
        waiting ? `${waiting} transcribed call(s) from ${day} are still waiting for the nightly scoring. Check the routine at https://claude.ai/code/routines.` : "",
        failed ? `${failed} call(s) from ${day} couldn't be transcribed.` : "",
        "Today's reports went out without them; they'll be scored on the next run.",
      ].filter(Boolean));
    }
  }

  const { data: alreadySent, error: sentError } = await db.from("report_sends").select("kind, subject_key, recipient").eq("report_date", day);
  if (sentError) throw new Error(`report sends: ${sentError.message}`);
  const wasSent = (kind: string, key: string, to: string) => alreadySent.some((s) => s.kind === kind && s.subject_key === key && s.recipient === to);

  async function deliver(kind: "person" | "team", key: string, who: string, intended: string | null, email: Email) {
    const to = recipientFor(intended);
    if (!to) return void result.skipped.push({ kind, who, why: "no email address on the team list" });
    if (preview) return void result.preview!.push(email);
    if (wasSent(kind, key, to)) return void result.skipped.push({ kind, who, why: "already sent" });
    if (result.sent.length >= limit) return void result.skipped.push({ kind, who, why: "over the limit for this run" });
    await sendEmail(to, email);
    const { error } = await db.from("report_sends").insert({ report_date: day, kind, subject_key: key, recipient: to });
    if (error) throw new Error(`record send: ${error.message}`);
    result.sent.push({ kind, subject: email.subject, to });
  }

  // Each person who made calls that day gets their own report.
  for (const person of people.filter((p) => SCORED_ROLES.includes(p.role))) {
    const report = personDayReport(person, calls);
    if (report.calls.length === 0) continue;
    await deliver("person", person.id, person.name, person.email, personReportEmail(report, day, site));
  }

  // Founders, managers and admins get the team summary (one copy when REPORTS_TO is set).
  if (calls.length > 0) {
    const email = teamSummaryEmail(teamSummary(people, calls, previous), day, site);
    const readers = people.filter((p) => READER_ROLES.includes(p.role));
    const targets = process.env.REPORTS_TO ? [{ name: "test inbox", email: null }] : readers;
    if (targets.length === 0) result.skipped.push({ kind: "team", who: "founders", why: "no founder, manager or admin on the team list" });
    for (const reader of targets) await deliver("team", "team", reader.name, reader.email, email);
  }
  return result;
}
