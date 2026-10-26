import { connection } from "next/server";
import { addDays, toIst } from "@/lib/format";
import { syncCallyzer } from "@/lib/ingest/callyzer-api";
import { transcribePending } from "@/lib/ingest/transcribe";
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
  "build-reports": "06:00 IST: flag unscored calls, write capture fields to leads, build reports",
  "send-reports": "08:00 IST: send each person's QA report and the founders' summary",
} as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
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
      return Response.json({ job, ...(await transcribePending(TRANSCRIBE_BUDGET_MS)) });
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
    if (error instanceof TranscriberNotConfigured) {
      return Response.json({ job, done: false, note: error.message }, { status: 202 });
    }
    console.error(`cron ${job}:`, error);
    return Response.json({ job, error: error instanceof Error ? error.message : "failed" }, { status: 502 });
  }

  return Response.json({ job, description: JOBS[job as keyof typeof JOBS], done: false, note: "Not built yet" }, { status: 202 });
}
