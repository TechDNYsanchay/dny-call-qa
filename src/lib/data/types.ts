import type { Stream } from "@/lib/scoring/call-sheets";
import type { FinalScore, NotScoredReason, RecordingStatus } from "@/lib/scoring/compute";
import type { CallMetrics, SpeakerRole, Topic } from "@/lib/scoring/metrics";
import type { CallResult } from "@/lib/scoring/schema";

export type PersonRole = "executive" | "consultant" | "founder" | "manager" | "admin";

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  title: string;
}

export interface TranscriptLine {
  role: SpeakerRole;
  startSec: number;
  endSec: number;
  text: string;
  topic?: Topic;
}

export interface CallRecord {
  id: string;
  stream: Stream;
  personId: string;
  /** ISO timestamp in IST, e.g. 2026-10-20T10:12:00+05:30 */
  startedAt: string;
  durationSec: number;
  client: { name: string; city: string };
  recordingStatus: RecordingStatus;
  transcript: TranscriptLine[];
  metrics?: CallMetrics;
  result?: CallResult;
  final?: FinalScore;
  notScored?: NotScoredReason;
}
