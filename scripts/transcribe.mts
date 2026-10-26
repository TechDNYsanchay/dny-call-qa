// Transcribes one chosen call now and saves it, the same way the transcribe job does.
// For trying a call by hand before the job is switched on; the job itself runs on Vercel.
//
//   npm run transcribe -- <callId> [--provider deepgram|sarvam|elevenlabs]
//
// The provider defaults to TRANSCRIBE_PROVIDER; its key must be in .env.local.

import { parseArgs } from "node:util";
import { configuredTranscriber } from "../src/lib/transcription/index";
import { db, must } from "./lib.mjs";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { provider: { type: "string" } } });
const callId = positionals[0];
if (!callId) throw new Error("Usage: npm run transcribe -- <callId> [--provider deepgram]");

const transcriber = configuredTranscriber({ ...process.env, TRANSCRIBE_PROVIDER: values.provider ?? process.env.TRANSCRIBE_PROVIDER });
const [call] = must(await db.from("calls").select("id, recording_path, duration_sec, transcript_status").eq("id", callId), "call");
if (!call?.recording_path) throw new Error(`Call ${callId} has no stored recording`);

const { data: link, error } = await db.storage.from("recordings").createSignedUrl(call.recording_path, 60 * 60);
if (error) throw new Error(`recording link: ${error.message}`);
const started = performance.now();
const turns = await transcriber.transcribe({ url: link.signedUrl });
if (turns.length === 0) throw new Error("No speech found in the recording");
must(await db.rpc("save_transcript", { p_call_id: callId, p_provider: transcriber.id, p_segments: turns as never }), "save");
console.log(
  `${transcriber.id}: ${turns.length} turns, ${new Set(turns.map((t) => t.speaker)).size} speakers, ` +
    `${((performance.now() - started) / 1000).toFixed(1)} s for a ${call.duration_sec} s call. Saved.`,
);
