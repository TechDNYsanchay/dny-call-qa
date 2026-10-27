import { describe, expect, it } from "vitest";
import { CALLS } from "@/lib/data/sample-data";
import type { CallRecord } from "@/lib/data/types";
import { formatWait, hourLabel, missedResponses, pickupByHour, summariseResponses } from "./call-patterns";

let n = 0;
const call = (time: string, over: Partial<CallRecord> = {}): CallRecord => ({
  ...CALLS[0],
  id: `c${++n}`,
  personId: "p1",
  startedAt: `2026-10-27T${time}:00+05:30`,
  durationSec: 0,
  direction: "outgoing",
  clientPhone: "+919800000001",
  client: { name: "Mohit", city: "" },
  missedHandled: false,
  ...over,
});
const NONE = new Set<string>();

describe("pickup by hour", () => {
  it("counts outgoing attempts and connections per IST hour, filling quiet hours", () => {
    const hours = pickupByHour([call("10:05", { durationSec: 90 }), call("10:40"), call("12:10", { durationSec: 30 }), call("11:00", { direction: "incoming", durationSec: 60 })]);
    expect(hours).toEqual([
      { hour: 10, attempts: 2, connected: 1, incoming: 0 },
      { hour: 11, attempts: 0, connected: 0, incoming: 1 },
      { hour: 12, attempts: 1, connected: 1, incoming: 0 },
    ]);
  });
});

describe("response to missed calls", () => {
  it("times the call back from the first miss, counting repeat misses once", () => {
    const list = missedResponses([call("10:00", { direction: "missed" }), call("10:20", { direction: "missed" }), call("11:35")], NONE);
    expect(list).toEqual([expect.objectContaining({ missedAt: "2026-10-27T10:00:00+05:30", returnedAt: "2026-10-27T11:35:00+05:30", minutes: 95 })]);
  });

  it("counts never-returned, handled and junk separately", () => {
    const list = missedResponses(
      [
        call("10:00", { direction: "missed" }),
        call("10:00", { direction: "missed", clientPhone: "+919800000002", missedHandled: true }),
        call("10:00", { direction: "missed", clientPhone: "+919800000003", client: { name: "Junk", city: "" } }),
      ],
      NONE,
    );
    expect(summariseResponses(list)).toEqual({ missed: 2, withinTarget: 0, later: 0, never: 1, handled: 1, medianMinutes: null });
  });

  it("summarises the time to call back", () => {
    const list = missedResponses(
      [call("09:00", { direction: "missed" }), call("09:30"), call("10:00", { direction: "missed", clientPhone: "+919800000002" }), call("15:00", { clientPhone: "+919800000002" })],
      NONE,
    );
    expect(summariseResponses(list)).toMatchObject({ missed: 2, withinTarget: 1, later: 1, never: 0, medianMinutes: 165 });
  });

  it("formats waits and hours", () => {
    expect([formatWait(45), formatWait(95), formatWait(120), formatWait(2900)]).toEqual(["45 min", "1 h 35 min", "2 h", "2 days"]);
    expect([hourLabel(9), hourLabel(12), hourLabel(13), hourLabel(0)]).toEqual(["9 am", "12 pm", "1 pm", "12 am"]);
  });
});
