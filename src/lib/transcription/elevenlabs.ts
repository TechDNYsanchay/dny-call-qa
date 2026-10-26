// ElevenLabs Scribe v2, from a link to the recording. Language is detected per call.
// https://elevenlabs.io/docs/api-reference/speech-to-text/convert

import { wordsToTurns, type SpeakerTurn, type Transcriber } from "./turns";

const MODEL = "scribe_v2";

interface ScribeWord {
  text: string;
  type: "word" | "spacing" | "audio_event";
  start: number;
  end: number;
  speaker_id?: string;
}

export function parseElevenLabs(json: unknown): SpeakerTurn[] {
  const words = (json as { words?: ScribeWord[] })?.words;
  if (!Array.isArray(words)) throw new Error("ElevenLabs: no words in the response");
  return wordsToTurns(
    words
      .filter((w) => w.type === "word")
      .map((w) => ({ text: w.text, startSec: w.start, endSec: w.end, speaker: w.speaker_id ?? "speaker_0" })),
  );
}

export function elevenlabs(apiKey: string): Transcriber {
  return {
    id: `elevenlabs:${MODEL}`,
    async transcribe({ url }) {
      const form = new FormData();
      form.set("model_id", MODEL);
      form.set("source_url", url);
      form.set("diarize", "true");
      form.set("num_speakers", "2");
      form.set("timestamps_granularity", "word");
      form.set("tag_audio_events", "false");
      const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: AbortSignal.timeout(150_000),
      });
      if (!response.ok) throw new Error(`ElevenLabs: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
      return parseElevenLabs(await response.json());
    },
  };
}
