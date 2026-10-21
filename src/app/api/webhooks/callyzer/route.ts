import { after } from "next/server";
import { parseCallyzerPayload } from "@/lib/callyzer";
import { storeCallyzerCalls } from "@/lib/ingest/callyzer";
import { copyRecording } from "@/lib/ingest/recordings";
import { readWebhook } from "@/lib/webhooks";

// Recording copies run after the response, inside this function's time budget.
export const maxDuration = 300;

// Callyzer posts call logs here after each call (needs its API + Webhook add-on). The secret
// goes in the URL (?secret=...) because Callyzer's webhook settings take only a URL.
export async function POST(request: Request) {
  const read = await readWebhook(request, process.env.CALLYZER_WEBHOOK_SECRET);
  if ("error" in read) return read.error;

  const parsed = parseCallyzerPayload(read.payload);
  if (!parsed) return Response.json({ error: "Not a Callyzer call-log payload" }, { status: 422 });
  if (parsed.skipped.length) console.warn("callyzer: skipped entries", parsed.skipped);

  const stored = await storeCallyzerCalls(parsed.calls);

  // Copy recordings once Callyzer has its answer; a failure leaves the call "pending" for the
  // nightly sweep to retry.
  after(async () => {
    for (const call of stored.toDownload) {
      try {
        await copyRecording(call);
      } catch (error) {
        console.error(`callyzer: recording for call ${call.callId} not copied:`, error instanceof Error ? error.message : error);
      }
    }
  });

  return Response.json({
    received: parsed.calls.length + parsed.skipped.length,
    inserted: stored.inserted,
    updated: stored.updated,
    skipped: parsed.skipped.length,
    recordingsQueued: stored.toDownload.length,
  });
}
