import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { checkAndSave, nextReadyCallId, scoringPackage, skipCall } from "@/lib/scoring/pipeline";
import { supabaseAdmin } from "@/lib/supabase/server";
import { presentedCronSecret, secretMatches } from "@/lib/webhooks";

// The nightly scoring routine (a Claude Code routine on DNY's Claude Max plan) works only
// through these endpoints, with SCORING_TOKEN as a Bearer token. It never holds database keys.
//
//   GET  /api/scoring/guide                          the scoring guide (markdown)
//   GET  /api/scoring/next[?exclude=id,id]           { done: true } or the next first call to score
//   POST /api/scoring/save?callId=<id>[&dryRun=1]    body: the result JSON -> checked, then saved
//   POST /api/scoring/skip?callId=<id>               marked "Not a sales call"
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: RouteContext<"/api/scoring/[action]">) {
  const denied = authorise(request);
  if (denied) return denied;
  await connection();
  const { action } = await ctx.params;

  if (action === "guide") {
    const guide = await readFile(path.join(process.cwd(), "scoring", "first-call-guide.md"), "utf8");
    return new Response(guide, { headers: { "content-type": "text/markdown; charset=utf-8" } });
  }
  if (action === "next") {
    const db = supabaseAdmin();
    const exclude = (new URL(request.url).searchParams.get("exclude") ?? "").split(",").filter((id) => UUID.test(id));
    const callId = await nextReadyCallId(db, exclude);
    if (!callId) return Response.json({ done: true });
    return Response.json({ done: false, ...(await scoringPackage(db, callId)) });
  }
  return Response.json({ error: `Unknown action "${action}"` }, { status: 404 });
}

export async function POST(request: Request, ctx: RouteContext<"/api/scoring/[action]">) {
  const denied = authorise(request);
  if (denied) return denied;
  await connection();
  const { action } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const callId = params.get("callId");
  if (!callId || !UUID.test(callId)) return Response.json({ error: "Add ?callId=<the call's id>" }, { status: 400 });

  if (action === "save") {
    const result: unknown = await request.json().catch(() => undefined);
    if (result === undefined) return Response.json({ ok: false, errors: ["The body must be the result JSON"] }, { status: 400 });
    const outcome = await checkAndSave(supabaseAdmin(), callId, result, { dryRun: params.get("dryRun") === "1" });
    return Response.json(outcome, { status: outcome.ok ? 200 : 422 });
  }
  if (action === "skip") {
    const skipped = await skipCall(supabaseAdmin(), callId);
    return Response.json({ skipped }, { status: skipped ? 200 : 409 });
  }
  return Response.json({ error: `Unknown action "${action}"` }, { status: 404 });
}

function authorise(request: Request): Response | null {
  if (!process.env.SCORING_TOKEN) return Response.json({ error: "Scoring isn't configured" }, { status: 503 });
  if (!secretMatches(presentedCronSecret(request), process.env.SCORING_TOKEN)) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  return null;
}
