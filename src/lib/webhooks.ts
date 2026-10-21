import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison. Fails closed: an unset expected secret never matches. */
export function secretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** From the x-webhook-secret header, or ?secret= for senders that cannot set headers. */
export function presentedWebhookSecret(request: Request): string | null {
  return request.headers.get("x-webhook-secret") ?? new URL(request.url).searchParams.get("secret");
}

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". */
export function presentedCronSecret(request: Request): string | null {
  const auth = request.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
}

/** Shared checks for the Callyzer and tl;dv webhooks. Returns an error response, or the parsed JSON body. */
export async function readWebhook(
  request: Request,
  expectedSecret: string | undefined,
): Promise<{ error: Response } | { payload: unknown }> {
  if (!expectedSecret) return { error: Response.json({ error: "Webhook secret not configured" }, { status: 503 }) };
  if (!secretMatches(presentedWebhookSecret(request), expectedSecret)) {
    return { error: Response.json({ error: "Unauthorised" }, { status: 401 }) };
  }
  const payload: unknown = await request.json().catch(() => undefined);
  if (payload === undefined) return { error: Response.json({ error: "Body must be JSON" }, { status: 400 }) };
  return { payload };
}
