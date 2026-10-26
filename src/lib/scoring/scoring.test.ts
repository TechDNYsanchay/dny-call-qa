import { describe, expect, it } from "vitest";
import { band, callScore, dayAverage, finaliseScore, scoringEligibility, type Level } from "./compute";
import { computeMetrics, silences, type Segment } from "./metrics";
import {
  FIRST_CALL_AREAS,
  FIRST_CALL_HARD_FAILS,
  VISION_CALL_AREAS,
  VISION_CALL_HARD_FAILS,
} from "./scorecards";
import {
  FIRST_CALL_JUDGED_HARD_FAILS,
  FirstCallResultSchema,
  VISION_CALL_JUDGED_HARD_FAILS,
  speakerLabels,
  VisionCallResultSchema,
} from "./schema";
import { expectedQuestions } from "./call-sheets";

const all = (areas: readonly { id: string }[], level: Level) =>
  Object.fromEntries(areas.map((a) => [a.id, level])) as Record<string, Level>;

const metrics = (overrides: Partial<ReturnType<typeof computeMetrics>> = {}) => ({
  ...computeMetrics([], 0),
  durationSec: 8 * 60,
  clientShare: 0.55,
  ...overrides,
});

describe("scorecards match the brief", () => {
  it("weights sum to 100", () => {
    expect(FIRST_CALL_AREAS.reduce((s, a) => s + a.weight, 0)).toBe(100);
    expect(VISION_CALL_AREAS.reduce((s, a) => s + a.weight, 0)).toBe(100);
  });

  it("schema areas are exactly the scorecard areas", () => {
    expect(Object.keys(FirstCallResultSchema.shape.areas.shape)).toEqual(FIRST_CALL_AREAS.map((a) => a.id));
    expect(Object.keys(VisionCallResultSchema.shape.areas.shape)).toEqual(VISION_CALL_AREAS.map((a) => a.id));
  });

  it("the model judges every hard fail that code does not measure", () => {
    const judged = (fails: readonly { id: string; measured: boolean }[]) => fails.filter((f) => !f.measured).map((f) => f.id);
    expect([...FIRST_CALL_JUDGED_HARD_FAILS]).toEqual(judged(FIRST_CALL_HARD_FAILS));
    expect([...VISION_CALL_JUDGED_HARD_FAILS]).toEqual(judged(VISION_CALL_HARD_FAILS));
  });

  it("drops RB-only questions for a startup", () => {
    const startup = expectedQuestions("first_call", false).map((q) => q.id);
    expect(startup).not.toContain("fc06");
    expect(startup).not.toContain("fc09"); // good to have, not expected
    expect(expectedQuestions("first_call", true).map((q) => q.id)).toContain("fc06");
  });
});

describe("call score and band", () => {
  it("scores 0 to 100", () => {
    expect(callScore("first_call", all(FIRST_CALL_AREAS, 10))).toBe(100);
    expect(callScore("vision_call", all(VISION_CALL_AREAS, 0))).toBe(0);
  });

  it("multiplies each level by its weight", () => {
    const levels: Record<string, Level> = {
      opening: 10, short_precise: 5, focus_environment: 10, client_engagement: 5, coverage: 10, cta: 0, compliance: 10,
    };
    // 10 + 7.5 + 15 + 7.5 + 20 + 0 + 5
    expect(callScore("first_call", levels)).toBe(65);
  });

  it("throws when an area has no level", () => {
    expect(() => callScore("first_call", { opening: 10 })).toThrow(/short_precise/);
  });

  it("bands at 80 and 60, and any hard fail is red", () => {
    expect(band(80, 0)).toBe("green");
    expect(band(79.5, 0)).toBe("amber");
    expect(band(60, 0)).toBe("amber");
    expect(band(59.5, 0)).toBe("red");
    expect(band(100, 1)).toBe("red");
  });

  it("averages a person's day over scored calls only", () => {
    expect(dayAverage([80, 65, 72.5])).toBe(72.5);
    expect(dayAverage([])).toBeNull();
  });
});

describe("calls that are logged but not scored", () => {
  it("skips calls under 2 minutes, declined and missing recordings", () => {
    expect(scoringEligibility({ durationSec: 119, recordingStatus: "available" })).toEqual({ eligible: false, reason: "under_2_min" });
    expect(scoringEligibility({ durationSec: 300, recordingStatus: "declined" })).toEqual({ eligible: false, reason: "recording_declined" });
    expect(scoringEligibility({ durationSec: 300, recordingStatus: "pending" })).toEqual({ eligible: false, reason: "recording_pending" });
    expect(scoringEligibility({ durationSec: 300, recordingStatus: "missing" })).toEqual({ eligible: false, reason: "recording_missing" });
    expect(scoringEligibility({ durationSec: 120, recordingStatus: "available" })).toEqual({ eligible: true });
  });
});

describe("rules measured in code", () => {
  it("sets Short and precise to 0 when a first call runs over 15 minutes", () => {
    const result = finaliseScore(
      "first_call",
      { levels: all(FIRST_CALL_AREAS, 10), hardFails: [] },
      metrics({ durationSec: 16 * 60 }),
    );
    expect(result.levels.short_precise).toBe(0);
    expect(result.score).toBe(85);
    expect(result.overrides).toHaveLength(1);
  });

  it("adds the VC hard fail when the client talks under 35% of the time", () => {
    const result = finaliseScore(
      "vision_call",
      { levels: all(VISION_CALL_AREAS, 10), hardFails: [] },
      metrics({ clientShare: 0.3 }),
    );
    expect(result.hardFails).toContain("client_talk_under_35");
    expect(result.band).toBe("red");
  });

  it("does not double-count a hard fail the model also raised", () => {
    const result = finaliseScore(
      "vision_call",
      { levels: all(VISION_CALL_AREAS, 5), hardFails: ["client_talk_under_35", "client_talk_under_35"] },
      metrics({ clientShare: 0.2 }),
    );
    expect(result.hardFails).toEqual(["client_talk_under_35"]);
  });
});

describe("call metrics", () => {
  const segments: Segment[] = [
    { role: "agent", startSec: 2, endSec: 12, text: "Hello, this is Riya from DNY Hospitality." },
    { role: "client", startSec: 12, endSec: 40, text: "Haan, boliye." },
    { role: "agent", startSec: 50, endSec: 60, text: "We have worked with 550+ brands.", topic: "dny_credentials" },
    { role: "client", startSec: 60, endSec: 100, text: "Okay, I am planning a cafe in Pune." },
    { role: "agent", startSec: 100, endSec: 110, text: "Our menu engineering service would help.", topic: "services" },
  ];

  it("splits talk time and ignores the ring before the first word", () => {
    const m = computeMetrics(segments, 120);
    expect(m.agentTalkSec).toBe(30);
    expect(m.clientTalkSec).toBe(68);
    expect(m.clientShare).toBeCloseTo(68 / 98);
    expect(silences(segments)).toEqual([10]);
    expect(m.silencesOver8s).toBe(1);
    expect(m.longestSilenceSec).toBe(10);
  });

  it("measures the first half and the agent's topic time", () => {
    const m = computeMetrics(segments, 120);
    // first 60s: agent 10 + 10 = 20, client 28
    expect(m.agentShareFirstHalf).toBeCloseTo(20 / 48);
    expect(m.credentialsSec).toBe(10);
    expect(m.serviceShareOfAgent).toBeCloseTo(10 / 30);
  });

  it("returns zeros, not NaN, for an empty transcript", () => {
    const m = computeMetrics([], 0);
    expect(m.clientShare).toBe(0);
    expect(m.longestSilenceSec).toBe(0);
  });
});

describe("speaker roles", () => {
  it("takes one label or several per side, for voices the transcription split in two", () => {
    expect(speakerLabels("1")).toEqual(["1"]);
    expect(speakerLabels(["2", "0"])).toEqual(["2", "0"]);
  });
});
