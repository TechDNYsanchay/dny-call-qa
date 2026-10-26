// What every speech-to-text service is reduced to: speaker turns with timings.
// Pure, so the services' responses can be tested from saved samples.

/** One stretch of speech by one speaker, as stored in transcript_segments. */
export interface SpeakerTurn {
  /** The service's own label for the voice ("0", "speaker_1", ...). Who is the executive is decided at scoring. */
  speaker: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface TimedWord {
  text: string;
  startSec: number;
  endSec: number;
  speaker: string;
}

export interface Transcriber {
  /** Stored with the transcript, e.g. "deepgram:nova-3". */
  id: string;
  /** `url` is a short-lived link to the recording that the service downloads itself. */
  transcribe(audio: { url: string }): Promise<SpeakerTurn[]>;
}

/**
 * A pause this long starts a new turn even when the same person keeps talking, so the gaps
 * between turns show the silences the brief measures (over 8 s).
 */
export const TURN_BREAK_SEC = 2;

const round = (sec: number) => Math.round(sec * 100) / 100;

/** Groups words into turns: a new turn starts when the speaker changes or after a long pause. */
export function wordsToTurns(words: TimedWord[]): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;
    const last = turns.at(-1);
    if (last && last.speaker === word.speaker && word.startSec - last.endSec < TURN_BREAK_SEC) {
      last.text += ` ${text}`;
      last.endSec = round(Math.max(last.endSec, word.endSec));
    } else {
      turns.push({ speaker: word.speaker, startSec: round(word.startSec), endSec: round(word.endSec), text });
    }
  }
  return turns;
}

/** Joins back-to-back turns by the same speaker and drops empty ones (for services that return sentences). */
export function mergeTurns(turns: SpeakerTurn[]): SpeakerTurn[] {
  const merged: SpeakerTurn[] = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    const last = merged.at(-1);
    if (last && last.speaker === turn.speaker && turn.startSec - last.endSec < TURN_BREAK_SEC) {
      last.text += ` ${text}`;
      last.endSec = round(Math.max(last.endSec, turn.endSec));
    } else {
      merged.push({ speaker: turn.speaker, startSec: round(turn.startSec), endSec: round(turn.endSec), text });
    }
  }
  return merged;
}
