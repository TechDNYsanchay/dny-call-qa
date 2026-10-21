import { readWebhook } from "@/lib/webhooks";

// Callyzer posts call logs here after each call (needs its API + Webhook add-on).
export async function POST(request: Request) {
  const read = await readWebhook(request, process.env.CALLYZER_WEBHOOK_SECRET);
  if ("error" in read) return read.error;

  // Week 1: save each call log to Supabase, keyed on Callyzer's call ID so retries never
  // duplicate, then queue the recording download.
  return Response.json({ received: true, stored: false }, { status: 202 });
}
