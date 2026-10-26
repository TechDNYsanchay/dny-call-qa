// Deepgram Nova-3, multilingual (Hindi-English code-switching), from a link to the recording.
// https://developers.deepgram.com/docs/pre-recorded-audio · /docs/diarization · /docs/keyterm

import { wordsToTurns, type SpeakerTurn, type Transcriber } from "./turns";
import { DNY_TERMS } from "./vocabulary";

const MODEL = "nova-3";

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
}

export function parseDeepgram(json: unknown): SpeakerTurn[] {
  const words = (json as { results?: { channels?: { alternatives?: { words?: DeepgramWord[] }[] }[] } })?.results?.channels?.[0]
    ?.alternatives?.[0]?.words;
  if (!Array.isArray(words)) throw new Error("Deepgram: no words in the response");
  return wordsToTurns(
    words.map((w) => ({ text: w.punctuated_word ?? w.word, startSec: w.start, endSec: w.end, speaker: String(w.speaker ?? 0) })),
  );
}

export function deepgram(apiKey: string): Transcriber {
  return {
    id: `deepgram:${MODEL}`,
    async transcribe({ url }) {
      const params = new URLSearchParams({
        model: MODEL,
        language: "multi",
        diarize_model: "latest",
        smart_format: "true",
        punctuate: "true",
      });
      for (const term of DNY_TERMS) params.append("keyterm", term);
      const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!response.ok) throw new Error(`Deepgram: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      return parseDeepgram(await response.json());
    },
  };
}
