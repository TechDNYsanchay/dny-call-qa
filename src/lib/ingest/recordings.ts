// Copies a call recording from the phone-sync service into the private "recordings" bucket.

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_BYTES = 100 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/3gpp": "3gp",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

function extensionFor(contentType: string, url: string): string {
  const fromType = EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()];
  if (fromType) return fromType;
  const fromUrl = new URL(url).pathname.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase();
  return fromUrl ?? "audio";
}

/** Downloads the recording (https only, size-capped, 60 s timeout) and stores it under its call. */
export async function copyRecording(call: { callId: string; url: string; startedAt: string }): Promise<string> {
  if (!call.url.startsWith("https://")) throw new Error("recording URL must be https");
  const response = await fetch(call.url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
  if (!response.ok) throw new Error(`recording download failed: HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!/^(audio\/|video\/|application\/octet-stream)/i.test(contentType)) {
    throw new Error(`not an audio file (content-type ${contentType})`);
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("recording is larger than 100 MB");
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_BYTES) throw new Error("recording is larger than 100 MB");

  const path = `callyzer/${call.startedAt.slice(0, 10)}/${call.callId}.${extensionFor(contentType, call.url)}`;
  const db = supabaseAdmin();
  const { error: uploadError } = await db.storage.from("recordings").upload(path, body, { contentType, upsert: true });
  if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);

  const { error } = await db.from("calls").update({ recording_path: path, recording_status: "available" }).eq("id", call.callId);
  if (error) throw new Error(`call update: ${error.message}`);
  // A recording that arrives after the morning job flagged it missing: transcribe and score it after all.
  const { error: requeueError } = await db
    .from("calls")
    .update({ transcript_status: "pending", scoring_status: "waiting", not_scored_reason: null })
    .eq("id", call.callId)
    .eq("not_scored_reason", "recording_missing");
  if (requeueError) throw new Error(`call requeue: ${requeueError.message}`);
  return path;
}
