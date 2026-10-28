import { describe, expect, it } from "vitest";
import { CALLS, PEOPLE, PREVIOUS_DAYS } from "@/lib/data/sample-data";
import { briefingEmail, teamSummaryEmail } from "@/lib/email/report-emails";
import { teamSummary } from "@/lib/reports";
import type { FirstCallCapture } from "@/lib/scoring/schema";
import { buildBriefing, lakhsIn, packageHint, stageLean } from "./briefing";

const firstCall = CALLS.find((c) => c.result?.stream === "first_call" && c.final)!;
const sampleCapture = (firstCall.result as { capture: FirstCallCapture }).capture;
const capture = (over: Partial<FirstCallCapture>): FirstCallCapture => ({ ...sampleCapture, ...over });
const SITE = "https://dny-call-qa.vercel.app";

describe("the Stage 1 / 2 lean from the first call (Service Master, tab 1)", () => {
  it("treats chains, international projects and investors as Stage 2", () => {
    for (const clientType of ["chain", "international", "investor"] as const) expect(stageLean(capture({ clientType })).label).toBe("Stage 2");
  });

  it("splits running businesses at ₹75 L of sales a month", () => {
    expect(stageLean(capture({ clientType: "running_business", rbMonthlySales: "about 40 L a month" })).label).toBe("Stage 1");
    expect(stageLean(capture({ clientType: "running_business", rbMonthlySales: "1.2 Cr a month" })).label).toBe("Stage 2");
    expect(stageLean(capture({ clientType: "running_business", rbMonthlySales: null })).label).toBe("Not clear yet");
  });

  it("counts a startup's signals, and leans Stage 2 from three", () => {
    const strong = stageLean(
      capture({ clientType: "startup", budgetBand: "50l_to_1cr", aspirationalBrand: "Third Wave", property: { finalised: true, area: "Baner", sizeSqft: 3500, floor: null, rentPerMonthInr: 250_000 } }),
    );
    expect(strong.label).toBe("Leaning Stage 2");
    expect(strong.signals).toHaveLength(4);
    expect(strong.listenFor.length).toBeGreaterThan(0);
    const light = stageLean(capture({ clientType: "startup", budgetBand: "under_50l", aspirationalBrand: null, property: null, format: "qsr" }));
    expect(light.label).toBe("Stage 1");
  });

  it("reads amounts in lakh and crore", () => {
    expect(lakhsIn("around 40 lakh")).toBe(40);
    expect(lakhsIn("₹1.5 Cr")).toBe(150);
    expect(lakhsIn("not sure")).toBeNull();
  });
});

describe("the likely package", () => {
  it("follows the client type first, then the format", () => {
    expect(packageHint(capture({ clientType: "startup", format: "cafe" }))).toBe("P03 · Specialty cafe / coffee house (new)");
    expect(packageHint(capture({ clientType: "running_business", format: "cafe" }))).toBe("P09 · Running business revamp, pilot outlet");
    expect(packageHint(capture({ clientType: "startup", format: "other" }))).toBeNull();
    expect(packageHint(null)).toBeNull();
  });
});

describe("a brief built from a scored first call", () => {
  const b = buildBriefing({ leadId: "lead-1", name: "Sameer Reddy", phone: "+919820012345", ownerId: null, capture: sampleCapture, firstCall });

  it("splits what we know from what is still to ask, and keeps the meeting", () => {
    expect(b.known.length).toBeGreaterThan(0);
    expect(b.known.every(([, value]) => value !== "Not captured")).toBe(true);
    expect([...b.known.map(([l]) => l), ...b.unknown]).not.toContain("VC booked");
    expect(b.meeting.when).toBe(sampleCapture.vcDateTime);
  });

  it("lists the first call's gaps and the client's own words", () => {
    const result = firstCall.result!;
    const gaps = result.coverage.filter((c) => c.status === "missed" || c.status === "partly").length;
    expect(b.firstCallGaps).toHaveLength(gaps);
    expect(b.inTheirWords.length).toBeLessThanOrEqual(3);
    expect(b.firstCall?.id).toBe(firstCall.id);
    expect(b.reminders).toHaveLength(6);
  });

  it("goes out as the consultant's morning email, with the brief linked", () => {
    const email = briefingEmail(b, SITE);
    expect(email.subject).toMatch(/^Vision call today: /);
    expect(email.html).toContain(`${SITE}/leads/lead-1/brief`);
    expect(email.html).toContain("How to run the call");
    expect(email.text).toContain("The full brief:");
  });

  it("is listed in the founders' email on the day", () => {
    const html = teamSummaryEmail(teamSummary(PEOPLE, CALLS, PREVIOUS_DAYS), "2026-10-20", SITE, undefined, [], [b]).html;
    expect(html).toContain("Vision calls today");
    expect(html).toContain("/leads/lead-1/brief");
  });
});
