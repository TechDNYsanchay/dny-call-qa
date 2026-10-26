import { describe, expect, it } from "vitest";
import { parseDeepgram } from "./deepgram";
import { parseElevenLabs } from "./elevenlabs";
import { availableTranscribers, configuredTranscriber, TranscriberNotConfigured } from "./index";
import { parseSarvam } from "./sarvam";

// Response shapes from each service's API reference; the words are invented.

describe("Deepgram response", () => {
  it("turns diarized words into speaker turns", () => {
    const json = {
      results: {
        channels: [
          {
            alternatives: [
              {
                words: [
                  { word: "hello", punctuated_word: "Hello,", start: 0.4, end: 0.8, speaker: 0 },
                  { word: "sir", punctuated_word: "sir.", start: 0.9, end: 1.1, speaker: 0 },
                  { word: "haan", punctuated_word: "Haan", start: 1.6, end: 1.9, speaker: 1 },
                  { word: "boliye", punctuated_word: "boliye.", start: 2, end: 2.4, speaker: 1 },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(parseDeepgram(json)).toEqual([
      { speaker: "0", startSec: 0.4, endSec: 1.1, text: "Hello, sir." },
      { speaker: "1", startSec: 1.6, endSec: 2.4, text: "Haan boliye." },
    ]);
  });

  it("rejects a response without words", () => {
    expect(() => parseDeepgram({ results: {} })).toThrow(/no words/);
  });
});

describe("ElevenLabs response", () => {
  it("keeps words, drops spacing and sound tags", () => {
    const json = {
      language_code: "hin",
      text: "Namaste ji (laughs) Haan",
      words: [
        { text: "Namaste", type: "word", start: 0.2, end: 0.6, speaker_id: "speaker_0" },
        { text: " ", type: "spacing", start: 0.6, end: 0.7, speaker_id: "speaker_0" },
        { text: "ji", type: "word", start: 0.7, end: 0.9, speaker_id: "speaker_0" },
        { text: "(laughs)", type: "audio_event", start: 1, end: 1.4, speaker_id: "speaker_1" },
        { text: "Haan", type: "word", start: 1.5, end: 1.8, speaker_id: "speaker_1" },
      ],
    };
    expect(parseElevenLabs(json)).toEqual([
      { speaker: "speaker_0", startSec: 0.2, endSec: 0.9, text: "Namaste ji" },
      { speaker: "speaker_1", startSec: 1.5, endSec: 1.8, text: "Haan" },
    ]);
  });
});

describe("Sarvam output", () => {
  it("reads the diarized entries and joins a speaker's back-to-back phrases", () => {
    const json = {
      transcript: "...",
      diarized_transcript: {
        entries: [
          { transcript: "Hello, DNY Hospitality se bol raha hoon.", start_time_seconds: 0.5, end_time_seconds: 3.1, speaker_id: "0" },
          { transcript: "Aapne enquiry ki thi.", start_time_seconds: 3.3, end_time_seconds: 4.8, speaker_id: "0" },
          { transcript: "हाँ, बताइए।", start_time_seconds: 5.2, end_time_seconds: 6, speaker_id: "1" },
        ],
      },
    };
    expect(parseSarvam(json)).toEqual([
      { speaker: "0", startSec: 0.5, endSec: 4.8, text: "Hello, DNY Hospitality se bol raha hoon. Aapne enquiry ki thi." },
      { speaker: "1", startSec: 5.2, endSec: 6, text: "हाँ, बताइए।" },
    ]);
  });
});

describe("choosing the service", () => {
  it("needs a provider name and its key", () => {
    expect(() => configuredTranscriber({})).toThrow(TranscriberNotConfigured);
    expect(() => configuredTranscriber({ TRANSCRIBE_PROVIDER: "deepgram" })).toThrow(/DEEPGRAM_API_KEY/);
    expect(() => configuredTranscriber({ TRANSCRIBE_PROVIDER: "whisper" })).toThrow(/must be one of/);
    expect(configuredTranscriber({ TRANSCRIBE_PROVIDER: "sarvam", SARVAM_API_KEY: "k" }).id).toBe("sarvam:saaras:v4");
  });

  it("offers every service that has a key, for the comparison", () => {
    expect(availableTranscribers({ DEEPGRAM_API_KEY: "a", ELEVENLABS_API_KEY: "b" }).map((t) => t.id)).toEqual([
      "deepgram:nova-3",
      "elevenlabs:scribe_v2",
    ]);
  });
});
