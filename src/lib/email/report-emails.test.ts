import { describe, expect, it } from "vitest";
import { CALLS, PEOPLE, PREVIOUS_DAYS, REPORT_DATE } from "@/lib/data/sample-data";
import { personDayReport, teamSummary } from "@/lib/reports";
import { personReportEmail, teamSummaryEmail } from "./report-emails";

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
    expect(email.subject).toMatch(/^Team call QA, Tue 20 Oct: average [\d.]+ (Green|Amber|Red) · \d+ scored, \d+ hard fails$/);
  });

  it("lists red calls for stand-up with the hard-fail reason", () => {
    expect(email.html).toContain("Red calls to review in stand-up");
    expect(email.html).toContain("A fee or package quoted");
  });
});
