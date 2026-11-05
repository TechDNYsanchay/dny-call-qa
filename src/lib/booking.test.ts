import { describe, expect, it } from "vitest";
import { parseTldvMeeting } from "@/lib/tldv";
import { calendarEvent, isSalesTitle, meetCode, meetingLinkMessage, meetingTitle, parseBookingForm, whenText } from "./booking";

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
