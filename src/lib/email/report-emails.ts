// The 8 am emails (brief section 6): each person's QA report and the founders' team summary.
// Pure: built from the same report objects as the screens, so the email and the page agree.
// Inline styles only, since email clients ignore stylesheets.

import type { CallRecord } from "@/lib/data/types";
import { followUpCount, relativeDay, type FollowUps, type MissedItem } from "@/lib/follow-ups";
import { formatClock, formatDay, formatDuration, formatPhone, hardFailLabel } from "@/lib/format";
import type { PersonDayReport, TeamSummary } from "@/lib/reports";
import { FUNNEL_STAGES, pctOf, type Funnel, type PersonRollup, type Rollup } from "@/lib/rollups";
import type { Band } from "@/lib/scoring/compute";
import type { Briefing } from "@/lib/briefing";
import { dayName, message, timeIn, whatsappLink } from "@/lib/whatsapp";
import { EMAIL_LOGO } from "./email-logo";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2026-10-23" -> "Fri 23 Oct" */
function shortDay(day: string): string {
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${formatDay(day).replace(/ \d{4}$/, "")}`;
}

// Shape and word, never colour alone (brief: status colours ship with an icon and a label).
const BAND: Record<Band, { mark: string; word: string; colour: string }> = {
  green: { mark: "●", word: "Green", colour: "#0ca30c" },
  amber: { mark: "▲", word: "Amber", colour: "#b97f00" },
  red: { mark: "■", word: "Red", colour: "#d03b3b" },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function bandHtml(score: number | null, band: Band | null): string {
  if (score === null || !band) return `<span style="color:#6b6b65">not scored</span>`;
  const b = BAND[band];
  return `<b>${score}</b> <span style="color:${b.colour}">${b.mark}</span> ${b.word}`;
}
const bandText = (score: number | null, band: Band | null) => (score === null || !band ? "not scored" : `${score} ${BAND[band].word}`);

const P = "margin:0 0 12px";
const H2 = "font-size:15px;margin:24px 0 8px";
const MUTED = "color:#6b6b65";
const QUOTE = "margin:4px 0 0;padding-left:10px;border-left:3px solid #e5e4df;color:#3d3d39;font-style:italic";

function layout(title: string, body: string, footerLink: { href: string; label: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="margin:0;padding:24px 16px;background:#fcfcfb;color:#1c1c1a;font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e4df;border-radius:12px;padding:24px">
<img src="cid:${EMAIL_LOGO.cid}" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="DNY Sales Agent" style="display:block;border:0;margin:0 0 18px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${body}
<p style="margin:24px 0 0"><a href="${esc(footerLink.href)}" style="color:#c23b2f;font-weight:600">${esc(footerLink.label)}</a></p>
</div>
<p style="max-width:600px;margin:12px auto 0;font-size:12px;${MUTED}">Scored by DNY's QA agent against the call sheets and the scoring brief. Every finding quotes the call; open a call to listen to the moment.</p>
</body></html>`;
}

/** The images an email shows inline: the logo at the top, when the email has it. */
export function inlineImages(email: Email): { filename: string; content: Buffer; cid: string; contentDisposition: "inline" }[] {
  if (!email.html.includes(`cid:${EMAIL_LOGO.cid}`)) return [];
  return [{ filename: "dny-sales-agent.png", content: Buffer.from(EMAIL_LOGO.png, "base64"), cid: EMAIL_LOGO.cid, contentDisposition: "inline" }];
}

function quoteHtml(e: { quote: string; at: string }) {
  return `<p style="${QUOTE}">${esc(e.at)} “${esc(e.quote)}”</p>`;
}

const when = (iso: string, today: string) => `${relativeDay(iso.slice(0, 10), today) ?? shortDay(iso.slice(0, 10))} ${formatClock(iso)}`;
const listItem = (html: string) => `<li style="margin-bottom:4px">${html}</li>`;
const MAX_ITEMS = 6;

/** The name saved for a missed caller, or null when Callyzer only has the number. */
const savedName = (m: MissedItem) => (m.name === formatPhone(m.phone) ? null : m.name);

/** "Mohit · +91 98000 00001" with the number tap-to-call, or just the number. */
function callerHtml(m: MissedItem, siteUrl: string): string {
  const name = savedName(m);
  const nameHtml = name ? (m.leadId ? `<a href="${esc(`${siteUrl}/leads/${m.leadId}`)}" style="color:#1c1c1a">${esc(name)}</a> · ` : `${esc(name)} · `) : "";
  return `${nameHtml}<a href="tel:${esc(m.phone)}" style="color:#1c1c1a">${esc(formatPhone(m.phone))}</a>${whatsappHtml(m.phone, message.missedCall())}`;
}

/** " · WhatsApp", a link that opens WhatsApp with the message ready; nothing for a number that can't be messaged. */
function whatsappHtml(phone: string | null | undefined, text: string): string {
  const href = whatsappLink(phone, text);
  return href ? ` · <a href="${esc(href)}" style="color:#1c1c1a">WhatsApp</a>` : "";
}

/** The 8 am email's "today's follow-ups": missed calls, call-backs, meetings, leads to book. */
function followUpsHtml(f: FollowUps, today: string, siteUrl: string): string {
  if (followUpCount(f) === 0) return "";
  const more = (n: number) => (n > MAX_ITEMS ? listItem(`<span style="${MUTED}">and ${n - MAX_ITEMS} more</span>`) : "");
  const group = (title: string, items: string[]) =>
    items.length ? `<p style="margin:12px 0 4px;font-weight:600">${title}</p><ul style="padding-left:18px;margin:0">${items.slice(0, MAX_ITEMS).join("")}${more(items.length)}</ul>` : "";
  const leadLink = (leadId: string, name: string) => `<a href="${esc(`${siteUrl}/leads/${leadId}`)}" style="color:#1c1c1a">${esc(name)}</a>`;
  const day = (date: string | null) => (date ? (relativeDay(date, today) ?? shortDay(date)) : "no date");
  return [
    `<h2 style="${H2}">Today's follow-ups</h2>`,
    group(
      "Missed calls to return",
      f.missed.map((m) => listItem(`${callerHtml(m, siteUrl)} <span style="${MUTED}">· missed ${m.count === 1 ? "" : `${m.count}× · `}since ${when(m.firstAt, today)}</span>`)),
    ),
    group(
      "Call-backs promised",
      f.callBacks.map((c) => listItem(`${leadLink(c.leadId, c.name)} · ${esc(c.when ?? "")} <span style="${MUTED}">· ${day(c.date)}</span>${whatsappHtml(c.phone, message.callBack(c.name, c.when))}`)),
    ),
    group("Meetings coming up", f.meetings.map((c) => listItem(`${leadLink(c.leadId, c.name)} · ${esc(c.when ?? "")}${whatsappHtml(c.phone, message.meeting(c.name, c.date, c.when))}`))),
    group(
      "Hot and warm leads with no meeting yet",
      f.toBook.map((c) => listItem(`${leadLink(c.leadId, c.name)}${c.city ? ` · ${esc(c.city)}` : ""} <span style="${MUTED}">· ${c.quality ?? ""}</span>${whatsappHtml(c.phone, message.bookMeeting(c.name))}`)),
    ),
    `<p style="margin:8px 0 0"><a href="${esc(`${siteUrl}/follow-ups`)}" style="color:#c23b2f">All follow-ups</a></p>`,
  ].join("");
}

export interface FocusLine {
  label: string;
  /** "asked" for a question, "Met" for an area. */
  verb: string;
  yesterday: { hit: number; total: number };
  since: { hit: number; total: number };
  setDay: string;
}

export function personReportEmail(report: PersonDayReport, day: string, siteUrl: string, followUps?: { items: FollowUps; today: string }, focus?: FocusLine): Email {
  const { person } = report;
  const when = shortDay(day);
  const link = (path: string) => `${siteUrl}${path}`;
  const scoredLine = `${report.scored.length} of ${report.calls.length} calls scored`;
  const subject =
    report.average !== null && report.band
      ? `Call QA, ${when}: ${bandText(report.average, report.band)} · ${scoredLine}`
      : `Call QA, ${when}: ${report.calls.length} calls logged, none scored`;

  const stats = [
    `Average ${bandHtml(report.average, report.band)}`,
    esc(scoredLine),
    report.hardFailCalls ? `<b>${report.hardFailCalls} with a hard fail</b>` : "no hard fails",
    `${report.totalMinutes} min on calls`,
    ...report.conversion.map((c) => `${esc(c.label)}: ${esc(c.value)}`),
  ];

  const strengths = report.strengths.map((s) => `<li style="margin-bottom:8px">${esc(s.text)}${quoteHtml(s.evidence)}</li>`).join("");
  const fixes = report.fixes
    .map(
      (f) =>
        `<li style="margin-bottom:10px">${esc(f.text)}${quoteHtml(f.evidence)}<p style="margin:6px 0 0;background:#f4f3ef;padding:6px 10px;border-radius:6px"><span style="${MUTED}">Better line:</span> ${esc(f.betterLine)}</p></li>`,
    )
    .join("");
  // The scored calls, in order; the rest (short, not sales, missing) are summed up in one line.
  const scoredInOrder = [...report.scored].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const calls = scoredInOrder
    .map(
      (c) =>
        `<tr><td style="padding:4px 8px 4px 0"><a href="${esc(link(`/calls/${c.id}`))}" style="color:#1c1c1a">${formatClock(c.startedAt)}</a></td><td style="padding:4px 8px">${esc(c.client.name)}</td><td style="padding:4px 8px;text-align:right">${formatDuration(c.durationSec)}</td><td style="padding:4px 0 4px 8px">${bandHtml(c.final!.score, c.final!.band)}${c.final!.hardFails.length ? ` <span style="${MUTED}">(hard fail)</span>` : ""}</td></tr>`,
    )
    .join("");
  const others = report.calls.length - report.scored.length;
  const othersLine = others
    ? `<p style="margin:8px 0 0;${MUTED}">${others} other call${others === 1 ? "" : "s"} not scored (under 2 minutes, not a sales call, waiting, or recording missing${report.notRecorded ? `: ${report.notRecorded} missing` : ""}). <a href="${esc(link(`/calls?day=${day}`))}" style="color:#c23b2f">See them all</a></p>`
    : "";

  const focusHtml = focus
    ? `<div style="margin:0 0 12px;padding:10px 12px;border:1px solid #e5e4df;border-radius:8px"><p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#c23b2f">Your coaching focus</p><p style="margin:4px 0 0;font-weight:600">${esc(focus.label)}</p><p style="margin:4px 0 0;${MUTED}">Yesterday ${focus.verb} on ${focus.yesterday.hit} of ${focus.yesterday.total} scored call${focus.yesterday.total === 1 ? "" : "s"} · since ${esc(shortDay(focus.setDay))}: ${focus.since.hit} of ${focus.since.total}</p></div>`
    : "";
  const body = [
    `<p style="${P}">${stats.join(" · ")}</p>`,
    focusHtml,
    strengths && `<h2 style="${H2}">What went well</h2><ul style="padding-left:18px;margin:0">${strengths}</ul>`,
    fixes && `<h2 style="${H2}">Fix next</h2><ul style="padding-left:18px;margin:0">${fixes}</ul>`,
    report.tomorrow && `<h2 style="${H2}">Tomorrow's one thing</h2><p style="${P}">${esc(report.tomorrow)}</p>`,
    followUps && followUpsHtml(followUps.items, followUps.today, siteUrl),
    (calls || othersLine) &&
      `<h2 style="${H2}">Scored calls</h2>${calls ? `<table style="border-collapse:collapse;font-size:13px">${calls}</table>` : ""}${othersLine}`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    `${person.name}: call QA for ${when}`,
    `Average ${bandText(report.average, report.band)} · ${scoredLine} · ${report.hardFailCalls} with a hard fail`,
    ...report.fixes.map((f) => `Fix: ${f.text} (${f.evidence.at} "${f.evidence.quote}") Better line: ${f.betterLine}`),
    report.tomorrow ? `Tomorrow: ${report.tomorrow}` : "",
    focus ? `Focus: ${focus.label} (yesterday ${focus.verb} on ${focus.yesterday.hit} of ${focus.yesterday.total}; since ${focus.setDay}: ${focus.since.hit} of ${focus.since.total})` : "",
    followUps && followUpCount(followUps.items)
      ? `Follow-ups: ${followUps.items.missed.length} missed calls to return, ${followUps.items.callBacks.length} call-backs, ${followUps.items.meetings.length} meetings, ${followUps.items.toBook.length} leads to book (${link("/follow-ups")})`
      : "",
    `Full report: ${link(`/people/${person.id}?day=${day}`)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html: layout(`${person.name} · ${when}`, body, { href: link(`/people/${person.id}?day=${day}`), label: "Open the full report" }),
    text,
  };
}

export function teamSummaryEmail(
  summary: TeamSummary,
  day: string,
  siteUrl: string,
  followUps?: FollowUps,
  toReview: CallRecord[] = [],
  meetingsToday: Briefing[] = [],
): Email {
  const when = shortDay(day);
  const link = (path: string) => `${siteUrl}${path}`;
  const scored = summary.rows.flatMap((r) => r.report.scored);
  const scores = scored.map((c) => c.final!.score);
  const average = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null;
  const teamBand: Band | null = average === null ? null : average >= 80 ? "green" : average >= 60 ? "amber" : "red";
  const hardFails = scored.filter((c) => c.final!.hardFails.length > 0).length;
  const subject =
    average !== null
      ? `Team call QA, ${when}: average ${bandText(average, teamBand)} · ${scored.length} scored, ${hardFails} hard fail${hardFails === 1 ? "" : "s"}`
      : `Team call QA, ${when}: nothing scored`;

  const rows = summary.rows
    .filter((r) => r.report.calls.length > 0)
    .map(
      ({ report: r }) =>
        `<tr><td style="padding:6px 8px 6px 0"><a href="${esc(link(`/people/${r.person.id}?day=${day}`))}" style="color:#1c1c1a">${esc(r.person.name)}</a></td><td style="padding:6px 8px;text-align:right">${r.scored.length}/${r.calls.length}</td><td style="padding:6px 8px">${bandHtml(r.average, r.band)}</td><td style="padding:6px 8px;text-align:right">${r.hardFailCalls}</td><td style="padding:6px 0 6px 8px">${esc(r.conversion.find((c) => c.label === "VCs booked")?.value ?? "–")}</td></tr>`,
    )
    .join("");
  const nameOf = (call: CallRecord) => summary.rows.find((r) => r.report.person.id === call.personId)?.report.person.name ?? "Unknown";
  const red = summary.redCalls
    .map((c) => {
      const why = c.final!.hardFails.length ? c.final!.hardFails.map((id) => hardFailLabel(c.stream, id)).join("; ") : "below 60";
      return `<li style="margin-bottom:6px"><a href="${esc(link(`/calls/${c.id}`))}" style="color:#1c1c1a">${esc(nameOf(c))} · ${formatClock(c.startedAt)} · ${esc(c.client.name)}</a> · ${bandHtml(c.final!.score, c.final!.band)} <span style="${MUTED}">(${esc(why)})</span></li>`;
    })
    .join("");
  // Calls where a second, independent scoring disagreed with the first: a founder's look settles them.
  const secondLook = toReview
    .filter((c) => c.secondOpinion && c.final)
    .map(
      (c) =>
        `<li style="margin-bottom:6px"><a href="${esc(link(`/calls/${c.id}`))}" style="color:#1c1c1a">${esc(nameOf(c))} · ${esc(shortDay(c.startedAt.slice(0, 10)))} ${formatClock(c.startedAt)} · ${esc(c.client.name)}</a> · ${bandHtml(c.final!.score, c.final!.band)} <span style="${MUTED}">then</span> ${bandHtml(c.secondOpinion!.score, c.secondOpinion!.band)}</li>`,
    )
    .join("");
  const missed = new Map<string, { question: string; count: number }>();
  for (const { report } of summary.rows) {
    for (const m of report.missedQuestions) missed.set(m.id, { question: m.question, count: (missed.get(m.id)?.count ?? 0) + m.count });
  }
  const topMissed = [...missed.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  const body = [
    `<p style="${P}">Team average ${bandHtml(average, teamBand)} · ${scored.length} calls scored · ${hardFails} with a hard fail · VCs booked: ${summary.vcsBooked} from ${summary.firstCalls} scored first calls${summary.firstCalls ? ` · client told the call is recorded on ${summary.consentStated} of ${summary.firstCalls}` : ""}</p>`,
    rows &&
      `<h2 style="${H2}">People</h2><table style="border-collapse:collapse;font-size:13px"><tr style="${MUTED};text-align:left"><th style="padding:0 8px 4px 0;font-weight:500">Person</th><th style="padding:0 8px 4px;font-weight:500">Scored</th><th style="padding:0 8px 4px;font-weight:500">Average</th><th style="padding:0 8px 4px;font-weight:500">Hard fails</th><th style="padding:0 0 4px 8px;font-weight:500">VCs booked</th></tr>${rows}</table>`,
    red && `<h2 style="${H2}">Red calls to review in stand-up</h2><ul style="padding-left:18px;margin:0">${red}</ul>`,
    meetingsToday.length > 0 &&
      `<h2 style="${H2}">Vision calls today</h2><ul style="padding-left:18px;margin:0">${meetingsToday
        .map((b) => listItem(`${esc(b.name)}${meetingTime(b) ? ` · ${esc(meetingTime(b)!)}` : ""} <span style="${MUTED}">· ${esc(b.stage.label)}</span> · <a href="${esc(link(`/leads/${b.leadId}/brief`))}" style="color:#c23b2f">Brief</a>`))
        .join("")}</ul>`,
    secondLook &&
      `<h2 style="${H2}">Worth a founder's look</h2><p style="${P};${MUTED}">A second, independent scoring disagreed with the first. Agree or correct on the call page.</p><ul style="padding-left:18px;margin:0">${secondLook}</ul>`,
    followUps &&
      followUpCount(followUps) > 0 &&
      `<h2 style="${H2}">Open follow-ups</h2><p style="${P}">${followUps.missed.length} missed call${followUps.missed.length === 1 ? "" : "s"} not returned · ${followUps.callBacks.length} call-back${followUps.callBacks.length === 1 ? "" : "s"} promised · ${followUps.meetings.length} meeting${followUps.meetings.length === 1 ? "" : "s"} coming up · ${followUps.toBook.length} hot or warm lead${followUps.toBook.length === 1 ? "" : "s"} with no meeting. <a href="${esc(link("/follow-ups"))}" style="color:#c23b2f">See them</a></p>`,
    topMissed.length &&
      `<h2 style="${H2}">Questions skipped most</h2><ul style="padding-left:18px;margin:0">${topMissed.map((m) => `<li>${esc(m.question)} <span style="${MUTED}">(${m.count} call${m.count === 1 ? "" : "s"})</span></li>`).join("")}</ul>`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    `Team call QA for ${when}`,
    `Average ${bandText(average, teamBand)} · ${scored.length} scored · ${hardFails} with a hard fail`,
    ...(toReview.length ? [`Worth a founder's look (two scorings disagreed): ${toReview.length}`] : []),
    ...summary.rows.filter((r) => r.report.calls.length).map(({ report: r }) => `${r.person.name}: ${r.scored.length}/${r.calls.length} scored, ${bandText(r.average, r.band)}`),
    `Team page: ${link(`/?day=${day}`)}`,
  ].join("\n");

  return { subject, html: layout(`Team summary · ${when}`, body, { href: link(`/?day=${day}`), label: "Open the team page" }), text };
}

// ---------------------------------------------------------------------------
// The consultant's vision-call brief, the morning of the meeting
// ---------------------------------------------------------------------------

const meetingTime = (b: Briefing) => timeIn(b.meeting.when) ?? (b.meeting.date ? null : b.meeting.when);

export function briefingEmail(b: Briefing, siteUrl: string): Email {
  const time = meetingTime(b);
  const when = b.meeting.date ? `${dayName(b.meeting.date)}${time ? `, ${time}` : ""}` : (b.meeting.when ?? "today");
  const brief = `${siteUrl}/leads/${b.leadId}/brief`;
  const confirm = b.meeting.date ? whatsappLink(b.phone, message.meeting(b.name, b.meeting.date, b.meeting.when)) : null;
  const subject = `Vision call today: ${b.name}${time ? `, ${time}` : ""}`;
  const body = [
    `<p style="${P}">Meeting: <b>${esc(when)}</b>${confirm ? ` · <a href="${esc(confirm)}" style="color:#1c1c1a">Confirm on WhatsApp</a>` : ""}</p>`,
    `<h2 style="${H2}">How to run the call</h2><ol style="padding-left:18px;margin:0">${b.reminders.map((r) => listItem(esc(r))).join("")}</ol>`,
    b.known.length &&
      `<h2 style="${H2}">What the first call told us</h2><table style="border-collapse:collapse;font-size:13px">${b.known
        .map(([label, value]) => `<tr><td style="padding:3px 12px 3px 0;vertical-align:top;${MUTED}">${esc(label)}</td><td style="padding:3px 0">${esc(value)}</td></tr>`)
        .join("")}</table>`,
    b.unknown.length && `<p style="margin:8px 0 0;${MUTED}">Not captured yet: ${esc(b.unknown.join(", "))}. Ask these on the call.</p>`,
    `<h2 style="${H2}">Stage and package</h2><p style="${P}"><b>${esc(b.stage.label)}</b> <span style="${MUTED}">· ${esc(b.stage.why)}</span>${b.packageHint ? `<br>Likely package: ${esc(b.packageHint)}` : ""}</p>`,
    b.firstCallGaps.length &&
      `<h2 style="${H2}">What the first call missed</h2><ul style="padding-left:18px;margin:0">${b.firstCallGaps.map((g) => listItem(`${esc(g.question)} <span style="${MUTED}">(${g.status})</span>`)).join("")}</ul>`,
    b.inTheirWords.length &&
      `<h2 style="${H2}">In their words</h2>${b.inTheirWords.map((q) => quoteHtml({ quote: q.quote, at: q.at })).join("")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const text = [
    `Vision call: ${b.name}, ${when}`,
    ...b.reminders.map((r, i) => `${i + 1}. ${r}`),
    `Stage: ${b.stage.label}. ${b.stage.why}`,
    ...(b.packageHint ? [`Likely package: ${b.packageHint}`] : []),
    `The full brief: ${brief}`,
  ].join("\n");
  return { subject, html: layout(`Vision-call brief · ${b.name}`, body, { href: brief, label: "Open the full brief" }), text };
}

// ---------------------------------------------------------------------------
// Weekly and monthly roll-ups
// ---------------------------------------------------------------------------

function changeHtml(value: number | null, against: string): string {
  if (value === null) return "";
  if (value === 0) return ` <span style="${MUTED}">(no change vs ${esc(against)})</span>`;
  return ` <span style="color:${value > 0 ? "#0ca30c" : "#d03b3b"}">${value > 0 ? "▲" : "▼"} ${Math.abs(value)}</span> <span style="${MUTED}">vs ${esc(against)}</span>`;
}
const changeText = (value: number | null, against: string) =>
  value === null ? "" : value === 0 ? ` (no change vs ${against})` : ` (${value > 0 ? "up" : "down"} ${Math.abs(value)} vs ${against})`;

const periodName = (r: { period: { kind: "week" | "month" } }) => (r.period.kind === "week" ? "Weekly" : "Monthly");

/** The team's best call of the period, which anyone on the team can open. */
function callOfPeriodHtml(r: Rollup, siteUrl: string): string {
  const c = r.callOfPeriod;
  if (!c) return "";
  const who = r.people.find((p) => p.person.id === c.personId)?.person.name ?? "A colleague";
  const href = `${siteUrl}/examples/call/${c.id}`;
  return `<h2 style="${H2}">Call of the ${r.period.kind}</h2><p style="${P}"><a href="${esc(href)}" style="color:#1c1c1a">${esc(who)}'s call with ${esc(c.client.name)}</a> · ${esc(shortDay(c.startedAt.slice(0, 10)))} · ${bandHtml(c.final!.score, c.final!.band)}. <a href="${esc(href)}" style="color:#c23b2f">Listen to the whole call</a></p>`;
}

/** The funnel as a table: email clients can't be trusted with charts, so each bar is a sized cell. */
function funnelHtml(f: Funnel): string {
  const rows = FUNNEL_STAGES.map((s) => {
    const n = f[s.key];
    const pct = pctOf(n, f.leads);
    const bar = n > 0 ? `<div style="background:#2a78d6;height:12px;width:${Math.max(2, Math.round(pct * 1.6))}px;border-radius:0 4px 4px 0"></div>` : "";
    return `<tr><td style="padding:4px 12px 4px 0">${s.label}</td><td style="padding:4px 8px;width:160px">${bar}</td><td style="padding:4px 0 4px 8px;text-align:right">${n} <span style="${MUTED}">· ${pct}%</span></td></tr>`;
  }).join("");
  return `<h2 style="${H2}">Lead funnel</h2><p style="${P}">${f.calls} calls logged → ${f.connected} connected → ${f.leads} ${f.leads === 1 ? "lead" : "leads"} reached${f.lost ? ` · ${f.lost} marked lost` : ""}</p><table style="border-collapse:collapse;font-size:13px">${rows}</table>`;
}

export function teamRollupEmail(r: Rollup, siteUrl: string): Email {
  const link = `${siteUrl}/rollups?${r.period.query}`;
  const shortLabel = r.period.label.replace(/^Week of /, "");
  const subject =
    r.average !== null
      ? `${periodName(r)} call QA, ${shortLabel}: average ${bandText(r.average, r.band)}${changeText(r.change, r.period.previous.label)} · ${r.scored} scored`
      : `${periodName(r)} call QA, ${shortLabel}: nothing scored`;
  const rows = r.people
    .map(
      (p, i) =>
        `<tr><td style="padding:6px 8px 6px 0">${i + 1}. ${esc(p.person.name)}</td><td style="padding:6px 8px;text-align:right">${p.scored}/${p.calls}</td><td style="padding:6px 8px">${bandHtml(p.average, p.band)}${changeHtml(p.change, r.period.previous.label)}</td><td style="padding:6px 8px;text-align:right">${p.hardFailCalls}</td><td style="padding:6px 0 6px 8px;text-align:right">${p.vcsBooked}/${p.firstCallsScored}</td></tr>`,
    )
    .join("");
  const body = [
    `<p style="${P}">Team average ${bandHtml(r.average, r.band)}${changeHtml(r.change, r.period.previous.label)} · ${r.scored} of ${r.calls} calls scored · ${r.hardFailCalls} with a hard fail · VCs booked: ${r.vcsBooked} from ${r.firstCallsScored} scored first calls</p>`,
    rows &&
      `<h2 style="${H2}">Leaderboard</h2><table style="border-collapse:collapse;font-size:13px"><tr style="${MUTED};text-align:left"><th style="padding:0 8px 4px 0;font-weight:500">Person</th><th style="padding:0 8px 4px;font-weight:500">Scored</th><th style="padding:0 8px 4px;font-weight:500">Average</th><th style="padding:0 8px 4px;font-weight:500">Hard fails</th><th style="padding:0 0 4px 8px;font-weight:500">VCs booked</th></tr>${rows}</table>`,
    r.funnel.leads > 0 && funnelHtml(r.funnel),
    callOfPeriodHtml(r, siteUrl),
    r.hardFails.length &&
      `<h2 style="${H2}">Hard fails by type</h2><ul style="padding-left:18px;margin:0">${r.hardFails.map((h) => `<li>${esc(h.label)} <span style="${MUTED}">×${h.count}</span></li>`).join("")}</ul>`,
    r.missed.length &&
      `<h2 style="${H2}">Mandatory questions skipped most</h2><ul style="padding-left:18px;margin:0">${r.missed.map((m) => `<li>${esc(m.question)} <span style="${MUTED}">(${m.count} call${m.count === 1 ? "" : "s"})</span></li>`).join("")}</ul>`,
  ]
    .filter(Boolean)
    .join("\n");
  const text = [
    `${periodName(r)} call QA: ${r.period.label}`,
    `Team average ${bandText(r.average, r.band)}${changeText(r.change, r.period.previous.label)} · ${r.scored} scored · ${r.hardFailCalls} with a hard fail`,
    ...r.people.map((p, i) => `${i + 1}. ${p.person.name}: ${bandText(p.average, p.band)}${changeText(p.change, r.period.previous.label)}, ${p.scored}/${p.calls} scored`),
    `Funnel: ${r.funnel.calls} calls, ${r.funnel.connected} connected, ${r.funnel.leads} leads reached, ${FUNNEL_STAGES.map((s) => `${r.funnel[s.key]} ${s.label.toLowerCase()}`).join(", ")}${r.funnel.lost ? `, ${r.funnel.lost} lost` : ""}`,
    `Roll-up: ${link}`,
  ].join("\n");
  return { subject, html: layout(`${periodName(r)} roll-up · ${r.period.label}`, body, { href: link, label: "Open the roll-up" }), text };
}

export function personRollupEmail(p: PersonRollup, r: Rollup, siteUrl: string): Email {
  const link = `${siteUrl}/rollups?${r.period.query}`;
  const shortLabel = r.period.label.replace(/^Week of /, "");
  const yourPeriod = r.period.kind === "week" ? "Your week" : "Your month";
  const subject =
    p.average !== null
      ? `${yourPeriod}, ${shortLabel}: ${bandText(p.average, p.band)}${changeText(p.change, r.period.previous.label)} · ${p.scored} calls scored`
      : `${yourPeriod}, ${shortLabel}: ${p.calls} calls logged, none scored`;
  const callLink = (label: string, c: NonNullable<PersonRollup["best"]>) =>
    `<li><a href="${esc(`${siteUrl}/calls/${c.id}`)}" style="color:#1c1c1a">${label}: ${esc(formatDay(c.startedAt))} ${formatClock(c.startedAt)} · ${esc(c.client.name)}</a> · ${bandHtml(c.final!.score, c.final!.band)}</li>`;
  const body = [
    `<p style="${P}">Average ${bandHtml(p.average, p.band)}${changeHtml(p.change, r.period.previous.label)} · ${p.scored} of ${p.calls} calls scored · ${p.hardFailCalls} with a hard fail · VCs booked: ${p.vcsBooked} of ${p.firstCallsScored}${p.avgClientSharePct === null ? "" : ` · clients talked ${p.avgClientSharePct}% on average`}</p>`,
    callOfPeriodHtml(r, siteUrl),
    (p.best || p.worst) &&
      `<h2 style="${H2}">Listen back</h2><ul style="padding-left:18px;margin:0">${p.best ? callLink("Best call", p.best) : ""}${p.worst ? callLink("Weakest call", p.worst) : ""}</ul>`,
    p.missed.length &&
      `<h2 style="${H2}">Questions you skipped most</h2><ul style="padding-left:18px;margin:0">${p.missed.map((m) => `<li>${esc(m.question)} <span style="${MUTED}">(${m.count} call${m.count === 1 ? "" : "s"})</span></li>`).join("")}</ul>`,
  ]
    .filter(Boolean)
    .join("\n");
  const text = [
    `${p.person.name}: ${r.period.label}`,
    `Average ${bandText(p.average, p.band)}${changeText(p.change, r.period.previous.label)} · ${p.scored}/${p.calls} scored · ${p.hardFailCalls} with a hard fail`,
    ...p.missed.map((m) => `Skipped: ${m.question} (${m.count} call${m.count === 1 ? "" : "s"})`),
    `Roll-up: ${link}`,
  ].join("\n");
  return { subject, html: layout(`${p.person.name} · ${r.period.label}`, body, { href: link, label: "Open the roll-up" }), text };
}

export function disputeEmail(d: { who: string; client: string; when: string; score: number; band: Band; comment: string; link: string }): Email {
  const subject = `${d.who} disputes a score: ${d.client}, ${d.when} (${bandText(d.score, d.band)})`;
  const body = [
    `<p style="${P}">${esc(d.who)} thinks the score on their call with ${esc(d.client)} (${esc(d.when)}) is wrong. The AI gave ${bandHtml(d.score, d.band)}.</p>`,
    `<p style="${P};border-left:3px solid #e5e4df;padding-left:12px">“${esc(d.comment)}”</p>`,
    `<p style="${P}">Agree with the score or correct it on the call page; either answers the dispute.</p>`,
  ].join("\n");
  const text = [`${d.who} disputes the score on their call with ${d.client} (${d.when}): ${bandText(d.score, d.band)}`, `“${d.comment}”`, `Review it: ${d.link}`].join("\n");
  return { subject, html: layout(`Score disputed by ${d.who}`, body, { href: d.link, label: "Review the call" }), text };
}

/** The hourly alert to an executive: clients who called, weren't answered, and are still waiting. */
export function missedCallsEmail(personName: string, items: MissedItem[], today: string, siteUrl: string): Email {
  const n = items.length;
  const subject = `${n} missed call${n === 1 ? "" : "s"} to return`;
  const rows = items
    .map(
      (m) =>
        `<li style="margin-bottom:6px">${callerHtml(m, siteUrl)} <span style="${MUTED}">· missed ${m.count === 1 ? "once" : `${m.count} times`}, first at ${when(m.firstAt, today)}</span></li>`,
    )
    .join("");
  const body = [
    `<p style="${P}">${n === 1 ? "This client" : "These clients"} called, weren't answered, and ${n === 1 ? "hasn't" : "haven't"} been called back for over 2 hours.</p>`,
    `<ul style="padding-left:18px;margin:0">${rows}</ul>`,
    `<p style="margin:12px 0 0;${MUTED}">Calling back clears it. If they were reached another way, mark it handled on the Follow-ups page.</p>`,
  ].join("\n");
  const text = [`${personName}: ${subject}`, ...items.map((m) => `${[savedName(m), formatPhone(m.phone)].filter(Boolean).join(" · ")} · first missed ${when(m.firstAt, today)}`), `Follow-ups: ${siteUrl}/follow-ups`].join("\n");
  return { subject, html: layout(subject, body, { href: `${siteUrl}/follow-ups`, label: "Open follow-ups" }), text };
}
