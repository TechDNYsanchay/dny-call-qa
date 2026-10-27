// Spreadsheet downloads for the Leads, Calls and Follow-ups pages. Reads as the signed-in person,
// so row-level security gives executives only their own leads and calls.

import { connection } from "next/server";
import { BUDGET, CLIENT_TYPE, FORMAT, ROUTE } from "@/lib/capture";
import { csvFilename, toCsv, type Cell } from "@/lib/csv";
import { getCurrentPerson, getFollowUps, LEAD_STATUSES, listCalls, listCallsBetween, listLeads, listPeople } from "@/lib/data";
import { formatClock, formatDuration, formatPhone, hardFailLabel, IN_PROGRESS_LABEL, LEAD_STATUS_LABEL, NOT_SCORED_LABEL, parseDayParam, toIst } from "@/lib/format";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Indian numbers without "+91" (a leading + reads as a formula in Excel); others as they are. */
const phoneCell = (phone: string | null | undefined) => (phone ? formatPhone(phone).replace(/^\+91\s*/, "") : "");
/** A client "name" that is only the number (Callyzer had no name) gets the same treatment. */
const nameCell = (name: string) => name.replace(/^\+91\s*/, "");

function download(kind: string, day: string, header: string[], rows: Cell[][]): Response {
  return new Response(toCsv(header, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(kind, day)}"`,
      "cache-control": "private, no-store",
    },
  });
}

export async function GET(request: Request, ctx: RouteContext<"/api/export/[kind]">) {
  const me = await getCurrentPerson();
  if (!me) return Response.json({ error: "Sign in again to download." }, { status: 401 });
  const { kind } = await ctx.params;
  const params = new URL(request.url).searchParams;
  await connection(); // reads the clock
  const today = toIst(new Date().toISOString()).slice(0, 10);
  const people = await listPeople();
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? (id === me.id ? me.name : "")) : "");

  if (kind === "leads") {
    const status = LEAD_STATUSES.find((s) => s === params.get("status"));
    const quality = params.get("quality");
    const leads = (await listLeads()).filter((l) => (!status || l.status === status) && (!quality || l.capture.leadQuality === quality));
    return download("leads", today, [
      "Client", "Phone", "Email", "City", "Client type", "Format", "Concept", "Project budget", "Timeline", "Partners",
      "Quality", "Status", "Meeting", "Call back", "Suggested route", "Last scored call", "Last score", "Band", "Called by", "Calls",
    ], leads.map((l) => {
      const c = l.capture;
      return [
        c.clientName ?? "", phoneCell(l.phone), l.email ?? c.email ?? "", c.city ?? "",
        c.clientType ? CLIENT_TYPE[c.clientType] : "", c.format ? FORMAT[c.format] : "", c.concept ?? "", c.budgetBand ? BUDGET[c.budgetBand] : "",
        c.timeline ?? "", c.partners ?? "", c.leadQuality ?? "", LEAD_STATUS_LABEL[l.status], c.vcDateTime ?? "", c.callBack?.when ?? "",
        c.suggestedRoute ? (ROUTE[c.suggestedRoute] ?? c.suggestedRoute) : "",
        l.lastCall ? `${l.lastCall.startedAt.slice(0, 10)} ${formatClock(l.lastCall.startedAt)}` : "", l.lastCall?.score ?? "", l.lastCall?.band ?? "",
        nameOf(l.lastCall?.personId ?? null), l.callCount,
      ];
    }));
  }

  if (kind === "calls") {
    // ?day=YYYY-MM-DD, or ?from=&to= for a range (at most 31 days).
    const day = parseDayParam(params.get("day") ?? undefined);
    const from = params.get("from");
    const to = params.get("to");
    let calls;
    let label: string;
    if (from && to && DAY.test(from) && DAY.test(to) && from <= to && Date.parse(to) - Date.parse(from) <= 31 * 86_400_000) {
      calls = await listCallsBetween(from, to);
      label = `${from}-to-${to}`;
    } else {
      label = day ?? today;
      calls = await listCalls(label);
    }
    return download("calls", label, [
      "Date", "Time", "Person", "Client", "Phone", "Direction", "Length", "Result", "Score", "Band", "Hard fails", "Reviewed", "Disputed",
    ], calls.map((c) => [
      c.startedAt.slice(0, 10), formatClock(c.startedAt), nameOf(c.personId), nameCell(c.result?.stream === "first_call" ? (c.result.capture.clientName ?? c.client.name) : c.client.name),
      phoneCell(c.clientPhone), c.direction ?? "", c.durationSec ? formatDuration(c.durationSec) : "0:00",
      c.final ? "Scored" : c.notScored ? NOT_SCORED_LABEL[c.notScored] : c.inProgress ? IN_PROGRESS_LABEL[c.inProgress] : "Not scored",
      c.final?.score ?? "", c.final?.band ?? "", c.final ? c.final.hardFails.map((id) => hardFailLabel(c.stream, id)).join("; ") : "",
      c.review ? (c.review.verdict === "agree" ? "Agreed" : "Corrected") : "", c.dispute && !c.dispute.resolvedAt ? "Yes" : "",
    ]));
  }

  if (kind === "follow-ups") {
    const f = await getFollowUps(me, today);
    const rows: Cell[][] = [
      ...f.missed.map((m) => ["Missed call to return", nameCell(m.name), phoneCell(m.phone), nameOf(m.personId), `missed ${m.count}x, first ${m.firstAt.slice(0, 10)} ${formatClock(m.firstAt)}`, m.firstAt.slice(0, 10)]),
      ...f.callBacks.map((c) => ["Call-back promised", nameCell(c.name), phoneCell(c.phone), nameOf(c.personId), c.when ?? "", c.date ?? ""]),
      ...f.meetings.map((c) => ["Meeting coming up", nameCell(c.name), phoneCell(c.phone), nameOf(c.personId), c.when ?? "", c.date ?? ""]),
      ...f.toBook.map((c) => [`${c.quality === "hot" ? "Hot" : "Warm"} lead to book`, nameCell(c.name), phoneCell(c.phone), nameOf(c.personId), `last call ${c.lastCallAt.slice(0, 10)}`, ""]),
    ];
    return download("follow-ups", today, ["What", "Client", "Phone", "Person", "Details", "Date"], rows);
  }

  return Response.json({ error: `Unknown download "${kind}"` }, { status: 404 });
}
