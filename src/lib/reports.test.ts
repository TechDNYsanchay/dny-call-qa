import { describe, expect, it } from "vitest";
import { CALLS, PEOPLE, PREVIOUS_DAYS } from "@/lib/data/sample-data";
import { CallResultSchema } from "@/lib/scoring/schema";
import { consentStated, personDayReport, teamSummary } from "./reports";

const calls = [...CALLS].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const getCall = (id: string) => CALLS.find((c) => c.id === id);
const getPerson = (id: string) => PEOPLE.find((p) => p.id === id);

describe("sample data", () => {
  it("every sample model result passes the scoring schema", () => {
    for (const call of calls.filter((c) => c.result)) {
      const parsed = CallResultSchema.safeParse(call.result);
      expect(parsed.success, `${call.id}: ${parsed.error?.message}`).toBe(true);
    }
  });

  it("is scored by the real scoring code", () => {
    expect(getCall("c-101")?.final).toMatchObject({ score: 90, band: "green" });
    // 17-minute call: Short and precise forced to 0, and a fee was quoted
    expect(getCall("c-104")?.final).toMatchObject({ score: 40, band: "red", hardFails: ["fee_or_package_quoted"] });
    expect(getCall("c-104")?.final?.levels.short_precise).toBe(0);
    expect(getCall("c-108")?.final).toMatchObject({ score: 77.5, band: "amber" });
  });

  it("logs short, declined and missing calls without scoring them", () => {
    expect(getCall("c-102")?.notScored).toBe("under_2_min");
    expect(getCall("c-103")?.notScored).toBe("recording_missing");
    expect(getCall("c-107")?.notScored).toBe("recording_declined");
  });
});

describe("daily QA report", () => {
  it("counts a missing recording as a flag, not a zero", () => {
    const report = personDayReport(getPerson("aisha")!, calls);
    expect(report.average).toBe(90);
    expect(report.notRecorded).toBe(1);
    expect(report.notScored).toBe(1);
    expect(report.conversion).toContainEqual({ label: "VCs booked", value: "1 (100%)" });
  });

  it("averages the day and takes fixes from the weakest call first", () => {
    const report = personDayReport(getPerson("rohan")!, calls);
    expect(report.average).toBe(57.5);
    expect(report.band).toBe("red");
    expect(report.hardFailCalls).toBe(1);
    expect(report.fixes[0].callId).toBe("c-104");
    expect(report.strengths[0].callId).toBe("c-105");
    expect(report.fixes).toHaveLength(2);
  });

  it("reports VC conversion for consultants", () => {
    const report = personDayReport(getPerson("kabir")!, calls);
    expect(report.conversion).toContainEqual({ label: "Proposal dates fixed", value: "1 of 1" });
  });

  it("builds the founders' summary", () => {
    const team = teamSummary(PEOPLE, calls, PREVIOUS_DAYS);
    expect(team.redCalls.map((c) => c.id)).toEqual(["c-104"]);
    expect(team.vcsBooked).toBe(2);
    expect(team.proposalDatesFixed).toBe(1);
    expect(team.rows.every((r) => r.trend.length === 7)).toBe(true);
    expect(team.rows.map((r) => r.report.person.id)).not.toContain("founder");
    expect(team.caseStudies).toEqual([{ name: "Kalaburagi hotel F&B", count: 1 }]);
  });
});

describe("missed questions", () => {
  it("counts only mandatory questions, not good-to-have ones", () => {
    const scored = calls.find((c) => c.final && c.result?.stream === "first_call")!;
    const call = structuredClone(scored);
    call.result!.coverage = [
      { question: "fc07", status: "missed", evidence: [] },
      { question: "fc09", status: "missed", evidence: [] },
    ];
    const report = personDayReport(getPerson(call.personId)!, [call]);
    expect(report.missedQuestions.map((m) => m.id)).toEqual(["fc07"]);
  });
});

describe("recording consent", () => {
  const scored = CALLS.filter((c) => c.final);
  const firstCalls = scored.filter((c) => c.result?.stream === "first_call");
  const stated = firstCalls.filter((c) => c.result?.stream === "first_call" && c.result.consent === "stated").length;

  it("counts the scored first calls where the client was told the call is recorded", () => {
    expect(consentStated(scored)).toEqual({ stated, of: firstCalls.length });
    expect(consentStated([])).toEqual({ stated: 0, of: 0 });
  });

  it("shows on each executive's report and the team summary", () => {
    const team = teamSummary(PEOPLE, CALLS, PREVIOUS_DAYS);
    expect(team.consentStated).toBe(stated);
    const exec = team.rows.find((r) => r.report.person.role === "executive")!.report;
    expect(exec.conversion.map((c) => c.label)).toContain("Told the client the call is recorded");
  });
});
