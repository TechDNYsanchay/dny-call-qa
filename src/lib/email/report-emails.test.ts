import { describe, expect, it } from "vitest";
import { CALLS, PEOPLE, PREVIOUS_DAYS, REPORT_DATE } from "@/lib/data/sample-data";
import { personDayReport, teamSummary } from "@/lib/reports";
import { rollup, weekPeriod } from "@/lib/rollups";
import { disputeEmail, missedCallsEmail, personReportEmail, personRollupEmail, teamRollupEmail, teamSummaryEmail } from "./report-emails";

const calls = [...CALLS].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const person = (id: string) => PEOPLE.find((p) => p.id === id)!;
const SITE = "https://dny-call-qa.vercel.app";

describe("a person's 8 am email", () => {
  const email = personReportEmail(personDayReport(person("rohan"), calls), REPORT_DATE, SITE);

  it("puts the day, the average and the band in the subject", () => {
    expect(email.subject).toMatch(/^Call QA, Tue 20 Oct: [\d.]+ (Green|Amber|Red) · \d+ of \d+ calls scored$/);
  });

  it("shows the band as a shape and a word, never colour alone", () => {
    expect(email.html).toMatch(/[●▲■]<\/span> (Green|Amber|Red)/);
  });

  it("links every scored call, the day's calls and the full report", () => {
    for (const call of calls.filter((c) => c.personId === "rohan" && c.final)) expect(email.html).toContain(`${SITE}/calls/${call.id}`);
    expect(email.html).toContain(`${SITE}/people/rohan?day=${REPORT_DATE}`);
  });

  it("sums up the unscored calls in one line with a link to the day", () => {
    const aisha = personReportEmail(personDayReport(person("aisha"), calls), REPORT_DATE, SITE);
    expect(aisha.html).toMatch(/\d+ other calls? not scored/);
    expect(aisha.html).toContain(`${SITE}/calls?day=${REPORT_DATE}`);
  });

  it("escapes what people said", () => {
    const report = personDayReport(person("rohan"), calls);
    report.fixes = [{ ...report.fixes[0], text: "Say <b>this</b> & that" }];
    expect(personReportEmail(report, REPORT_DATE, SITE).html).toContain("Say &lt;b&gt;this&lt;/b&gt; &amp; that");
  });

  it("has a plain-text version", () => {
    expect(email.text).toContain("Full report: ");
  });
});

describe("the founders' summary email", () => {
  const email = teamSummaryEmail(teamSummary(PEOPLE, calls, PREVIOUS_DAYS), REPORT_DATE, SITE);

  it("summarises the team in the subject", () => {
    expect(email.subject).toMatch(/^Team call QA, Tue 20 Oct: average [\d.]+ (Green|Amber|Red) · \d+ scored, \d+ hard fails?$/);
  });

  it("lists red calls for stand-up with the hard-fail reason", () => {
    expect(email.html).toContain("Red calls to review in stand-up");
    expect(email.html).toContain("A fee or package quoted");
  });
});

describe("the weekly roll-up emails", () => {
  const r = rollup(weekPeriod(REPORT_DATE), PEOPLE, calls, []);

  it("names the week, the team average and the count in the subject", () => {
    expect(teamRollupEmail(r, SITE).subject).toMatch(/^Weekly call QA, 19 – 25 Oct 2026: average [\d.]+ (Green|Amber|Red) · \d+ scored$/);
  });

  it("ranks people and links the roll-up page", () => {
    const html = teamRollupEmail(r, SITE).html;
    expect(html).toContain("Leaderboard");
    expect(html).toContain(`${SITE}/rollups?week=2026-10-19`);
  });

  it("gives each person their own week with calls to listen back to", () => {
    const person = r.people[0];
    const email = personRollupEmail(person, r, SITE);
    expect(email.subject).toMatch(/^Your week, 19 – 25 Oct 2026: /);
    if (person.best) expect(email.html).toContain(`${SITE}/calls/${person.best.id}`);
  });

  it("shows the change against last week with an arrow, not colour alone", () => {
    const withPrevious = rollup(weekPeriod(REPORT_DATE), PEOPLE, calls, calls.map((c) => (c.final ? { ...c, final: { ...c.final, score: 50 } } : c)));
    expect(teamRollupEmail(withPrevious, SITE).html).toMatch(/[▲▼] [\d.]+<\/span> <span[^>]*>vs last week/);
  });
});

describe("the dispute email", () => {
  const email = disputeEmail({ who: "Support", client: "Rahul", when: "26 Oct 2026, 11:05", score: 45, band: "red", comment: "I <did> ask the budget at 4:10", link: `${SITE}/calls/x` });

  it("names who, which call and the score in the subject", () => {
    expect(email.subject).toBe("Support disputes a score: Rahul, 26 Oct 2026, 11:05 (45 Red)");
  });

  it("escapes the executive's comment and links to the call", () => {
    expect(email.html).toContain("I &lt;did&gt; ask the budget");
    expect(email.html).toContain(`${SITE}/calls/x`);
    expect(email.text).toContain("Review it: ");
  });
});

describe("the roll-up funnel", () => {
  it("appears in the team email once a lead is reached", () => {
    const r = rollup(weekPeriod(REPORT_DATE), PEOPLE, calls, []);
    const html = teamRollupEmail({ ...r, funnel: { calls: 10, connected: 8, leads: 4, qualified: 3, vcBooked: 2, vcHeld: 1, proposal: 1, won: 0, lost: 1 } }, SITE).html;
    expect(html).toContain("Lead funnel");
    expect(html).toContain("10 calls logged → 8 connected → 4 leads reached · 1 marked lost");
    expect(html).toMatch(/Vision call booked<\/td>.*?2 <span[^>]*>· 50%/);
  });
});

describe("follow-ups in the emails", () => {
  const missed = { phone: "+919800000001", leadId: "lead-1", name: "Mohit", personId: "p", firstAt: "2026-10-27T10:05:00+05:30", lastAt: "2026-10-27T10:30:00+05:30", count: 2, callIds: ["a", "b"], alerted: false };

  it("lists today's follow-ups in the person's email", () => {
    const report = personDayReport(PEOPLE.find((p) => p.role === "executive")!, calls);
    const email = personReportEmail(report, REPORT_DATE, SITE, {
      items: { missed: [missed], callBacks: [{ kind: "call_back", leadId: "lead-2", name: "Asha", city: "Pune", personId: "p", callId: "c", when: "after 4 pm", date: "2026-10-27", quality: "warm", lastCallAt: "2026-10-26T12:00:00+05:30" }], meetings: [], toBook: [] },
      today: "2026-10-27",
    });
    expect(email.html).toContain("Today's follow-ups");
    expect(email.html).toContain("Missed calls to return");
    expect(email.html).toContain("since Today 10:05");
    expect(email.html).toContain("Asha</a> · after 4 pm");
    expect(email.text).toContain("Follow-ups: 1 missed calls to return, 1 call-backs");
  });

  it("alerts an executive to missed calls with a tap-to-call number", () => {
    const email = missedCallsEmail("Support", [missed], "2026-10-27", SITE);
    expect(email.subject).toBe("1 missed call to return");
    expect(email.html).toContain('href="tel:+919800000001"');
    expect(email.html).toContain("missed 2 times, first at Today 10:05");
  });
});

describe("coaching focus in the 8 am email", () => {
  it("shows the focus with yesterday and since it was set", () => {
    const report = personDayReport(PEOPLE.find((p) => p.role === "executive")!, calls);
    const email = personReportEmail(report, REPORT_DATE, SITE, undefined, {
      label: "Do you have a budget set for this project?",
      verb: "asked",
      yesterday: { hit: 2, total: 3 },
      since: { hit: 5, total: 8 },
      setDay: "2026-10-27",
    });
    expect(email.html).toContain("Your coaching focus");
    expect(email.html).toContain("Yesterday asked on 2 of 3 scored calls");
    expect(email.text).toContain("Focus: Do you have a budget set for this project? (yesterday asked on 2 of 3; since 2026-10-27: 5 of 8)");
  });
});
