import { presentedCronSecret, secretMatches } from "@/lib/webhooks";

// Scheduled jobs (vercel.json). Times are IST; Vercel Cron runs on UTC.
const JOBS = {
  sweep: "00:30 IST: pull yesterday's calls and meetings missed by the webhooks",
  "build-reports": "06:00 IST: flag unscored calls, write capture fields to leads, build reports",
  "send-reports": "08:00 IST: send each person's QA report and the founders' summary",
} as const;

export async function GET(request: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!secretMatches(presentedCronSecret(request), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { job } = await ctx.params;
  if (!(job in JOBS)) return Response.json({ error: `Unknown job "${job}"` }, { status: 404 });

  return Response.json({ job, description: JOBS[job as keyof typeof JOBS], done: false, note: "Not built yet" }, { status: 202 });
}
