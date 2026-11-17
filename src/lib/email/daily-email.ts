// The one daily email (Team members page, "One daily email"): yesterday's phone calls and Google
// Meet meetings, what needs a founder today and today's meetings, in plain words, at 8 am. While
// it's on, no other report email goes out. Pure, like the other emails.

import type { CallRecord, Person } from "@/lib/data/types";
import { relativeDay, type FollowUps } from "@/lib/follow-ups";
import { formatDuration, secondsFrom } from "@/lib/format";
import { personDayReport } from "@/lib/reports";
import { FUNNEL_STAGES, pctOf, type Rollup } from "@/lib/rollups";
import type { SheetQuestion } from "@/lib/scoring/call-sheets";
import type { Band } from "@/lib/scoring/compute";
import { BAND, bandHtml, bandText, esc, H2, layout, MUTED, P, shortDay, type Email } from "./report-emails";

/** A meeting on today's calendar: booked in the app, or fixed on a first call. */
export interface TodayMeeting {
  /** "11:30 am", or null when no time was given. */
  time: string | null;
  client: string;
  host: string | null;
  link: string | null;
}

export interface DailyEmailInput {
  /** The day the email reports on (yesterday). */
  day: string;
  /** The day it goes out. */
  today: string;
  siteUrl: string;
  people: Person[];
  /** All of the day's calls: phone calls (Callyzer) and meetings (tl;dv). */
  calls: CallRecord[];
  /** The day before, for the change in the team's score. */
  previousCalls: CallRecord[];
  questions: SheetQuestion[];
  followUps: FollowUps;
  /** Calls where a second scoring disagreed with the first. */
  toReview: CallRecord[];
  /** Scores the team disputed that no founder has answered. */
  disputes: CallRecord[];
  meetingsToday: TodayMeeting[];
  /** The weekly roll-up on Mondays, the monthly one on the 1st. */
  rollups: Rollup[];
  /** IST timestamp of the latest phone call received from Callyzer. */
  lastPhoneCallAt: string | null;
  /** Plain sentences on anything missing, e.g. Callyzer not sending calls. */
  dataIssues: string[];
}

// Hard fails in the founders' words, not the scorecard's.
const PLAIN_HARD_FAIL: Record<string, string> = {
  fee_or_package_quoted: "quoted a fee or package on the first call",
  no_cta_when_engaged: "ended without a next step though the client was interested",
  noise_made_client_repeat: "background noise made the client repeat themselves",
  rude_or_dismissive: "was rude or dismissive",
  fee_before_vision_stage2: "talked fees before understanding a big client's plan and numbers",
  partner_pitched: "pitched a partner company",
  proposal_without_date: "promised a proposal without a date",
  client_talk_under_35: "the client spoke less than 35% of the time",
};
export const plainHardFail = (id: string) => PLAIN_HARD_FAIL[id] ?? id.replaceAll("_", " ");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Feedback lines end with a full stop; drop it where the email adds its own. */
const clause = (text: string) => text.trim().replace(/[.!]+$/, "");
/** "2026-11-12T20:07:00+05:30" -> "8:07 pm", easier to read than the 24-hour clock. */
export function clock12(iso: string): string {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
const average = (calls: CallRecord[]): number | null => {
  const scores = calls.flatMap((c) => (c.final ? [c.final.score] : []));
  return scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null;
};
const bandOf = (score: number | null): Band | null => (score === null ? null : score >= 80 ? "green" : score >= 60 ? "amber" : "red");
const byScore = (a: CallRecord, b: CallRecord) => a.final!.score - b.final!.score;

const LINK = "color:#c23b2f";
const link = (href: string, text: string) => `<a href="${esc(href)}" style="${LINK}">${esc(text)}</a>`;
const section = (title: string, body: string) => `<h2 style="${H2}">${esc(title)}</h2>${body}`;
const list = (items: string[], ordered = false) =>
  `<${ordered ? "ol" : "ul"} style="padding-left:18px;margin:0">${items.map((i) => `<li style="margin-bottom:6px">${i}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;
const STAT = "display:inline-block;margin:0 6px 6px 0;padding:6px 10px;background:#f4f3ef;border-radius:8px";
const stat = (label: string, value: string) => `<span style="${STAT}"><span style="font-size:12px;${MUTED}">${esc(label)}</span><br><b style="font-size:16px">${value}</b></span>`;

function changeWords(change: number | null): string {
  if (change === null || change === 0) return "";
  return `, ${change > 0 ? "up" : "down"} ${Math.abs(change)} from the day before`;
}
function changeHtml(change: number | null): string {
  if (change === null || change === 0) return "";
  return ` <span style="color:${change > 0 ? "#0ca30c" : "#d03b3b"};font-size:12px">${change > 0 ? "▲" : "▼"} ${Math.abs(change)}</span>`;
}

/** Why a call is weak, in one line: its automatic Red, else its first fix. */
const whyWeak = (c: CallRecord) => clause(c.final!.hardFails.length ? plainHardFail(c.final!.hardFails[0]) : (c.result?.feedback.fixes[0]?.text ?? "below 60"));
/** The call page, cued to the moment the fix quotes. */
function momentLink(siteUrl: string, c: CallRecord): { href: string; at: string | null } {
  const at = c.result?.feedback.fixes[0]?.evidence.at ?? null;
  const sec = at ? secondsFrom(at) : NaN;
  return { href: `${siteUrl}/calls/${c.id}${Number.isFinite(sec) ? `?t=${sec}` : ""}`, at: Number.isFinite(sec) ? at : null };
}

export function dailyEmail(input: DailyEmailInput): Email {
  const { day, today, siteUrl, people, calls, followUps: f } = input;
  const when = shortDay(day);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "A phone not on the team list";

  const phone = calls.filter((c) => c.stream === "first_call");
  const meetings = calls.filter((c) => c.stream === "vision_call").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const scored = phone.filter((c) => c.final).sort(byScore);
  const connected = phone.filter((c) => c.durationSec > 0).length;
  const teamAverage = average(scored);
  const previous = average(input.previousCalls.filter((c) => c.stream === "first_call"));
  const change = teamAverage !== null && previous !== null ? Math.round((teamAverage - previous) * 10) / 10 : null;
  const reds = scored.filter((c) => c.final!.band === "red");
  const best = [...scored].reverse().find((c) => c.final!.band !== "red") ?? null;
  const worst = scored.find((c) => c.final!.band !== "green" && c !== best) ?? null;

  const dueCallBacks = f.callBacks.filter((c) => !c.date || c.date <= today);
  const needs: string[] = [];
  if (f.missed.length) {
    const oldest = f.missed.reduce((o, m) => (m.firstAt < o ? m.firstAt : o), f.missed[0].firstAt);
    const names = f.missed.slice(0, 3).map((m) => m.name);
    needs.push(
      `<b>${plural(f.missed.length, "missed client call")} not returned yet</b> <span style="${MUTED}">(waiting since ${esc(relativeDay(oldest.slice(0, 10), today) ?? shortDay(oldest.slice(0, 10)))}, ${clock12(oldest)})</span>: ${esc(names.join(", "))}${f.missed.length > 3 ? ` and ${f.missed.length - 3} more` : ""} · ${link(`${siteUrl}/follow-ups`, "See them")}`,
    );
  }
  if (dueCallBacks.length) {
    needs.push(`<b>${plural(dueCallBacks.length, "promised call-back")} due</b>: ${esc(dueCallBacks.slice(0, 3).map((c) => `${c.name} (${nameOf(c.personId)})`).join(", "))}${dueCallBacks.length > 3 ? ` and ${dueCallBacks.length - 3} more` : ""}`);
  }
  if (f.toBook.length) {
    needs.push(`<b>${plural(f.toBook.length, "interested lead")} with no meeting fixed</b>: ${esc(f.toBook.slice(0, 3).map((c) => `${c.name}${c.city ? `, ${c.city}` : ""}`).join("; "))}${f.toBook.length > 3 ? ` and ${f.toBook.length - 3} more` : ""}`);
  }
  for (const c of input.disputes) {
    needs.push(`<b>${esc(nameOf(c.personId))} disputes a score</b> on the call with ${esc(c.client.name)} (${bandText(c.final?.score ?? null, c.final?.band ?? null)}): “${esc(c.dispute?.comment ?? "")}” · ${link(`${siteUrl}/calls/${c.id}`, "Decide")}`);
  }
  if (input.toReview.length) {
    needs.push(
      `<b>${plural(input.toReview.length, "call")} where two AI scorings disagree</b>, worth a 2-minute look: ${input.toReview
        .slice(0, 3)
        .map((c) => link(`${siteUrl}/calls/${c.id}`, `${nameOf(c.personId)} with ${c.client.name}`))
        .join(", ")}`,
    );
  }

  // ---- Yesterday in 30 seconds
  const summary: string[] = [];
  if (phone.length === 0 && meetings.length === 0) summary.push("No phone calls or meetings came in yesterday.");
  if (phone.length) {
    summary.push(`${plural(phone.length, "phone call")} (${connected} connected); ${plural(scored.length, "was a sales call", "were sales calls")} long enough to score.`);
    if (teamAverage !== null) summary.push(`The team averaged ${teamAverage} (${BAND[bandOf(teamAverage)!].word})${changeWords(change)}.`);
    if (best) summary.push(`Best call: ${nameOf(best.personId)} with ${best.client.name} (${best.final!.score}).`);
    if (reds.length) summary.push(`${plural(reds.length, "call was", "calls were")} Red; the weakest was ${nameOf(reds[0].personId)}'s call with ${reds[0].client.name}: ${whyWeak(reds[0])}.`);
  }
  if (meetings.length) {
    const dated = meetings.filter((c) => c.result?.stream === "vision_call" && c.result.capture.proposalDate).length;
    summary.push(`${plural(meetings.length, "Google Meet meeting")} recorded${dated ? `; ${dated} ended with a proposal date` : ""}.`);
  }
  summary.push(needs.length ? `${plural(needs.length, "thing needs", "things need")} you today, listed below.` : "Nothing needs you today.");
  if (input.dataIssues.length) summary.push(`Heads-up: ${input.dataIssues[0]}`);

  // ---- Phone calls
  const rows = people
    .map((p) => personDayReport(p, phone, input.questions))
    .filter((r) => r.calls.length > 0)
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const untracked = phone.length - rows.reduce((n, r) => n + r.calls.length, 0);
  const callsTable = rows.length
    ? `<table style="border-collapse:collapse;font-size:13px;width:100%;margin-top:6px"><tr style="${MUTED};text-align:left"><th style="padding:0 8px 4px 0;font-weight:500">Person</th><th style="padding:0 8px 4px;font-weight:500">Calls</th><th style="padding:0 8px 4px;font-weight:500">Score</th><th style="padding:0 0 4px 8px;font-weight:500">One thing to coach</th></tr>${rows
        .map(
          (r) =>
            `<tr style="border-top:1px solid #eeede8"><td style="padding:6px 8px 6px 0;vertical-align:top"><a href="${esc(`${siteUrl}/people/${r.person.id}?day=${day}`)}" style="color:#1c1c1a">${esc(r.person.name)}</a></td><td style="padding:6px 8px;vertical-align:top">${r.scored.length}/${r.calls.length}</td><td style="padding:6px 8px;vertical-align:top;white-space:nowrap">${bandHtml(r.average, r.band)}</td><td style="padding:6px 0 6px 8px;vertical-align:top">${esc(r.tomorrow ?? (r.scored.length ? "Keep it up" : "No sales calls long enough to score"))}</td></tr>`,
        )
        .join("")}</table><p style="margin:4px 0 0;font-size:12px;${MUTED}">Calls: scored of all calls. Short calls, missed calls and calls that weren't about sales aren't scored.${untracked ? ` ${plural(untracked, "call was", "calls were")} on phones that aren't being scored (paused on the Team members page).` : ""}</p>`
    : "";
  const listen: string[] = [];
  if (worst) {
    const m = momentLink(siteUrl, worst);
    listen.push(`${bandHtml(worst.final!.score, worst.final!.band)} · ${esc(nameOf(worst.personId))} with ${esc(worst.client.name)}: ${esc(whyWeak(worst))} · ${link(m.href, m.at ? `Listen at ${m.at}` : "Listen")}`);
  }
  if (best) {
    listen.push(`${bandHtml(best.final!.score, best.final!.band)} · ${esc(nameOf(best.personId))} with ${esc(best.client.name)}: ${esc(best.result?.feedback.strengths[0]?.text ?? "the best call of the day")} · ${link(`${siteUrl}/calls/${best.id}`, "Listen")}`);
  }
  const phoneHtml = phone.length
    ? [
        `<p style="${P}">${stat("Calls", String(phone.length))}${stat("Sales calls scored", String(scored.length))}${stat("Team score", teamAverage === null ? "–" : `${teamAverage}${changeHtml(change)}`)}${stat("Green · Amber · Red", `${scored.filter((c) => c.final!.band === "green").length} · ${scored.filter((c) => c.final!.band === "amber").length} · ${reds.length}`)}</p>`,
        callsTable,
        listen.length ? `<p style="margin:12px 0 4px;font-weight:600">Worth listening to</p>${list(listen)}` : "",
      ].join("")
    : `<p style="${P};${MUTED}">No phone calls came in yesterday.</p>`;

  // ---- Google Meet meetings
  const meetingCard = (c: CallRecord) => {
    const vc = c.result?.stream === "vision_call" ? c.result : null;
    const lines: string[] = [];
    const head = `<b>${esc(c.client.name)}</b> with ${esc(nameOf(c.personId))} · ${formatDuration(c.durationSec)}`;
    if (c.final && vc) {
      const stage = vc.capture.stageRecommendation;
      lines.push(`${bandHtml(c.final.score, c.final.band)}${stage ? ` · ${stage.stage === 1 ? "Stage 1 (smaller project)" : "Stage 2 (bigger project)"}` : ""}`);
      if (c.final.hardFails.length) lines.push(`<span style="color:#d03b3b">Automatic Red:</span> ${esc(c.final.hardFails.map(plainHardFail).join("; "))}`);
      const outcome = [
        vc.capture.proposalDate && `proposal by ${shortDay(vc.capture.proposalDate)}`,
        vc.capture.reviewCallDate && `next meeting ${shortDay(vc.capture.reviewCallDate)}`,
        vc.capture.founderRoundTwo && "a founder joins the next meeting",
      ].filter(Boolean);
      lines.push(`<span style="${MUTED}">Agreed:</span> ${esc(outcome.length ? outcome.join(", ") : "no next date fixed")}`);
      if (vc.feedback.strengths[0]) lines.push(`<span style="${MUTED}">Went well:</span> ${esc(vc.feedback.strengths[0].text)}`);
      if (vc.feedback.fixes[0]) lines.push(`<span style="${MUTED}">To fix:</span> ${esc(vc.feedback.fixes[0].text)}`);
      const m = momentLink(siteUrl, c);
      lines.push(`${link(`${siteUrl}/calls/${c.id}`, "Full report")}${m.at ? ` · ${link(m.href, `Watch the moment at ${m.at}`)}` : ""}${c.recordingPageUrl ? ` · ${link(c.recordingPageUrl, "Recording in tl;dv")}` : ""}`);
    } else {
      const status = c.notScored === "under_2_min" ? "Under 2 minutes, so not scored." : c.notScored ? "Not scored." : "Still being scored; the report will be in the app.";
      lines.push(`<span style="${MUTED}">${status}</span>${c.recordingPageUrl ? ` ${link(c.recordingPageUrl, "Recording in tl;dv")}` : ""}`);
    }
    return `<div style="border:1px solid #e5e4df;border-radius:8px;padding:10px 12px;margin:0 0 8px">${head}<br>${lines.join("<br>")}</div>`;
  };
  const meetingsHtml = meetings.length ? meetings.map(meetingCard).join("") : `<p style="${P};${MUTED}">No meetings were recorded yesterday.</p>`;

  // ---- Today's meetings
  const todayHtml = input.meetingsToday.length
    ? list(input.meetingsToday.map((m) => `${m.time ? `<b>${esc(m.time)}</b> · ` : ""}${esc(m.client)}${m.host ? ` with ${esc(m.host)}` : ""}${m.link ? ` · ${link(m.link, "Brief")}` : ""}`))
    : `<p style="${P};${MUTED}">No meetings booked for today.</p>`;

  // ---- Weekly / monthly
  const rollupHtml = input.rollups.map((r) => {
    const top = r.people.filter((p) => p.average !== null).sort((a, b) => b.average! - a.average!).slice(0, 3);
    const fun = r.funnel;
    const items = [
      `Team score ${bandHtml(r.average, r.band)}${r.change === null || r.change === 0 ? "" : ` <span style="${MUTED}">(${r.change > 0 ? "up" : "down"} ${Math.abs(r.change)} vs ${esc(r.period.previous.label)})</span>`} · ${r.scored} of ${r.calls} calls scored`,
      top.length ? `Top: ${top.map((p) => `${esc(p.person.name)} ${p.average}`).join(" · ")}` : "",
      fun.leads ? `Leads: ${fun.calls} calls → ${fun.connected} connected → ${fun.leads} leads → ${FUNNEL_STAGES.map((s) => `${fun[s.key]} ${s.label.toLowerCase()}`).join(" → ")} <span style="${MUTED}">(${pctOf(fun.won, fun.leads)}% won)</span>` : "",
      r.hardFails[0] ? `Most common automatic Red: ${esc(plainHardFail(r.hardFails[0].id))} <span style="${MUTED}">(${r.hardFails[0].count}×)</span>` : "",
      r.callOfPeriod ? `Call of the ${r.period.kind}: ${link(`${siteUrl}/examples/call/${r.callOfPeriod.id}`, `${nameOf(r.callOfPeriod.personId)} with ${r.callOfPeriod.client.name}`)}` : "",
    ].filter(Boolean);
    return section(`${r.period.kind === "week" ? "Last week" : "Last month"} · ${r.period.label.replace(/^Week of /, "")}`, list(items) + `<p style="margin:6px 0 0">${link(`${siteUrl}/rollups?${r.period.query}`, "Open the roll-up")}</p>`);
  });

  // ---- Footer: how to read it, and whether anything is missing
  const dataCheck = [
    input.lastPhoneCallAt ? `Last phone call received: ${shortDay(input.lastPhoneCallAt.slice(0, 10))}, ${clock12(input.lastPhoneCallAt)}.` : "No phone calls received yet.",
    `${plural(meetings.length, "meeting")} recorded yesterday.`,
    ...input.dataIssues,
  ];
  const footer = `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e4df;font-size:12px;${MUTED}"><p style="margin:0 0 6px"><b>How to read scores:</b> <span style="color:${BAND.green.colour}">●</span> Green 80+ is good · <span style="color:${BAND.amber.colour}">▲</span> Amber 60–79 needs coaching · <span style="color:${BAND.red.colour}">■</span> Red under 60 needs a founder's look. A call is Red automatically for a serious slip, such as quoting a fee on a first call or a client speaking less than 35% of a meeting.</p><p style="margin:0"><b>Data check:</b> ${esc(dataCheck.join(" "))}</p></div>`;

  const body = [
    `<div style="background:#f4f3ef;border-radius:8px;padding:12px 14px;margin:0 0 8px"><p style="margin:0 0 4px;font-weight:600">Yesterday in 30 seconds</p><p style="margin:0">${esc(summary.join(" "))}</p></div>`,
    section("Phone calls", phoneHtml),
    section("Google Meet meetings", meetingsHtml),
    section("Needs you today", needs.length ? list(needs, true) : `<p style="${P};${MUTED}">Nothing needs you today.</p>`),
    section("Today's meetings", todayHtml),
    ...rollupHtml,
    footer,
  ].join("\n");

  const quiet = phone.length === 0 && meetings.length === 0;
  const subject = quiet
    ? `Sales QA, ${when}: no calls yesterday${needs.length ? ` · ${plural(needs.length, "thing needs", "things need")} you` : ""}`
    : `Sales QA, ${when}: ${plural(phone.length, "phone call")}, ${plural(meetings.length, "meeting")}${teamAverage !== null ? ` · team ${bandText(teamAverage, bandOf(teamAverage))}` : ""}${needs.length ? ` · ${needs.length} need you` : ""}`;

  const text = [
    `Sales QA for ${when}`,
    summary.join(" "),
    ...rows.map((r) => `${r.person.name}: ${r.scored.length}/${r.calls.length} scored, ${bandText(r.average, r.band)}${r.tomorrow ? `. Coach: ${r.tomorrow}` : ""}`),
    ...meetings.map((c) => `Meeting: ${c.client.name} with ${nameOf(c.personId)}, ${bandText(c.final?.score ?? null, c.final?.band ?? null)} (${siteUrl}/calls/${c.id})`),
    ...input.meetingsToday.map((m) => `Today: ${m.time ?? ""} ${m.client}${m.host ? ` with ${m.host}` : ""}`.trim()),
    `Data check: ${dataCheck.join(" ")}`,
    `Open the app: ${siteUrl}/?day=${day}`,
  ].join("\n");

  return { subject, html: layout(`Sales QA · ${when}`, body, { href: `${siteUrl}/?day=${day}`, label: "Open the app" }), text };
}
