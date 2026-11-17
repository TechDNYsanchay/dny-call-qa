// The two morning jobs (brief section 6). 06:00 IST: flag calls that can't be scored and store
// each person's day. 08:00 IST: email each person their report and the founders the summary, or,
// with "One daily email" on (Team members page), one email with everything to the founders only.
// Pipeline code: reads with the secret key because no viewer is involved.

import "server-only";
import { pipelineReads } from "@/lib/data";
import { briefingEmail, missedCallsEmail, personReportEmail, personRollupEmail, shortDay, teamRollupEmail, teamSummaryEmail, type Email } from "@/lib/email/report-emails";
import { clock12, dailyEmail, type TodayMeeting } from "@/lib/email/daily-email";
import { focusHit, focusLabel, focusProgress } from "@/lib/coaching";
import { forPerson, isOverdue, type MissedItem } from "@/lib/follow-ups";
import { alert } from "@/lib/alerts";
import { sendEmail } from "@/lib/email/send";
import { addDays, istDayRange, toIst } from "@/lib/format";
import { personDayReport, teamSummary } from "@/lib/reports";
import { monthPeriod, rollup, weekPeriod, type Period, type Rollup } from "@/lib/rollups";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { dailyEmailTo, reportsTestInbox } from "@/lib/settings";
import { timeIn } from "@/lib/whatsapp";
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
  // "One daily email" replaces every other report email.
  const daily = await dailyEmailTo();
  if (daily) return sendDailyEmail(day, daily, { preview });
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
  // Vision calls fixed for today: the consultants get the brief, the founders a list.
  const meetingIds = followUps.meetings.filter((m) => m.date === today).map((m) => m.leadId);
  const briefs = meetingIds.length ? await pipelineReads.briefings(meetingIds) : [];
  const earliestFocus = focuses.reduce((d, f) => (f.setAt.slice(0, 10) < d ? f.setAt.slice(0, 10) : d), day);
  const focusCalls = focuses.length ? await pipelineReads.callsBetween(earliestFocus, day) : [];
  const result: SendResult = { day, sent: [], skipped: [], ...(preview ? { preview: [] } : {}) };
  const testInbox = await reportsTestInbox();
  if (!preview) await alertUnscored(day, calls);

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
    const email = teamSummaryEmail(teamSummary(people, calls, previous, sheets.questions), day, site, followUps, toReview, briefs);
    const readers = people.filter((p) => READER_ROLES.includes(p.role));
    const targets = testInbox ? [{ name: "test inbox", email: null }] : readers;
    if (targets.length === 0) result.skipped.push({ kind: "team", who: "founders", why: "no founder, manager or admin on the team list" });
    for (const reader of targets) await deliver("team", "team", reader.name, reader.email, email);
  }

  // Each brief goes to the consultant who owns the lead, or to every consultant when none does.
  const consultants = people.filter((p) => p.role === "consultant");
  for (const b of briefs) {
    const owner = consultants.find((p) => p.id === b.ownerId);
    const to = owner ? [owner] : consultants;
    if (to.length === 0) result.skipped.push({ kind: "person", who: `brief for ${b.name}`, why: "no consultant on the team list" });
    for (const c of to) await deliver("person", `brief:${b.leadId}`, c.name, c.email, briefingEmail(b, site));
  }
  return result;
}

/** The nightly scoring should have finished by 8 am; tell tech@ if calls are still waiting. */
async function alertUnscored(day: string, calls: { inProgress?: string }[]): Promise<void> {
  const waiting = calls.filter((c) => c.inProgress === "scoring").length;
  const failed = calls.filter((c) => c.inProgress === "transcription_failed").length;
  if (!waiting && !failed) return;
  await alert(`scoring:${day}`, `${waiting + failed} call(s) from ${day} weren't scored`, [
    waiting ? `${waiting} transcribed call(s) from ${day} are still waiting for the nightly scoring. Check the routine at https://claude.ai/code/routines.` : "",
    failed ? `${failed} call(s) from ${day} couldn't be transcribed.` : "",
    "Today's reports went out without them; they'll be scored on the next run.",
  ].filter(Boolean));
}

/** Plain sentences on anything missing from the email: a job that keeps failing, calls still waiting. */
async function dataIssues(calls: { inProgress?: string; personId: string }[], activeIds: Set<string>, lastPhoneCallAt: string | null): Promise<string[]> {
  const since = new Date(Date.now() - 26 * 3600_000).toISOString();
  const { data, error } = await supabaseAdmin().from("alert_log").select("key").like("key", "job:%").gte("last_sent_at", since);
  if (error) throw new Error(`alert log: ${error.message}`);
  const failing = new Set(data.map((r) => r.key));
  const issues: string[] = [];
  if (failing.has("job:callyzer-sync") || failing.has("job:sweep")) {
    const last = lastPhoneCallAt ? ` (the last one arrived ${shortDay(lastPhoneCallAt.slice(0, 10))}, ${clock12(lastPhoneCallAt)})` : "";
    issues.push(`Callyzer isn't sending new phone calls${last}, so the phone numbers here may be incomplete. Check the Callyzer subscription.`);
  }
  if (failing.has("job:tldv-sync") || failing.has("job:tldv-recent")) issues.push("Meetings couldn't be collected from tl;dv; some may be missing.");
  // Calls on paused phones wait forever by design, so only the active team's count.
  const waiting = calls.filter((c) => activeIds.has(c.personId) && (c.inProgress === "scoring" || c.inProgress === "transcription" || c.inProgress === "transcription_failed")).length;
  if (waiting) issues.push(`${waiting} call${waiting === 1 ? " is" : "s are"} still being scored and will show in the app once done.`);
  return issues;
}

/**
 * The one daily email: everything from `day` in a single email to `recipients` (all on one To line),
 * once. On Mondays it carries last week's roll-up and on the 1st last month's.
 */
export async function sendDailyEmail(day: string, recipients: string[], { preview = false } = {}): Promise<SendResult> {
  const db = supabaseAdmin();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
  const today = toIst(new Date().toISOString()).slice(0, 10);
  const [todayFrom, todayTo] = istDayRange(today);
  const [people, calls, previousCalls, sheets, followUps, toReview, disputes, bookings, lastPhone] = await Promise.all([
    pipelineReads.people(),
    pipelineReads.calls(day),
    pipelineReads.calls(addDays(day, -1)),
    pipelineReads.activeSheets(),
    pipelineReads.followUps(today),
    pipelineReads.secondOpinionFlags(),
    pipelineReads.openDisputes(),
    db.from("meeting_bookings").select("starts_at, client_name, lead_id, consultant_id").eq("status", "booked").gte("starts_at", todayFrom).lt("starts_at", todayTo).order("starts_at"),
    db.from("calls").select("started_at").eq("source", "callyzer").order("started_at", { ascending: false }).limit(1),
  ]);
  if (bookings.error) throw new Error(`bookings: ${bookings.error.message}`);
  if (lastPhone.error) throw new Error(`last phone call: ${lastPhone.error.message}`);
  if (!preview) await alertUnscored(day, calls);

  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
  const brief = (leadId: string | null) => (leadId ? `${site}/leads/${leadId}/brief` : null);
  // Booked in the app (in time order), then meetings fixed on a first call for today that weren't booked.
  const meetingsToday: TodayMeeting[] = [
    ...bookings.data.map((b) => ({ time: clock12(toIst(b.starts_at)), client: b.client_name, host: nameOf(b.consultant_id), link: brief(b.lead_id) })),
    ...followUps.meetings
      .filter((m) => m.date === today && !bookings.data.some((b) => b.lead_id === m.leadId))
      .map((m) => ({ time: timeIn(m.when), client: m.name, host: nameOf(m.personId), link: brief(m.leadId) })),
  ];

  const rollups: Rollup[] = [];
  const periods: Period[] = [];
  if (new Date(`${today}T00:00:00Z`).getUTCDay() === 1) periods.push(weekPeriod(addDays(today, -7)));
  if (today.endsWith("-01")) periods.push(monthPeriod(addDays(today, -1).slice(0, 7)));
  for (const period of periods) {
    const [now, before] = await Promise.all([pipelineReads.callsBetween(period.from, period.to), pipelineReads.callsBetween(period.previous.from, period.previous.to)]);
    rollups.push(rollup(period, people, now, before, sheets.questions));
  }

  const lastPhoneCallAt = lastPhone.data[0] ? toIst(lastPhone.data[0].started_at) : null;
  const email = dailyEmail({
    day,
    today,
    siteUrl: site,
    people,
    calls,
    previousCalls,
    questions: sheets.questions,
    followUps,
    toReview,
    disputes,
    meetingsToday,
    rollups,
    lastPhoneCallAt,
    dataIssues: await dataIssues(calls, new Set(people.map((p) => p.id)), lastPhoneCallAt),
  });

  const result: SendResult = { day, sent: [], skipped: [], ...(preview ? { preview: [email] } : {}) };
  if (preview) return result;
  const to = recipients.join(", ");
  const { data: sent, error } = await db.from("report_sends").select("recipient").eq("report_date", day).eq("kind", "team").eq("subject_key", "daily").eq("recipient", to);
  if (error) throw new Error(`report sends: ${error.message}`);
  if (sent.length) return { ...result, skipped: [{ kind: "team", who: to, why: "already sent" }] };
  await sendEmail(to, email);
  const { error: logError } = await db.from("report_sends").insert({ report_date: day, kind: "team", subject_key: "daily", recipient: to });
  if (logError) throw new Error(`record send: ${logError.message}`);
  result.sent.push({ kind: "team", subject: email.subject, to });
  return result;
}

/**
 * Emails the weekly or monthly roll-up: the team version to founders, managers and admins, and
 * each person's own. Same once-only rule and test inbox as the daily emails.
 */
export async function sendRollups(period: Period, { preview = false, limit = Infinity } = {}): Promise<SendResult> {
  if (await dailyEmailTo()) return { day: period.from, sent: [], skipped: [{ kind: "team", who: "everyone", why: "one daily email is on: the roll-up is inside the 8 am email" }] };
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
  // With one daily email, missed calls are listed in the 8 am email instead.
  if (await dailyEmailTo()) return { sent: [], skipped: [{ person: "everyone", why: "one daily email is on: missed calls are in the 8 am email" }] };
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
