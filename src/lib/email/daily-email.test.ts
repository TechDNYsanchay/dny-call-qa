import { describe, expect, it } from "vitest";
import { CALLS, PEOPLE, REPORT_DATE } from "@/lib/data/sample-data";
import type { FollowUps } from "@/lib/follow-ups";
import { addDays } from "@/lib/format";
import { rollup, weekPeriod } from "@/lib/rollups";
import { BUILT_IN_QUESTIONS } from "@/lib/reports";
import { dailyEmail, plainHardFail, type DailyEmailInput } from "./daily-email";

const SITE = "https://dny-call-qa.vercel.app";
const calls = [...CALLS].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const NONE: FollowUps = { missed: [], callBacks: [], meetings: [], toBook: [] };

function input(over: Partial<DailyEmailInput> = {}): DailyEmailInput {
  return {
    day: REPORT_DATE,
    today: addDays(REPORT_DATE, 1),
    siteUrl: SITE,
    people: PEOPLE,
    calls,
    previousCalls: [],
    questions: BUILT_IN_QUESTIONS,
    followUps: NONE,
    toReview: [],
    disputes: [],
    meetingsToday: [],
    rollups: [],
    lastPhoneCallAt: `${REPORT_DATE}T19:40:00+05:30`,
    dataIssues: [],
    ...over,
  };
}

describe("the one daily email", () => {
  const email = dailyEmail(input());
  const phoneCalls = calls.filter((c) => c.stream === "first_call").length;

  it("says the day, the counts and the team's score in the subject", () => {
    expect(email.subject).toMatch(new RegExp(`^Sales QA, Tue 20 Oct: ${phoneCalls} phone calls?, \\d+ meetings? · team [\\d.]+ (Green|Amber|Red)$`));
  });

  it("has every section, always in the same order", () => {
    const order = ["Yesterday in 30 seconds", "Phone calls", "Google Meet meetings", "Needs you today", "Today&#39;s meetings", "How to read scores", "Data check"];
    const at = order.map((s) => email.html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("links each person's day and the calls worth listening to", () => {
    expect(email.html).toContain(`${SITE}/people/rohan?day=${REPORT_DATE}`);
    expect(email.html).toContain("Worth listening to");
    expect(email.html).toMatch(new RegExp(`${SITE}/calls/[\\w-]+`));
  });

  it("speaks plainly: no question codes or scorecard jargon", () => {
    expect(email.html).not.toMatch(/\b(fc|lc)\d{2}\b/);
    expect(email.html).not.toMatch(/\bH\d{2}\b/);
    expect(email.html).not.toContain("hard fail");
    expect(plainHardFail("fee_or_package_quoted")).toBe("quoted a fee or package on the first call");
  });

  it("puts what needs a founder in one numbered list", () => {
    const disputed = { ...calls.find((c) => c.final)!, dispute: { comment: "The client asked for <the price>", by: null, at: "", resolvedAt: null } };
    const withNeeds = dailyEmail(
      input({
        disputes: [disputed],
        followUps: { ...NONE, missed: [{ phone: "+919800000001", name: "Mohit", personId: "rohan", firstAt: `${REPORT_DATE}T10:00:00+05:30`, lastAt: `${REPORT_DATE}T10:05:00+05:30`, count: 2, callIds: ["x"], alerted: false }] },
      }),
    );
    expect(withNeeds.html).toContain("1 missed client call not returned yet");
    expect(withNeeds.html).toContain("disputes a score");
    expect(withNeeds.html).toContain("The client asked for &lt;the price&gt;");
    expect(withNeeds.subject).toMatch(/· 2 need you$/);
  });

  it("is short on a day with no calls, and still says what's missing", () => {
    const quiet = dailyEmail(input({ calls: [], dataIssues: ["Callyzer isn't sending new phone calls."] }));
    expect(quiet.subject).toBe("Sales QA, Tue 20 Oct: no calls yesterday");
    expect(quiet.html).toContain("No phone calls or meetings came in yesterday.");
    expect(quiet.html).toContain("Heads-up: Callyzer isn&#39;t sending new phone calls.");
    expect(quiet.html).not.toContain("Worth listening to");
  });

  it("lists today's meetings with their brief", () => {
    const today = dailyEmail(input({ meetingsToday: [{ time: "11:30 am", client: "Spice Route", host: "Chef Shishir", link: `${SITE}/leads/l1/brief` }] }));
    expect(today.html).toContain("<b>11:30 am</b> · Spice Route with Chef Shishir");
    expect(today.html).toContain(`${SITE}/leads/l1/brief`);
  });

  it("carries last week's roll-up on a Monday", () => {
    const r = rollup(weekPeriod(REPORT_DATE), PEOPLE, calls, []);
    const monday = dailyEmail(input({ rollups: [r] }));
    expect(monday.html).toContain("Last week");
    expect(monday.html).toContain(`${SITE}/rollups?${r.period.query}`);
  });

  it("has a plain-text version", () => {
    expect(email.text).toContain(`Open the app: ${SITE}/?day=${REPORT_DATE}`);
  });
});
