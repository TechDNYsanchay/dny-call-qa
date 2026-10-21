import { describe, expect, it } from "vitest";
import { addDays, formatClock, formatDay, formatTimestamp, istDayRange, toIst } from "./format";

describe("IST dates", () => {
  it("converts UTC timestamps from Supabase to IST wall-clock time", () => {
    expect(toIst("2026-10-20T04:42:00+00:00")).toBe("2026-10-20T10:12:00+05:30");
    expect(toIst("2026-10-20T19:00:00Z")).toBe("2026-10-21T00:30:00+05:30");
    expect(toIst("2026-10-20T10:12:00+05:30")).toBe("2026-10-20T10:12:00+05:30");
  });

  it("shifts days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-20", -6)).toBe("2026-10-14");
  });

  it("gives the IST day as a half-open range", () => {
    expect(istDayRange("2026-10-20")).toEqual(["2026-10-20T00:00:00+05:30", "2026-10-21T00:00:00+05:30"]);
  });

  it("formats for display", () => {
    expect(formatDay("2026-10-20T10:12:00+05:30")).toBe("20 Oct 2026");
    expect(formatClock("2026-10-20T10:12:00+05:30")).toBe("10:12");
    expect(formatTimestamp(3125)).toBe("52:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });
});
