import { describe, expect, it } from "vitest";
import { addDays, formatClock, formatDay, formatPhone, formatShortDay, formatTimestamp, istDayRange, parseDayParam, toIst } from "./format";

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

describe("day buttons and phone numbers", () => {
  it("reads ?day= only when it's a date", () => {
    expect(parseDayParam("2026-10-23")).toBe("2026-10-23");
    expect(parseDayParam("23-10-2026")).toBeNull();
    expect(parseDayParam(["2026-10-23"])).toBeNull();
    expect(parseDayParam(undefined)).toBeNull();
  });

  it("formats short days and Indian numbers", () => {
    expect(formatShortDay("2026-10-05")).toBe("5 Oct");
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
  });
});
