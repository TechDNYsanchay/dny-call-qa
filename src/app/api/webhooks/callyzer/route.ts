import { parseCallyzerPayload } from "@/lib/callyzer";
import { readWebhook } from "@/lib/webhooks";

// Callyzer posts call logs here after each call. The call-history API (the 15-minute
// callyzer-sync job and the nightly sweep) is the single source of stored calls: it uses
// Callyzer's own call IDs, so nothing is counted twice. This endpoint checks and logs what
// Callyzer sends, so a change in its format shows up in the logs.
export async function POST(request: Request) {
  const read = await readWebhook(request, process.env.CALLYZER_WEBHOOK_SECRET);
  if ("error" in read) return read.error;

  const parsed = parseCallyzerPayload(read.payload);
  if (!parsed) {
    console.warn("callyzer webhook: payload not in the expected format");
    return Response.json({ error: "Not a Callyzer call-log payload" }, { status: 422 });
  }
  if (parsed.skipped.length) console.warn("callyzer webhook: unreadable entries", parsed.skipped);
  console.info(`callyzer webhook: ${parsed.calls.length} call(s) received; stored by the next callyzer-sync`);

  return Response.json({ received: parsed.calls.length, skipped: parsed.skipped.length, storedBy: "callyzer-sync" });
}
