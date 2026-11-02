import { describe, expect, it } from "vitest";
import { CALLS } from "@/lib/data/sample-data";
import { meetingRecapEmail, nextStepsEmail } from "@/lib/email/report-emails";
import { recapErrors } from "@/lib/scoring/pipeline";
import { VisionCallSubmitSchema, type VisionCallSubmit } from "@/lib/scoring/schema";
import { actionState, agreedTime, byDue, calendarLink, clientNudgeMessage, clientRecapMessage, dueLabel, recapMailto, type MeetingAction, type MeetingRecap } from "./recap";

const SITE = "https://dny-call-qa.vercel.app";
const sample = VisionCallSubmitSchema.parse(CALLS.find((c) => c.result?.stream === "vision_call")!.result);

const action = (over: Partial<MeetingAction>): MeetingAction => ({
  id: "a1",
  callId: "call-1",
  leadId: "lead-1",
  owner: "dny",
  kind: "other",
  task: "Send the case study",
  due: "2026-10-24",
  dueText: "Friday",
  quote: "I'll send it across by Friday",
  quoteAt: "48:10",
  doneAt: null,
  personId: "kabir",
  meetingAt: "2026-10-20T14:00:00+05:30",
  client: { name: "Arjun Mehta", phone: "+919820012345", email: "arjun@example.com" },
  ...over,
});

describe("the time agreed for a step", () => {
  it("reads the usual ways a time is said", () => {
    expect(agreedTime("Monday the 27th at 4")).toBe("4 pm");
    expect(agreedTime("Saturday at 11")).toBe("11 am");
    expect(agreedTime("Thursday at 4:30")).toBe("4:30 pm");
    expect(agreedTime("Thursday at 10 am")).toBe("10 am");
    expect(agreedTime("Thu 29 Oct, 18:00")).toBe("6 pm");
    expect(agreedTime("Saturday the seventh at eleven")).toBe("11 am");
    expect(agreedTime("Monday around four thirty")).toBe("4:30 pm");
  });

  it("doesn't take a date for a time", () => {
    expect(agreedTime("by Friday the 24th")).toBeNull();
    expect(agreedTime("at 10 Nov")).toBeNull();
    expect(agreedTime("after Diwali")).toBeNull();
    expect(agreedTime(null)).toBeNull();
  });
});

describe("where a step stands", () => {
  it("is overdue, today, upcoming, undated or done", () => {
    expect(actionState(action({ due: "2026-10-23" }), "2026-10-24")).toBe("overdue");
    expect(actionState(action({}), "2026-10-24")).toBe("today");
    expect(actionState(action({}), "2026-10-21")).toBe("upcoming");
    expect(actionState(action({ due: null }), "2026-10-21")).toBe("no_date");
    expect(actionState(action({ doneAt: "2026-10-22T10:00:00+05:30" }), "2026-10-24")).toBe("done");
  });

  it("lists open ones soonest first, undated after them, done last", () => {
    const list = [action({ id: "done", doneAt: "x" }), action({ id: "none", due: null }), action({ id: "late", due: "2026-10-22" }), action({ id: "soon" })];
    expect([...list].sort(byDue).map((a) => a.id)).toEqual(["late", "soon", "none", "done"]);
  });

  it("says when it's due the way the list shows it", () => {
    expect(dueLabel(action({}))).toBe("by Saturday 24 Oct");
    expect(dueLabel(action({ kind: "review_call", due: "2026-10-27", dueText: "Monday at 4" }), true)).toBe("Tue 27 Oct, 4 pm");
    expect(dueLabel(action({ due: null, dueText: "after Diwali" }))).toBe("after Diwali");
  });
});

describe("one tap to the calendar", () => {
  it("books the agreed time for 30 minutes, in IST", () => {
    const url = new URL(calendarLink(action({ kind: "review_call", task: "Hold the review call", due: "2026-10-27", dueText: "Monday the 27th at 4" }), "Arjun Mehta", `${SITE}/calls/x/recap`)!);
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("dates")).toBe("20261027T160000/20261027T163000");
    expect(url.searchParams.get("ctz")).toBe("Asia/Kolkata");
    expect(url.searchParams.get("text")).toBe("Review call · Arjun Mehta");
    expect(url.searchParams.get("details")).toContain(`${SITE}/calls/x/recap`);
  });

  it("makes a task an all-day reminder, and the client's step a reminder to check", () => {
    const url = new URL(calendarLink(action({ owner: "client", task: "Share the floor plan", dueText: "by Friday" }), "Arjun Mehta", SITE)!);
    expect(url.searchParams.get("dates")).toBe("20261024/20261025");
    expect(url.searchParams.get("text")).toBe("Check: Arjun to share the floor plan");
    expect(calendarLink(action({ due: null }), "Arjun", SITE)).toBeNull();
  });
});

describe("the recap for the client", () => {
  const steps = [
    action({ kind: "proposal", task: "Send the proposal", dueText: "Friday the 24th" }),
    action({ owner: "client", task: "Share the floor plan and menu ideas", due: null, dueText: "this week" }),
  ];

  it("thanks them and lists each side's next steps, with no notes about them", () => {
    const text = clientRecapMessage("Arjun Mehta", steps, "2026-10-20", "2026-10-20");
    expect(text).toMatch(/^Hi Arjun, thank you for your time today\./);
    expect(text).toContain("From our side:\n• Send the proposal – by Saturday 24 Oct");
    expect(text).toContain("From your side:\n• Share the floor plan and menu ideas – this week");
    expect(text).toMatch(/– DNY Hospitality$/);
    expect(text).not.toContain("₹");
  });

  it("names the meeting day when sent later, and still works with no steps", () => {
    expect(clientRecapMessage("Arjun", steps, "2026-10-20", "2026-10-21")).toContain("your time on Tuesday 20 Oct");
    expect(clientRecapMessage("+91 98200 12345", [], "2026-10-20", "2026-10-20")).toMatch(/^Hi, thank you .* in touch with the next steps shortly/);
  });

  it("nudges politely, and opens email ready to send", () => {
    expect(clientNudgeMessage("Arjun Mehta", "Share the floor plan", "2026-10-20")).toContain("please share the floor plan.");
    const mailto = recapMailto("arjun@example.com", "Hi Arjun,\nthanks & bye");
    expect(mailto).toBe("mailto:arjun@example.com?subject=Next%20steps%20from%20our%20call&body=Hi%20Arjun%2C%0Athanks%20%26%20bye");
  });
});

describe("the recap check on saving", () => {
  const callDay = "2026-10-20";
  const withActions = (actions: VisionCallSubmit["recap"]["actions"], capture: Partial<VisionCallSubmit["capture"]> = {}): VisionCallSubmit => ({
    ...sample,
    capture: { ...sample.capture, ...capture },
    recap: { ...sample.recap, actions },
  });

  it("accepts the sample, whose steps match its proposal and review dates", () => {
    expect(recapErrors(sample, callDay)).toEqual([]);
  });

  it("rejects dates before the call or months away", () => {
    const [proposal, review] = sample.recap.actions;
    expect(recapErrors(withActions([{ ...proposal, due: "2026-10-19" }, review], { proposalDate: "2026-10-19" }), callDay)).toEqual([
      expect.stringContaining("must be on or after the call"),
    ]);
    expect(recapErrors(withActions([proposal, review, { ...proposal, kind: "other", due: "2027-06-01" }]), callDay)).toHaveLength(1);
  });

  it("keeps the proposal and review steps in line with the dates captured", () => {
    const [proposal, review] = sample.recap.actions;
    expect(recapErrors(withActions([review]), callDay)).toEqual([expect.stringContaining("capture.proposalDate is 2026-10-24")]);
    expect(recapErrors(withActions([proposal, review], { reviewCallDate: null }), callDay)).toEqual([expect.stringContaining("capture.reviewCallDate is null")]);
  });
});

describe("the recap emails", () => {
  const recap: MeetingRecap = {
    callId: "call-1",
    leadId: "lead-1",
    personId: "kabir",
    meetingAt: "2026-10-20T14:00:00+05:30",
    client: { name: "Arjun Mehta", phone: "+919820012345", email: null },
    summary: sample.recap.summary,
    keyPoints: sample.recap.keyPoints,
    openQuestions: sample.recap.openQuestions,
    actions: sample.recap.actions.map((a, i) => action({ id: `a${i}`, owner: a.owner, kind: a.kind, task: a.task, due: a.due, dueText: a.dueText })),
    score: { score: 78, band: "amber" },
  };

  it("sends the consultant the next steps the same day, with calendar and the client's recap a tap away", () => {
    const email = meetingRecapEmail(recap, SITE, "2026-10-20");
    expect(email.subject).toBe("Next steps: Arjun Mehta · Send the proposal by Sat 24 Oct");
    expect(email.html).toContain("Your next steps");
    expect(email.html).toContain("calendar.google.com");
    expect(email.html).toContain("https://wa.me/919820012345?text=");
    expect(email.html).toContain(`${SITE}/calls/call-1/recap`);
    expect(email.html).toContain("Worth remembering");
    expect(email.text).toContain("Recap and ticks:");
  });

  it("tells a consultant with no calls what is due, and who to nudge", () => {
    const late = [action({ due: "2026-10-22" }), action({ id: "c", owner: "client", due: "2026-10-21", task: "Share the floor plan" })];
    const email = nextStepsEmail("Kabir", late, "2026-10-24", SITE);
    expect(email.subject).toBe("1 next step due, 1 overdue");
    expect(email.html).toContain("overdue");
    expect(email.html).toContain("Nudge on WhatsApp");
  });
});
