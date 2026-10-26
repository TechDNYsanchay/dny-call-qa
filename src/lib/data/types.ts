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
  /** The speech-to-text service's label for the voice; who is who is decided at scoring. */
  speaker?: string;
  role: SpeakerRole;
  startSec: number;
  endSec: number;
  text: string;
  topic?: Topic;
}

export interface ScoreReview {
  verdict: "agree" | "corrected";
  reviewer: string | null;
  /** IST timestamp. */
  at: string;
  note: string | null;
  /** What the AI gave, before any correction. */
  ai: { score: number; band: FinalScore["band"]; levels: FinalScore["levels"]; hardFails: string[] } | null;
}

export type InProgress = "recording" | "transcription" | "transcription_failed" | "scoring";

export interface CallRecord {
  id: string;
  stream: Stream;
  personId: string;
  /** ISO timestamp in IST, e.g. 2026-10-20T10:12:00+05:30 */
  startedAt: string;
  durationSec: number;
  client: { name: string; city: string };
  recordingStatus: RecordingStatus;
  /** Short-lived link to play the stored recording (call page only). */
  recordingUrl?: string;
  /** Where the recording lives when DNY doesn't store it, e.g. the meeting's page in tl;dv. */
  recordingPageUrl?: string;
  transcript: TranscriptLine[];
  metrics?: CallMetrics;
  result?: CallResult;
  final?: FinalScore;
  /** A founder's, manager's or admin's review of the AI's score (the brief's calibration). */
  review?: ScoreReview;
  notScored?: NotScoredReason;
  /** Arrived and on its way to a score. */
  inProgress?: InProgress;
  /** The executive's phone from Callyzer, kept for calls from numbers not on the team list. */
  agentPhone?: string;
}
