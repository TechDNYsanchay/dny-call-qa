import { fetchTldvTranscript } from "@/lib/ingest/tldv-api";
import { storeTldvMeeting } from "@/lib/ingest/tldv";
import { MIN_SCORED_DURATION_SEC } from "@/lib/scoring/compute";
import { parseTldvWebhook } from "@/lib/tldv";
import { readWebhook } from "@/lib/webhooks";

// tl;dv posts MeetingReady and TranscriptReady here (set up once for the organisation, with
// ?secret= on the URL). Each event stores the meeting as a vision call, with its transcript
// when there is one; the nightly tldv-sync catches anything missed.
export async function POST(request: Request) {
  const read = await readWebhook(request, process.env.TLDV_WEBHOOK_SECRET);
  if ("error" in read) return read.error;

  const hook = parseTldvWebhook(read.payload);
  if (!hook) {
    console.warn("tldv webhook: payload not in the expected format");
    return Response.json({ error: "Not a tl;dv meeting event" }, { status: 422 });
  }

  let transcript = hook.transcript;
  if (!transcript && hook.meeting.durationSec >= MIN_SCORED_DURATION_SEC && process.env.TLDV_API_KEY) {
    // Not embedded: fetch it. If tl;dv isn't ready yet, TranscriptReady or the nightly sync brings it.
    transcript = await fetchTldvTranscript(hook.meeting.sourceId).catch((error) => {
      console.warn(`tldv webhook: transcript for ${hook.meeting.sourceId} not fetched:`, error instanceof Error ? error.message : error);
      return null;
    });
  }

  try {
    const outcome = await storeTldvMeeting(hook.meeting, transcript);
    console.info(`tldv webhook: ${hook.event} ${hook.meeting.sourceId}: ${outcome}${transcript ? " with transcript" : ""}`);
    return Response.json({ event: hook.event, meeting: hook.meeting.sourceId, outcome, transcript: Boolean(transcript) });
  } catch (error) {
    console.error(`tldv webhook: ${hook.meeting.sourceId}:`, error);
    return Response.json({ error: "Couldn't store the meeting" }, { status: 500 });
  }
}
