import { describe, expect, it } from "vitest";
import { clientsOf, parseTldvMeeting, parseTldvTranscript, parseTldvWebhook } from "./tldv";

// Shapes from tl;dv's API reference (doc.tldv.io); names and emails are invented.
const MEETING = {
  id: "6720f1a2b3c4d5e6f7a8b9c0",
  name: "DNY x Arjun: vision call",
  happenedAt: "2026-10-27T06:30:00.000Z",
  url: "https://tldv.io/app/meetings/6720f1a2b3c4d5e6f7a8b9c0",
  duration: 2715.4,
  organizer: { name: "Kabir Shah", email: "Kabir@dnyhospitality.com" },
  invitees: [
    { name: "Kabir Shah", email: "kabir@dnyhospitality.com" },
    { name: "Arjun Malhotra", email: "arjun@example.com" },
    { name: "Neha", email: "neha@dnyhospitality.com" },
  ],
  template: "meeting-notes",
  extraProperties: { conferenceId: "abc-defg-hij" },
};

describe("tl;dv meetings", () => {
  it("reads a meeting from the API", () => {
    expect(parseTldvMeeting(MEETING)).toEqual({
      sourceId: "6720f1a2b3c4d5e6f7a8b9c0",
      title: "DNY x Arjun: vision call",
      startedAt: "2026-10-27T06:30:00.000Z",
      durationSec: 2715,
      organizer: { name: "Kabir Shah", email: "kabir@dnyhospitality.com" },
      invitees: [
        { name: "Kabir Shah", email: "kabir@dnyhospitality.com" },
        { name: "Arjun Malhotra", email: "arjun@example.com" },
        { name: "Neha", email: "neha@dnyhospitality.com" },
      ],
      url: "https://tldv.io/app/meetings/6720f1a2b3c4d5e6f7a8b9c0",
    });
  });

  it("rejects a meeting without an id, time or duration", () => {
    expect(parseTldvMeeting({ ...MEETING, id: "" })).toBeNull();
    expect(parseTldvMeeting({ ...MEETING, happenedAt: "soon" })).toBeNull();
    expect(parseTldvMeeting({ ...MEETING, duration: undefined })).toBeNull();
  });

  it("treats only people outside DNY as the client", () => {
    expect(clientsOf(parseTldvMeeting(MEETING)!).map((p) => p.email)).toEqual(["arjun@example.com"]);
    const internal = parseTldvMeeting({ ...MEETING, invitees: [{ name: "Neha", email: "neha@dnyhospitality.com" }] })!;
    expect(clientsOf(internal)).toEqual([]);
  });
});

describe("tl;dv transcripts", () => {
  it("reads named speakers and joins one speaker's back-to-back lines", () => {
    const turns = parseTldvTranscript({
      id: "t1",
      meetingId: MEETING.id,
      data: [
        { speaker: "Kabir Shah", text: "Arjun, tell me about the brand you want to build.", startTime: 2.1, endTime: 5.4 },
        { speaker: "Arjun Malhotra", text: "So it started with my dad's dhaba.", startTime: 6, endTime: 9.2 },
        { speaker: "Arjun Malhotra", text: "Forty years on the highway.", startTime: 9.4, endTime: 11 },
        { speaker: "Kabir Shah", text: "", startTime: 11.5, endTime: 12 },
      ],
    });
    expect(turns).toEqual([
      { speaker: "Kabir Shah", startSec: 2.1, endSec: 5.4, text: "Arjun, tell me about the brand you want to build." },
      { speaker: "Arjun Malhotra", startSec: 6, endSec: 11, text: "So it started with my dad's dhaba. Forty years on the highway." },
    ]);
  });

  it("returns null for something that isn't a transcript", () => {
    expect(parseTldvTranscript({ nope: true })).toBeNull();
  });
});

describe("tl;dv webhooks", () => {
  it("reads a TranscriptReady event with the transcript embedded", () => {
    const hook = parseTldvWebhook({
      id: "wh1",
      event: "TranscriptReady",
      executedAt: "2026-10-27T07:20:00.000Z",
      data: { ...MEETING, transcript: { data: [{ speaker: "Kabir Shah", text: "Namaste Arjun.", startTime: 1, endTime: 2 }] } },
    })!;
    expect(hook.event).toBe("TranscriptReady");
    expect(hook.meeting.sourceId).toBe(MEETING.id);
    expect(hook.transcript).toEqual([{ speaker: "Kabir Shah", startSec: 1, endSec: 2, text: "Namaste Arjun." }]);
  });

  it("reads a MeetingReady event without a transcript", () => {
    const hook = parseTldvWebhook({ id: "wh2", event: "MeetingReady", executedAt: "2026-10-27T07:16:00.000Z", data: MEETING })!;
    expect(hook.transcript).toBeNull();
  });

  it("rejects a payload that isn't a tl;dv event", () => {
    expect(parseTldvWebhook({ hello: "world" })).toBeNull();
  });
});
