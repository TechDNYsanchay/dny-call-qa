// Picks the speech-to-text service. TRANSCRIBE_PROVIDER names the one the pipeline uses;
// the comparison script (npm run stt:compare) runs every service that has a key.

import { deepgram } from "./deepgram";
import { elevenlabs } from "./elevenlabs";
import { sarvam } from "./sarvam";
import type { Transcriber } from "./turns";

export type { SpeakerTurn, Transcriber } from "./turns";

const PROVIDERS = {
  deepgram: { keyName: "DEEPGRAM_API_KEY", create: deepgram },
  sarvam: { keyName: "SARVAM_API_KEY", create: sarvam },
  elevenlabs: { keyName: "ELEVENLABS_API_KEY", create: elevenlabs },
} as const satisfies Record<string, { keyName: string; create: (apiKey: string) => Transcriber }>;

type Env = Record<string, string | undefined>;

/** No service chosen yet: the transcribe job reports this instead of failing. */
export class TranscriberNotConfigured extends Error {}

export function configuredTranscriber(env: Env = process.env): Transcriber {
  const name = env.TRANSCRIBE_PROVIDER;
  if (!name) throw new TranscriberNotConfigured("No speech-to-text service chosen yet (TRANSCRIBE_PROVIDER is not set)");
  if (!(name in PROVIDERS)) throw new Error(`TRANSCRIBE_PROVIDER must be one of: ${Object.keys(PROVIDERS).join(", ")}`);
  const provider = PROVIDERS[name as keyof typeof PROVIDERS];
  const key = env[provider.keyName];
  if (!key) throw new TranscriberNotConfigured(`${provider.keyName} is not set`);
  return provider.create(key);
}

export function availableTranscribers(env: Env): Transcriber[] {
  return Object.values(PROVIDERS).flatMap((p) => (env[p.keyName] ? [p.create(env[p.keyName]!)] : []));
}
