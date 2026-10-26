import { describe, expect, it } from "vitest";
import { CALLS, PEOPLE } from "@/lib/data/sample-data";
import { daysOf, monthPeriod, rollup, weekPeriod, weekStart } from "./rollups";

describe("periods", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // a Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week before
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
  });

  it("labels weeks, including across months", () => {
    expect(weekPeriod("2026-10-21")).toMatchObject({ from: "2026-10-19", to: "2026-10-25", label: "Week of 19 – 25 Oct 2026" });
    expect(weekPeriod("2026-10-28").label).toBe("Week of 26 Oct – 1 Nov 2026");
    expect(weekPeriod("2026-10-21").previous).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("knows month lengths and the year boundary", () => {
    expect(monthPeriod("2026-10")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", label: "October 2026" });
    expect(monthPeriod("2028-02").to).toBe("2028-02-29");
    expect(monthPeriod("2026-01").previous).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(daysOf(monthPeriod("2026-11"))).toHaveLength(30);
  });
});

describe("roll-up", () => {
  const calls = [...CALLS].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const week = weekPeriod(calls[0].startedAt.slice(0, 10));
  const r = rollup(week, PEOPLE, calls, []);

  it("averages the period's scored calls and leaves out readers", () => {
    expect(r.scored).toBe(calls.filter((c) => c.final).length);
    expect(r.people.every((p) => ["executive", "consultant"].includes(p.person.role))).toBe(true);
    expect(r.change).toBeNull(); // nothing to compare with
  });

  it("ranks people by average, best first", () => {
    const averages = r.people.map((p) => p.average ?? -1);
    expect(averages).toEqual([...averages].sort((a, b) => b - a));
  });

  it("counts hard fails by type with their labels", () => {
    expect(r.hardFails.find((h) => h.id === "fee_or_package_quoted")?.label).toBe("A fee or package quoted");
  });

  it("compares with the previous period", () => {
    const again = rollup(week, PEOPLE, calls, calls);
    expect(again.change).toBe(0);
  });
});
