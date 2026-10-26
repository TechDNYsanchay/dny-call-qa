import { connection } from "next/server";
import { alert } from "@/lib/alerts";
import { MailNotConfigured } from "@/lib/email/send";
import { addDays, toIst } from "@/lib/format";
import { syncCallyzer } from "@/lib/ingest/callyzer-api";
import { syncTldv } from "@/lib/ingest/tldv";
import { transcribePending } from "@/lib/ingest/transcribe";
import { buildDailyReports, sendDailyReports } from "@/lib/report-jobs";
import { TranscriberNotConfigured } from "@/lib/transcription";
import { presentedCronSecret, secretMatches } from "@/lib/webhooks";

// Recording copies and transcription run inside the job, so give it room.
export const maxDuration = 300;
/** Transcription stops taking new calls after this, leaving time to finish the current one. */
const TRANSCRIBE_BUDGET_MS = 200_000;

// Scheduled jobs (vercel.json). Times are IST; Vercel Cron runs on UTC.
const JOBS = {
  "callyzer-sync": "Every 15 minutes, 08:30-23:30 IST: pull today's Callyzer calls and copy new recordings",
  transcribe: "Every 15 minutes, 08:37-01:22 IST: transcribe stored recordings, oldest first",
  sweep: "00:30 IST: pull yesterday's and today's Callyzer calls to catch anything missed",
  "tldv-sync": "00:50 IST: store tl;dv meetings from the last 3 days that the webhook missed",
  "build-reports": "06:00 IST: flag unscored calls, write capture fields to leads, build reports",
  "send-reports": "08:00 IST: send each person's QA report and the founders' summary",
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What a failed job means for DNY, for the alert email. */
const WHAT_STOPS: Record<string, string> = {
  "callyzer-sync": "New calls aren't arriving from Callyzer. If the error mentions the allowed dates, the free sandbox has ended and the Callyzer API add-on is needed.",
  sweep: "The overnight Callyzer catch-up didn't run, so some of yesterday's calls may be missing.",
  transcribe: "Recordings aren't being transcribed, so calls can't be scored. Check the Deepgram key and credit.",
  "build-reports": "Yesterday's reports weren't prepared, so missing recordings aren't flagged.",
  "send-reports": "The 8 am reports may not have gone out.",
  "tldv-sync": "Vision calls from tl;dv aren't being collected.",
};
const MAX_RANGE_DAYS = 15;

export async function GET(request: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!secretMatches(presentedCronSecret(request), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!(job in JOBS)) return Response.json({ error: `Unknown job "${job}"` }, { status: 404 });

  await connection(); // the jobs below read the clock
  const today = toIst(new Date().toISOString()).slice(0, 10);

  try {
    if (job === "transcribe") {
      // ?limit=N transcribes at most N calls, for trying the job by hand.
      const limit = Number(new URL(request.url).searchParams.get("limit"));
      const run = await transcribePending(TRANSCRIBE_BUDGET_MS, limit > 0 ? limit : Infinity);
      if (run.failed > 0 || run.retrying >= 3) {
        await alert("transcribe:failures", "calls couldn't be transcribed", [
          `The last transcription run had ${run.failed} call(s) fail for good and ${run.retrying} waiting to retry.`,
          "Failed calls can't be scored. Check the Deepgram key and credit; a call's error is shown in its transcript_error.",
        ]);
      }
      return Response.json({ job, ...run });
    }
    if (job === "build-reports" || job === "send-reports") {
      // Yesterday's calls by default; ?day=YYYY-MM-DD for another day, ?preview=1 to see the emails unsent.
      const params = new URL(request.url).searchParams;
      const day = params.get("day") ?? addDays(today, -1);
      if (!DAY.test(day)) return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
      if (job === "build-reports") return Response.json({ job, ...(await buildDailyReports(day)) });
      const limit = Number(params.get("limit"));
      return Response.json({ job, ...(await sendDailyReports(day, { preview: params.get("preview") === "1", limit: limit > 0 ? limit : Infinity })) });
    }
    if (job === "tldv-sync") {
      if (!process.env.TLDV_API_KEY) return Response.json({ job, done: false, note: "TLDV_API_KEY is not set" }, { status: 202 });
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      return Response.json({ job, since, ...(await syncTldv(since)) });
    }
    if (job === "sweep") {
      return Response.json({ job, ...(await syncCallyzer(addDays(today, -1), today)) });
    }
    if (job === "callyzer-sync") {
      // ?from=YYYY-MM-DD&to=YYYY-MM-DD backfills a range (at most 15 days); default is today.
      const params = new URL(request.url).searchParams;
      const from = params.get("from") ?? today;
      const to = params.get("to") ?? from;
      if (!DAY.test(from) || !DAY.test(to) || from > to || addDays(from, MAX_RANGE_DAYS - 1) < to) {
        return Response.json({ error: `from/to must be YYYY-MM-DD, in order, at most ${MAX_RANGE_DAYS} days apart` }, { status: 400 });
      }
      return Response.json({ job, ...(await syncCallyzer(from, to)) });
    }
  } catch (error) {
    if (error instanceof TranscriberNotConfigured || error instanceof MailNotConfigured) {
      return Response.json({ job, done: false, note: error.message }, { status: 202 });
    }
    console.error(`cron ${job}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    await alert(`job:${job}`, `the ${job} job failed`, [
      `The scheduled job "${job}" failed at ${toIst(new Date().toISOString()).slice(11, 16)} IST.`,
      WHAT_STOPS[job] ?? "",
      `Error: ${message}`,
    ].filter(Boolean));
    return Response.json({ job, error: message }, { status: 502 });
  }

  return Response.json({ job, description: JOBS[job as keyof typeof JOBS], done: false, note: "Not built yet" }, { status: 202 });
}
