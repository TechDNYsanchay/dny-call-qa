// Call measurements computed in code from transcript timings (brief sections 3-5).
// The model is given these as facts; it never estimates them itself.

import { secondsFrom } from "@/lib/format";

export type SpeakerRole = "agent" | "client" | "unknown";

/**
 * Topic tags Claude assigns to each stretch of a VC so code can add up minutes per topic.
 * "value" is a case study, benchmark or market observation tied to the client's own concept;
 * "dny_credentials" is DNY presenting itself.
 */
export type Topic = "client_story" | "value" | "dny_credentials" | "services" | "fees" | "other";

export interface Segment {
  role: SpeakerRole;
  startSec: number;
  endSec: number;
  text: string;
  topic?: Topic;
}

export interface CallMetrics {
  durationSec: number;
  agentTalkSec: number;
  clientTalkSec: number;
  /** Client's share of all talk time, 0-1. */
  clientShare: number;
  /** Agent's share of talk time in the first half of the call, 0-1. */
  agentShareFirstHalf: number;
  /** Agent's share of all talk time, 0-1. */
  agentShareOverall: number;
  silencesOver8s: number;
  longestSilenceSec: number;
  credentialsSec: number;
  /** Service talk as a share of the agent's own talk time, 0-1. */
  serviceShareOfAgent: number;
}

export const SILENCE_THRESHOLD_SEC = 8;

const length = (s: Segment) => Math.max(0, s.endSec - s.startSec);

function talkSeconds(segments: Segment[], role: SpeakerRole, untilSec = Infinity): number {
  return segments
    .filter((s) => s.role === role)
    .reduce((sum, s) => sum + Math.max(0, Math.min(s.endSec, untilSec) - s.startSec), 0);
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** Gaps between speech, ignoring the ring before the first word and the time after the last. */
export function silences(segments: Segment[]): number[] {
  const sorted = [...segments].sort((a, b) => a.startSec - b.startSec);
  const gaps: number[] = [];
  let speechEnd = -Infinity;
  for (const s of sorted) {
    if (speechEnd !== -Infinity && s.startSec > speechEnd) gaps.push(s.startSec - speechEnd);
    speechEnd = Math.max(speechEnd, s.endSec);
  }
  return gaps;
}

/** Gives each segment the topic of the tagged stretch it starts in (VC topic tags use "m:ss"). */
export function applyTopics<T extends Segment>(segments: T[], topics: { from: string; to: string; topic: Topic }[]): T[] {
  const ranges = topics.map((t) => ({ from: secondsFrom(t.from), to: secondsFrom(t.to), topic: t.topic }));
  return segments.map((s) => {
    const hit = ranges.find((r) => s.startSec >= r.from && s.startSec < r.to);
    return hit ? { ...s, topic: hit.topic } : s;
  });
}

export function computeMetrics(segments: Segment[], durationSec: number): CallMetrics {
  const agentTalkSec = talkSeconds(segments, "agent");
  const clientTalkSec = talkSeconds(segments, "client");
  const totalTalk = agentTalkSec + clientTalkSec;

  const half = durationSec / 2;
  const agentFirstHalf = talkSeconds(segments, "agent", half);
  const clientFirstHalf = talkSeconds(segments, "client", half);

  const gaps = silences(segments);
  const agentTopicSec = (topic: Topic) =>
    segments.filter((s) => s.role === "agent" && s.topic === topic).reduce((sum, s) => sum + length(s), 0);

  return {
    durationSec,
    agentTalkSec,
    clientTalkSec,
    clientShare: share(clientTalkSec, totalTalk),
    agentShareFirstHalf: share(agentFirstHalf, agentFirstHalf + clientFirstHalf),
    agentShareOverall: share(agentTalkSec, totalTalk),
    silencesOver8s: gaps.filter((g) => g > SILENCE_THRESHOLD_SEC).length,
    longestSilenceSec: gaps.length ? Math.max(...gaps) : 0,
    credentialsSec: agentTopicSec("dny_credentials"),
    serviceShareOfAgent: share(agentTopicSec("services"), agentTalkSec),
  };
}
