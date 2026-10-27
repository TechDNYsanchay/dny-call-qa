import { describe, expect, it } from "vitest";
import { CALLS } from "@/lib/data/sample-data";
import type { CallRecord } from "@/lib/data/types";
import { dateFromText, followUps, isOverdue, leadFollowUps, openMissedCalls, relativeDay } from "./follow-ups";

const scoredFirst = CALLS.find((c) => c.final && c.result?.stream === "first_call")!;
let n = 0;
/** A call at `time` on 27 Oct 2026 (IST). */
function call(time: string, over: Partial<CallRecord> = {}): CallRecord {
  return {
    ...scoredFirst,
    id: `call-${++n}`,
    personId: "exec-1",
    startedAt: `2026-10-27T${time}:00+05:30`,
    durationSec: 0,
    clientPhone: "+919800000001",
    client: { name: "Mohit", city: "" },
    direction: "missed",
    final: undefined,
    result: undefined,
    missedHandled: false,
    missedAlerted: false,
    ...over,
  };
}
const NO_TEAM = new Set<string>();

describe("missed calls", () => {
  it("groups repeat misses from one number until someone calls back", () => {
    const items = openMissedCalls([call("10:00"), call("10:30", { direction: "rejected" })], NO_TEAM);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ count: 2, firstAt: "2026-10-27T10:00:00+05:30", lastAt: "2026-10-27T10:30:00+05:30", name: "Mohit" });
  });

  it("clears on an outgoing call, even unanswered, or a connected one", () => {
    expect(openMissedCalls([call("10:00"), call("11:00", { direction: "outgoing" })], NO_TEAM)).toEqual([]);
    expect(openMissedCalls([call("10:00"), call("11:00", { direction: "incoming", durationSec: 90 })], NO_TEAM)).toEqual([]);
    // Missed again after the call back: open again, counting only the new miss.
    expect(openMissedCalls([call("10:00"), call("11:00", { direction: "outgoing" }), call("12:00")], NO_TEAM)[0].count).toBe(1);
  });

  it("leaves out handled misses, numbers saved as junk, and calls between team phones", () => {
    expect(openMissedCalls([call("10:00", { missedHandled: true })], NO_TEAM)).toEqual([]);
    expect(openMissedCalls([call("10:00", { client: { name: "B Tiwari Junk", city: "" } })], NO_TEAM)).toEqual([]);
    expect(openMissedCalls([call("10:00")], new Set(["+919800000001"]))).toEqual([]);
  });

  it("is overdue after two hours", () => {
    const [item] = openMissedCalls([call("10:00")], NO_TEAM);
    expect(isOverdue(item, Date.parse("2026-10-27T11:59:00+05:30"))).toBe(false);
    expect(isOverdue(item, Date.parse("2026-10-27T12:00:00+05:30"))).toBe(true);
  });
});

describe("lead follow-ups", () => {
  const capture = scoredFirst.result!.stream === "first_call" ? scoredFirst.result!.capture : null!;
  const scored = (time: string, lead: string, c: Partial<typeof capture>, over: Partial<CallRecord> = {}) =>
    call(time, {
      leadId: lead,
      direction: "outgoing",
      durationSec: 400,
      final: scoredFirst.final,
      result: { ...scoredFirst.result!, capture: { ...capture, vcDateTime: null, vcDate: null, callBack: null, ...c } } as CallRecord["result"],
      ...over,
    });

  it("lists an upcoming meeting, a promised call-back and a warm lead with no meeting", () => {
    const items = leadFollowUps(
      [
        scored("10:00", "a", { leadQuality: "hot", vcDateTime: "Thursday 29 Oct 2026, 4 pm", vcDate: "2026-10-29" }),
        scored("11:00", "b", { leadQuality: "warm", callBack: { when: "tomorrow evening", date: "2026-10-28" } }),
        scored("12:00", "c", { leadQuality: "warm" }),
        scored("13:00", "d", { leadQuality: "cold" }),
      ],
      "2026-10-27",
    );
    expect(items.map((f) => [f.leadId, f.kind, f.date])).toEqual([
      ["b", "call_back", "2026-10-28"],
      ["a", "meeting", "2026-10-29"],
      ["c", "book_meeting", null],
    ]);
  });

  it("drops a call-back or booking once a later call connects, and leads past open", () => {
    const later = call("15:00", { leadId: "b", direction: "outgoing", durationSec: 60 });
    expect(leadFollowUps([scored("11:00", "b", { leadQuality: "warm", callBack: { when: "at 3", date: null } }), later], "2026-10-27")).toEqual([]);
    expect(leadFollowUps([scored("11:00", "c", { leadQuality: "warm" }, { leadStatus: "lost" })], "2026-10-27")).toEqual([]);
  });

  it("drops meetings that have passed, reading the date from the text for older results", () => {
    const old = scored("10:00", "a", { leadQuality: "hot", vcDateTime: "Sunday 25 Oct 2026, 6 pm", vcDate: undefined });
    expect(leadFollowUps([old], "2026-10-27")).toEqual([]);
    expect(leadFollowUps([old], "2026-10-25")[0]).toMatchObject({ kind: "meeting", date: "2026-10-25" });
  });

  it("splits by person", () => {
    const f = followUps([call("10:00"), call("10:05", { personId: "exec-2", clientPhone: "+919800000002" })], NO_TEAM, "2026-10-27", "exec-2");
    expect(f.missed.map((m) => m.personId)).toEqual(["exec-2"]);
  });
});

describe("dates", () => {
  it("reads a date out of what was said", () => {
    expect(dateFromText("Sunday 25 Oct 2026, 6:00 to 6:30 pm", "2026-10-22")).toBe("2026-10-25");
    expect(dateFromText("2nd November, video", "2026-10-30")).toBe("2026-11-02");
    expect(dateFromText("5 Jan, after the holidays", "2026-12-20")).toBe("2027-01-05");
    expect(dateFromText("tomorrow evening", "2026-10-27")).toBeNull();
  });

  it("names nearby days", () => {
    expect(relativeDay("2026-10-27", "2026-10-27")).toBe("Today");
    expect(relativeDay("2026-10-28", "2026-10-27")).toBe("Tomorrow");
    expect(relativeDay("2026-10-30", "2026-10-27")).toBeNull();
  });
});
