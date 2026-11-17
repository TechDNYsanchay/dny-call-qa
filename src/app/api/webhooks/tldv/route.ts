import { fetchTldvMeeting, fetchTldvTranscript } from "@/lib/ingest/tldv-api";
import { storeTldvMeeting } from "@/lib/ingest/tldv";
import { parseTldvWebhook } from "@/lib/tldv";
import { readWebhook } from "@/lib/webhooks";

// tl;dv posts MeetingReady and TranscriptReady here (set up once for the organisation, with
// ?secret= on the URL). Each event stores a sales meeting as a vision call, with its transcript
// when there is one, and starts the scoring; the 10-minute and nightly tldv syncs catch anything missed.
export async function POST(request: Request) {
  const read = await readWebhook(request, process.env.TLDV_WEBHOOK_SECRET);
  if ("error" in read) return read.error;

  const hook = parseTldvWebhook(read.payload);
  if (!hook) {
    console.warn("tldv webhook: payload not in the expected format");
    return Response.json({ error: "Not a tl;dv meeting event" }, { status: 422 });
  }

  // TranscriptReady carries no calendar details; fetch the meeting so it can be matched to a booking.
  if (!hook.meeting.meetCode && hook.meeting.invitees.length === 0 && process.env.TLDV_API_KEY) {
    const full = await fetchTldvMeeting(hook.meeting.sourceId).catch((error) => {
      console.warn(`tldv webhook: meeting ${hook.meeting.sourceId} not fetched:`, error instanceof Error ? error.message : error);
      return null;
    });
    if (full) hook.meeting = full;
  }

  // Not embedded: fetched only for a sales meeting that needs it. If tl;dv isn't ready yet,
  // TranscriptReady or the 10-minute sync brings it.
  let fetched = false;
  const transcript =
    hook.transcript ??
    (process.env.TLDV_API_KEY
      ? async () => {
          const turns = await fetchTldvTranscript(hook.meeting.sourceId).catch((error) => {
            console.warn(`tldv webhook: transcript for ${hook.meeting.sourceId} not fetched:`, error instanceof Error ? error.message : error);
            return null;
          });
          fetched = Boolean(turns?.length);
          return turns;
        }
      : null);

  try {
    const outcome = await storeTldvMeeting(hook.meeting, transcript);
    const withTranscript = Boolean(hook.transcript?.length) || fetched;
    console.info(`tldv webhook: ${hook.event} ${hook.meeting.sourceId}: ${outcome}${withTranscript ? " with transcript" : ""}`);
    return Response.json({ event: hook.event, meeting: hook.meeting.sourceId, outcome, transcript: withTranscript });
  } catch (error) {
    console.error(`tldv webhook: ${hook.meeting.sourceId}:`, error);
    return Response.json({ error: "Couldn't store the meeting" }, { status: 500 });
  }
}
