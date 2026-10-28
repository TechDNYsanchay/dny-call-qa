// The two morning jobs (brief section 6). 06:00 IST: flag calls that can't be scored and store
// each person's day. 08:00 IST: email each person their report and the founders the summary.
// Pipeline code: reads with the secret key because no viewer is involved.

import "server-only";
import { pipelineReads } from "@/lib/data";
import { missedCallsEmail, personReportEmail, personRollupEmail, teamRollupEmail, teamSummaryEmail, type Email } from "@/lib/email/report-emails";
import { focusHit, focusLabel, focusProgress } from "@/lib/coaching";
import { forPerson, isOverdue, type MissedItem } from "@/lib/follow-ups";
import { alert } from "@/lib/alerts";
import { sendEmail } from "@/lib/email/send";
import { istDayRange, toIst } from "@/lib/format";
import { personDayReport, teamSummary } from "@/lib/reports";
import { rollup, type Period } from "@/lib/rollups";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { reportsTestInbox } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

const SCORED_ROLES = ["executive", "consultant"];
const READER_ROLES = ["founder", "manager", "admin"];

export interface BuildResult {
  day: string;
  recordingsFlaggedMissing: number;
  reportsStored: number;
}

/**
 * Flags long calls whose recording never arrived ("missing", never a zero) and stores each person's day.
 * Earlier days count too, so a call the job never looked at (or a day it didn't run) isn't left waiting.
 * If the recording turns up later after all, copyRecording puts the call back in line for scoring.
 */
export async function buildDailyReports(day: string): Promise<BuildResult> {
  const db = supabaseAdmin();
  const [, to] = istDayRange(day);
  const { data: flagged, error: flagError } = await db
    .from("calls")
    .update({ recording_status: "missing", scoring_status: "not_eligible", not_scored_reason: "recording_missing", transcript_status: "not_needed" })
    .eq("recording_status", "pending")
    .gte("duration_sec", MIN_SCORED_DURATION_SEC)
    .lt("started_at", to)
    .select("id");
  if (flagError) throw new Error(`flag missing recordings: ${flagError.message}`);

  const [people, calls, sheets] = await Promise.all([pipelineReads.people(), pipelineReads.calls(day), pipelineReads.activeSheets()]);
  let reportsStored = 0;
  for (const person of people.filter((p) => SCORED_ROLES.includes(p.role))) {
    const report = personDayReport(person, calls, sheets.questions);
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
  // Follow-ups are as of now (the morning the email goes out), not the report day.
  const today = toIst(new Date().toISOString()).slice(0, 10);
  const [people, calls, previous, sheets, followUps, focuses, toReview] = await Promise.all([
    pipelineReads.people(),
    pipelineReads.calls(day),
    pipelineReads.previousDayAverages(day),
    pipelineReads.activeSheets(),
    pipelineReads.followUps(today),
    pipelineReads.focuses(),
    pipelineReads.secondOpinionFlags(),
  ]);
  const earliestFocus = focuses.reduce((d, f) => (f.setAt.slice(0, 10) < d ? f.setAt.slice(0, 10) : d), day);
  const focusCalls = focuses.length ? await pipelineReads.callsBetween(earliestFocus, day) : [];
  const result: SendResult = { day, sent: [], skipped: [], ...(preview ? { preview: [] } : {}) };
  const testInbox = await reportsTestInbox();

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
    const to = testInbox || intended;
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
    const report = personDayReport(person, calls, sheets.questions);
    if (report.calls.length === 0) continue;
    const f = focuses.find((x) => x.personId === person.id);
    const focus = f
      ? (() => {
          const yesterday = report.scored.map((c) => focusHit(c, f)).filter((h) => h !== null);
          return {
            label: focusLabel(f, sheets.questions),
            verb: f.kind === "question" ? "asked" : "Met",
            yesterday: { hit: yesterday.filter(Boolean).length, total: yesterday.length },
            since: focusProgress(focusCalls, f, day).since,
            setDay: f.setAt.slice(0, 10),
          };
        })()
      : undefined;
    await deliver("person", person.id, person.name, person.email, personReportEmail(report, day, site, { items: forPerson(followUps, person.id), today }, focus));
  }

  // Founders, managers and admins get the team summary (one copy to the test inbox while testing).
  if (calls.length > 0) {
    const email = teamSummaryEmail(teamSummary(people, calls, previous, sheets.questions), day, site, followUps, toReview);
    const readers = people.filter((p) => READER_ROLES.includes(p.role));
    const targets = testInbox ? [{ name: "test inbox", email: null }] : readers;
    if (targets.length === 0) result.skipped.push({ kind: "team", who: "founders", why: "no founder, manager or admin on the team list" });
    for (const reader of targets) await deliver("team", "team", reader.name, reader.email, email);
  }
  return result;
}

/**
 * Emails the weekly or monthly roll-up: the team version to founders, managers and admins, and
 * each person's own. Same once-only rule and test inbox as the daily emails.
 */
export async function sendRollups(period: Period, { preview = false, limit = Infinity } = {}): Promise<SendResult> {
  const db = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
  const [people, calls, previousCalls] = await Promise.all([
    pipelineReads.people(),
    pipelineReads.callsBetween(period.from, period.to),
    pipelineReads.callsBetween(period.previous.from, period.previous.to),
  ]);
  const sheets = await pipelineReads.activeSheets();
  const result: SendResult = { day: period.from, sent: [], skipped: [], ...(preview ? { preview: [] } : {}) };
  const testInbox = await reportsTestInbox();
  if (calls.length === 0) return result;
  const r = rollup(period, people, calls, previousCalls, sheets.questions);

  const { data: alreadySent, error } = await db.from("report_sends").select("kind, subject_key, recipient").eq("report_date", period.from);
  if (error) throw new Error(`report sends: ${error.message}`);

  async function deliver(kind: "person" | "team", key: string, who: string, intended: string | null, email: Email) {
    const to = testInbox || intended;
    if (!to) return void result.skipped.push({ kind, who, why: "no email address on the team list" });
    if (preview) return void result.preview!.push(email);
    // Keys carry the period kind, so a Monday's weekly email never clashes with that day's daily one.
    const sendKey = `${period.kind}:${key}`;
    if ((alreadySent ?? []).some((s) => s.kind === kind && s.subject_key === sendKey && s.recipient === to)) {
      return void result.skipped.push({ kind, who, why: "already sent" });
    }
    if (result.sent.length >= limit) return void result.skipped.push({ kind, who, why: "over the limit for this run" });
    await sendEmail(to, email);
    const { error: logError } = await db.from("report_sends").insert({ report_date: period.from, kind, subject_key: sendKey, recipient: to });
    if (logError) throw new Error(`record send: ${logError.message}`);
    result.sent.push({ kind, subject: email.subject, to });
  }

  for (const p of r.people) {
    const person = people.find((x) => x.id === p.person.id);
    await deliver("person", p.person.id, p.person.name, person?.email ?? null, personRollupEmail(p, r, site));
  }
  const email = teamRollupEmail(r, site);
  const targets = testInbox ? [{ name: "test inbox", email: null }] : people.filter((p) => READER_ROLES.includes(p.role));
  for (const reader of targets) await deliver("team", "team", reader.name, reader.email, email);
  return result;
}

export interface MissedAlertResult {
  sent: { to: string; person: string; calls: number }[];
  skipped: { person: string; why: string }[];
  preview?: Email[];
}

/**
 * Hourly in working hours: emails each executive the clients who called in the last day, weren't
 * answered and still haven't been called back after 2 hours. Each missed call is in one alert only.
 */
export async function sendMissedCallAlerts({ preview = false } = {}): Promise<MissedAlertResult> {
  const db = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
  const nowMs = Date.now();
  const today = toIst(new Date(nowMs).toISOString()).slice(0, 10);
  const [people, followUps, testInbox] = await Promise.all([pipelineReads.people(), pipelineReads.followUps(today), reportsTestInbox()]);
  const due = followUps.missed.filter((m) => isOverdue(m, nowMs) && !m.alerted && Date.parse(m.lastAt) > nowMs - 24 * 3600_000);
  const result: MissedAlertResult = { sent: [], skipped: [], ...(preview ? { preview: [] } : {}) };

  const byPerson = new Map<string, MissedItem[]>();
  for (const m of due) byPerson.set(m.personId, [...(byPerson.get(m.personId) ?? []), m]);
  for (const [personId, items] of byPerson) {
    const person = people.find((p) => p.id === personId);
    const email = missedCallsEmail(person?.name ?? "Unknown number", items, today, site);
    const to = testInbox || person?.email;
    if (preview) {
      result.preview!.push(email);
      continue;
    }
    if (!person) result.skipped.push({ person: personId || "a phone not on the team list", why: "not on the team list" });
    else if (!to) result.skipped.push({ person: person.name, why: "no email address on the team list" });
    else {
      await sendEmail(to, email);
      result.sent.push({ to, person: person.name, calls: items.length });
    }
    // Marked either way, so a person added later doesn't get a backlog of old misses.
    const { error } = await db.from("calls").update({ missed_alerted_at: new Date().toISOString() }).in("id", items.flatMap((m) => m.callIds));
    if (error) throw new Error(`mark missed calls alerted: ${error.message}`);
  }
  return result;
}
