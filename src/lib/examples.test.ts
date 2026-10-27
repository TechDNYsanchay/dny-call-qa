import { describe, expect, it } from "vitest";
import { CALLS } from "@/lib/data/sample-data";
import type { CallRecord } from "@/lib/data/types";
import { clipBounds, exampleCandidates, secondsFrom } from "./examples";
import { bestCall } from "./rollups";

describe("examples", () => {
  it("reads timestamps", () => {
    expect(secondsFrom("1:05")).toBe(65);
    expect(secondsFrom("1:02:05")).toBe(3725);
    expect(secondsFrom("soon")).toBeNaN();
  });

  it("offers covered questions from scored first calls, best call first, skipping pinned ones", () => {
    const scored = CALLS.filter((c) => c.final && c.result?.stream === "first_call");
    const all = exampleCandidates(scored, new Set());
    expect(all.length).toBeGreaterThan(0);
    for (const q of new Set(all.map((c) => c.questionId))) {
      const scores = all.filter((c) => c.questionId === q).map((c) => c.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(scores.length).toBeLessThanOrEqual(3);
    }
    const first = all[0];
    expect(exampleCandidates(scored, new Set([`${first.questionId}:${first.callId}`])).some((c) => c.questionId === first.questionId && c.callId === first.callId)).toBe(false);
  });

  it("clips from just before the line to the end of the reply, at most 45 seconds", () => {
    const segments = [
      { startSec: 0, endSec: 10 },
      { startSec: 10, endSec: 14 },
      { startSec: 14, endSec: 30 },
      { startSec: 30, endSec: 200 },
    ];
    expect(clipBounds(segments, 10)).toEqual({ start: 9, end: 54 }); // the reply ends at 200: capped
    expect(clipBounds(segments.slice(0, 3), 10)).toEqual({ start: 9, end: 30 });
    // A client's answer: start at the question before it.
    expect(clipBounds(segments.slice(0, 3), 10, "client")).toEqual({ start: 0, end: 30 });
  });
});

describe("call of the week", () => {
  it("is the best call that isn't Red", () => {
    const withScore = (id: string, score: number, band: "red" | "amber" | "green"): CallRecord => ({ ...CALLS[0], id, final: { ...CALLS.find((c) => c.final)!.final!, score, band } });
    expect(bestCall([withScore("a", 90, "red"), withScore("b", 72, "amber"), withScore("c", 65, "amber")])?.id).toBe("b");
    expect(bestCall([withScore("a", 40, "red")])).toBeNull();
  });
});
