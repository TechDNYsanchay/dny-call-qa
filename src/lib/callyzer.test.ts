import { describe, expect, it } from "vitest";
import { callTimeToIso, parseCallyzerPayload, toDirection, toE164 } from "./callyzer";

// The sample from Callyzer's "How to manage webhook response" help article.
const CALLYZER_SAMPLE = [
  {
    id: null,
    employeeName: "Nikunj",
    countryCode: "91",
    employeeNumber: "942808xxxx",
    logs: [
      {
        id: "5P2lT3gZySjv66Y5ZtWd-I42pN9g0OMcuKnE1d_k",
        name: "Unknown",
        countryCode: "91",
        number: "1503",
        duration: 4,
        callType: "Outgoing",
        callTime: "2023-02-04 18:09:26",
        note: null,
        recordingURL: null,
        crmStatus: null,
        reminderTime: null,
        createdDate: "2023-02-04, 06:10:08",
        modifiedDate: null,
      },
    ],
  },
];

describe("Callyzer field conversion", () => {
  it("joins country code and number into E.164", () => {
    expect(toE164("91", "9876543210")).toBe("+919876543210");
    expect(toE164("91", "919876543210")).toBe("+919876543210");
    expect(toE164(91, "09876543210")).toBe("+919876543210");
    expect(toE164(null, "98765 43210")).toBe("+919876543210");
    expect(toE164("91", "")).toBeNull();
  });

  it("reads call times as Indian time", () => {
    expect(callTimeToIso("2023-02-04 18:09:26")).toBe("2023-02-04T18:09:26+05:30");
    expect(callTimeToIso("2023-02-04 18:09")).toBe("2023-02-04T18:09:00+05:30");
    expect(callTimeToIso("2023-02-04T12:39:26Z")).toBe("2023-02-04T12:39:26Z");
    expect(callTimeToIso("yesterday")).toBeNull();
  });

  it("maps call types", () => {
    expect(toDirection("Outgoing")).toBe("outgoing");
    expect(toDirection("MISSED")).toBe("missed");
    expect(toDirection("Unknown type")).toBe("other");
  });
});

describe("Callyzer webhook payload", () => {
  it("reads Callyzer's published sample", () => {
    const parsed = parseCallyzerPayload(CALLYZER_SAMPLE)!;
    expect(parsed.skipped).toEqual([]);
    expect(parsed.calls).toEqual([
      {
        sourceId: "5P2lT3gZySjv66Y5ZtWd-I42pN9g0OMcuKnE1d_k",
        agentPhone: "+91942808",
        agentName: "Nikunj",
        clientPhone: "+911503",
        clientName: null,
        startedAt: "2023-02-04T18:09:26+05:30",
        durationSec: 4,
        direction: "outgoing",
        recordingUrl: null,
        notScored: "under_2_min",
      },
    ]);
  });

  it("queues a long call for transcription even before its recording syncs", () => {
    const parsed = parseCallyzerPayload({
      employeeNumber: "9800000001",
      logs: [{ id: "a", number: "9811111111", duration: 400, callType: "Outgoing", callTime: "2026-10-20 10:00:00", recordingURL: null }],
    })!;
    expect(parsed.calls[0].notScored).toBeNull();
  });

  it("only accepts https recording links", () => {
    const parsed = parseCallyzerPayload([
      {
        employeeNumber: "9800000001",
        logs: [
          { id: "a", duration: 300, callTime: "2026-10-20 10:00:00", recordingURL: "http://example.com/a.mp3" },
          { id: "b", duration: 300, callTime: "2026-10-20 10:05:00", recordingURL: "https://example.com/b.mp3" },
        ],
      },
    ])!;
    expect(parsed.calls.map((c) => c.recordingUrl)).toEqual([null, "https://example.com/b.mp3"]);
  });

  it("skips unreadable logs without dropping the rest", () => {
    const parsed = parseCallyzerPayload([
      {
        employeeNumber: "9800000001",
        logs: [
          { id: "ok", duration: 200, callTime: "2026-10-20 10:00:00" },
          { id: "bad-time", duration: 200, callTime: "not a time" },
          { duration: 200 },
        ],
      },
    ])!;
    expect(parsed.calls.map((c) => c.sourceId)).toEqual(["ok"]);
    expect(parsed.skipped).toHaveLength(2);
  });

  it("rejects something that isn't a Callyzer payload", () => {
    expect(parseCallyzerPayload("hello")).toBeNull();
    expect(parseCallyzerPayload([{ logs: "nope" }])).toBeNull();
  });
});
