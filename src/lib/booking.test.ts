import { describe, expect, it } from "vitest";
import { parseTldvMeeting } from "@/lib/tldv";
import { calendarEvent, calendarIdOf, existingEventId, existingMeetingEvent, isExistingMeeting, isSalesTitle, meetCode, meetingLinkMessage, meetingTitle, parseBookingForm, parseExistingMeetingForm, whenText } from "./booking";

// Wednesday 4 Nov 2026, 10:00 IST.
const NOW = Date.parse("2026-11-04T10:00:00+05:30");
const HOST = "4b1f0c2e-6a1d-4c2b-9f3e-2d6c8a1b7e90";
const form = (over: Record<string, string> = {}) => ({
  clientName: "Rohit Kapoor",
  clientEmail: " Rohit.K@Gmail.com ",
  clientPhone: "98200 12345",
  date: "2026-11-05",
  time: "11:00",
  durationMin: "45",
  consultantId: HOST,
  addMe: "on",
  ...over,
});

describe("the booking form", () => {
  it("turns what was typed into a booking in IST", () => {
    const r = parseBookingForm(form(), NOW);
    expect(r).toEqual({
      ok: true,
      value: {
        clientName: "Rohit Kapoor",
        clientEmail: "rohit.k@gmail.com",
        clientPhone: "+919820012345",
        startsAt: "2026-11-05T11:00:00+05:30",
        durationMin: 45,
        consultantId: HOST,
        addMe: true,
        leadId: null,
        notes: null,
      },
    });
  });

  it("needs the client's own email, since tl;dv records only meetings with someone from outside", () => {
    const r = parseBookingForm(form({ clientEmail: "rohit@dnyhospitality.com" }), NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.clientEmail).toMatch(/client's own email/);
    expect(!parseBookingForm(form({ clientEmail: "not an email" }), NOW).ok).toBe(true);
  });

  it("refuses times in the past or too far ahead, and odd lengths", () => {
    expect(parseBookingForm(form({ date: "2026-11-04", time: "09:30" }), NOW)).toMatchObject({ ok: false, errors: { time: expect.any(String) } });
    expect(parseBookingForm(form({ date: "2027-06-01" }), NOW)).toMatchObject({ ok: false, errors: { date: expect.any(String) } });
    expect(parseBookingForm(form({ durationMin: "20" }), NOW)).toMatchObject({ ok: false, errors: { durationMin: expect.any(String) } });
    expect(parseBookingForm(form({ clientPhone: "12345" }), NOW)).toMatchObject({ ok: false, errors: { clientPhone: expect.any(String) } });
  });

  it("names every missing field", () => {
    const r = parseBookingForm({ clientName: "", clientEmail: "", date: "", time: "", consultantId: "" }, NOW);
    expect(r.ok).toBe(false);
    expect(Object.keys(!r.ok ? r.errors : {})).toEqual(expect.arrayContaining(["clientName", "clientEmail", "date", "time", "consultantId"]));
  });
});

describe("the calendar invite", () => {
  const event = calendarEvent({
    bookingId: "b-1",
    clientName: "Rohit Kapoor",
    startsAt: "2026-11-05T11:00:00+05:30",
    durationMin: 45,
    guests: [
      { email: "rohit.k@gmail.com", name: "Rohit Kapoor" },
      { email: "priya@dnyhospitality.com", name: "Priya" },
      { email: "Priya@dnyhospitality.com", name: "Priya" },
    ],
    notes: null,
  });

  it("asks for a Meet link, runs for the booked length and invites each guest once", () => {
    expect(event.conferenceData.createRequest).toEqual({ requestId: "b-1", conferenceSolutionKey: { type: "hangoutsMeet" } });
    expect(event.start.dateTime).toBe("2026-11-05T05:30:00.000Z");
    expect(event.end.dateTime).toBe("2026-11-05T06:15:00.000Z");
    expect(event.attendees.map((a) => a.email)).toEqual(["rohit.k@gmail.com", "priya@dnyhospitality.com"]);
  });

  it("is titled as a vision call and tells the client it's recorded", () => {
    expect(event.summary).toBe(meetingTitle("Rohit Kapoor"));
    expect(isSalesTitle(event.summary)).toBe(true);
    expect(event.description).toMatch(/recorded and transcribed/);
  });
});

describe("telling a sales meeting from the rest", () => {
  it("reads 'vision call' however it's written", () => {
    for (const t of ["Vision call: Rohit", "VISION-CALL with Rohit", "Rohit – vision  call"]) expect(isSalesTitle(t)).toBe(true);
    for (const t of ["Project review: Cafe Brew", "Weekly sync", null]) expect(isSalesTitle(t)).toBe(false);
  });

  it("takes the Meet code from a link or tl;dv's conferenceId", () => {
    expect(meetCode("https://meet.google.com/ktu-gjvh-vmf?authuser=0")).toBe("ktu-gjvh-vmf");
    expect(meetCode("KTU-GJVH-VMF")).toBe("ktu-gjvh-vmf");
    expect(meetCode("https://zoom.us/j/123")).toBeNull();
    const meeting = parseTldvMeeting({ id: "m1", happenedAt: "2026-11-05T05:31:00Z", duration: 2400, name: "x", extraProperties: { conferenceId: "ktu-gjvh-vmf" } });
    expect(meeting?.meetCode).toBe("ktu-gjvh-vmf");
    expect(parseTldvMeeting({ id: "m2", happenedAt: "2026-11-05T05:31:00Z", duration: 10 })?.meetCode).toBeNull();
  });
});

describe("the WhatsApp message with the link", () => {
  it("gives the day and time in IST and the link", () => {
    expect(whenText("2026-11-05T11:00:00+05:30")).toBe("Thursday 5 Nov at 11 am");
    const text = meetingLinkMessage("Rohit Kapoor", "2026-11-05T16:30:00+05:30", "https://meet.google.com/ktu-gjvh-vmf");
    expect(text).toMatch(/^Hi Rohit, your video call with DNY Hospitality is fixed for Thursday 5 Nov at 4:30 pm\. Join here: https:\/\/meet\.google\.com\/ktu-gjvh-vmf /);
    expect(text).toMatch(/– DNY Hospitality$/);
  });
});

describe("adding an existing meeting", () => {
  const NOW = Date.parse("2026-11-19T13:00:00+05:30");
  const form = (over: Record<string, string> = {}) => ({
    meetLink: "https://meet.google.com/arj-csyw-exe?authuser=0",
    clientName: "Jinal",
    clientEmail: "",
    date: "2026-11-19",
    time: "16:00",
    durationMin: "45",
    consultantId: "8f0e7a7e-3b1c-4c55-9a51-2a6f0f4f9d10",
    ...over,
  });

  it("reads the Meet code from the link and keeps the client's email optional", () => {
    const r = parseExistingMeetingForm(form(), NOW);
    expect(r.ok && r.value).toMatchObject({ meetCode: "arj-csyw-exe", meetUrl: "https://meet.google.com/arj-csyw-exe", clientEmail: null, startsAt: "2026-11-19T16:00:00+05:30" });
  });

  it("refuses a link that isn't a Meet link, a DNY email, and a meeting that started long ago", () => {
    expect(parseExistingMeetingForm(form({ meetLink: "https://zoom.us/j/123" }), NOW)).toMatchObject({ ok: false, errors: { meetLink: expect.any(String) } });
    expect(parseExistingMeetingForm(form({ clientEmail: "nikita@dnyhospitality.com" }), NOW)).toMatchObject({ ok: false, errors: { clientEmail: expect.any(String) } });
    expect(parseExistingMeetingForm(form({ time: "12:00" }), NOW)).toMatchObject({ ok: false, errors: { time: expect.any(String) } });
    expect(parseExistingMeetingForm(form({ time: "12:50" }), NOW).ok).toBe(true);
  });

  it("copies the meeting with its own Meet as the video call and the client as a silent guest", () => {
    const r = parseExistingMeetingForm(form({ clientEmail: "Jinal@Example.com" }), NOW);
    if (!r.ok) throw new Error("expected a valid form");
    const event = existingMeetingEvent(r.value);
    expect(event.summary).toBe("Vision call: Jinal × DNY Hospitality");
    expect(event.attendees).toEqual([{ email: "jinal@example.com", displayName: "Jinal" }]);
    expect(event.conferenceData).toMatchObject({ conferenceId: "arj-csyw-exe", conferenceSolution: { key: { type: "hangoutsMeet" } } });
    expect(existingMeetingEvent(r.value, false)).not.toHaveProperty("conferenceData");
    expect(existingMeetingEvent(r.value, false).location).toBe("https://meet.google.com/arj-csyw-exe");
  });
});

describe("telling an added meeting from a booked one", () => {
  it("marks the calendar copy's id and reads it back", () => {
    const id = existingEventId("abc123");
    expect(isExistingMeeting(id)).toBe(true);
    expect(calendarIdOf(id)).toBe("abc123");
    expect(isExistingMeeting("abc123")).toBe(false);
    expect(isExistingMeeting(null)).toBe(false);
    expect(calendarIdOf("abc123")).toBe("abc123");
  });
});
