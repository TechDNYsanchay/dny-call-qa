import { readWebhook } from "@/lib/webhooks";

// tl;dv posts MeetingReady and TranscriptReady events here (Pro or Business plan).
export async function POST(request: Request) {
  const read = await readWebhook(request, process.env.TLDV_WEBHOOK_SECRET);
  if ("error" in read) return read.error;

  // Week 1: MeetingReady -> match the consultant and the lead (client email from invitees);
  // TranscriptReady -> store the segments, keyed on tl;dv's meeting ID.
  return Response.json({ received: true, stored: false }, { status: 202 });
}
