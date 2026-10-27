import { describe, expect, it } from "vitest";
import { CALLS } from "@/lib/data/sample-data";
import type { CallRecord } from "@/lib/data/types";
import { questionsFor } from "@/lib/scoring/call-sheets";
import { focusHit, focusLabel, focusProgress, share, type Focus } from "./coaching";

const scored = CALLS.find((c) => c.final && c.result?.stream === "first_call")!;
const withBudget = (day: string, status: "covered" | "partly" | "missed", cta: 0 | 5 | 10 = 10): CallRecord => ({
  ...scored,
  id: `${day}-${status}-${Math.random()}`,
  personId: "p1",
  startedAt: `${day}T11:00:00+05:30`,
  result: { ...scored.result!, coverage: [{ question: "fc10", status, evidence: status === "missed" ? [] : scored.result!.coverage.find((c) => c.evidence.length)!.evidence }] } as CallRecord["result"],
  final: { ...scored.final!, levels: { ...scored.final!.levels, cta } },
});
const focus: Focus = { id: "f", personId: "p1", kind: "question", targetId: "fc10", note: null, setAt: "2026-10-27T10:00:00+05:30", setBy: null };

describe("coaching focus", () => {
  it("labels a question by its text and an area by its name", () => {
    expect(focusLabel(focus, questionsFor("first_call"))).toBe("Do you have a budget set for this project?");
    expect(focusLabel({ kind: "area", targetId: "cta" }, [])).toBe("CTA: get to Met");
  });

  it("counts a question as asked when covered or partly, and an area only when Met", () => {
    expect(focusHit(withBudget("2026-10-27", "partly"), focus)).toBe(true);
    expect(focusHit(withBudget("2026-10-27", "missed"), focus)).toBe(false);
    expect(focusHit(withBudget("2026-10-27", "covered", 5), { kind: "area", targetId: "cta" })).toBe(false);
    expect(focusHit({ ...scored, final: undefined }, focus)).toBeNull();
  });

  it("compares the days since the focus was set with the week before", () => {
    const p = focusProgress(
      [withBudget("2026-10-22", "missed"), withBudget("2026-10-23", "missed"), withBudget("2026-10-24", "covered"), withBudget("2026-10-27", "covered"), withBudget("2026-10-28", "missed"), withBudget("2026-10-28", "covered")],
      focus,
      "2026-10-28",
    );
    expect(p.before).toEqual({ hit: 1, total: 3 });
    expect(p.since).toEqual({ hit: 2, total: 3 });
    expect(p.days.map((d) => [d.day, d.hit, d.total])).toEqual([["2026-10-27", 1, 1], ["2026-10-28", 1, 2]]);
    expect(share(p.since)).toBe(67);
  });
});
