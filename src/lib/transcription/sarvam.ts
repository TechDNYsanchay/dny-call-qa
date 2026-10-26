// Sarvam Saaras v4 batch job, built for Indian languages. "codemix" keeps English words in
// English and Hindi in Devanagari. The batch API can't fetch a link, so the recording is
// downloaded and uploaded to Sarvam's storage.
// https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/batch-api

import { mergeTurns, type SpeakerTurn, type Transcriber } from "./turns";

const MODEL = "saaras:v4";
const API = "https://api.sarvam.ai/speech-to-text/job/v1";
const POLL_MS = 5_000;
const GIVE_UP_MS = 170_000;

interface SarvamEntry {
  transcript: string;
  start_time_seconds: number;
  end_time_seconds: number;
  speaker_id?: string;
}

export function parseSarvam(json: unknown): SpeakerTurn[] {
  const entries = (json as { diarized_transcript?: { entries?: SarvamEntry[] } })?.diarized_transcript?.entries;
  if (!Array.isArray(entries)) throw new Error("Sarvam: no diarized transcript in the output");
  return mergeTurns(
    entries.map((e) => ({ speaker: String(e.speaker_id ?? "0"), startSec: e.start_time_seconds, endSec: e.end_time_seconds, text: e.transcript })),
  );
}

export function sarvam(apiKey: string): Transcriber {
  async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method: init.method,
      headers: { "api-subscription-key": apiKey, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Sarvam ${path || "create job"}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    return (await response.json()) as T;
  }

  return {
    id: `sarvam:${MODEL}`,
    async transcribe({ url }) {
      const started = Date.now();
      const audio = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!audio.ok) throw new Error(`Sarvam: couldn't read the recording (HTTP ${audio.status})`);
      const bytes = await audio.arrayBuffer();
      const fileName = "call.mp3";

      const { job_id: jobId } = await call<{ job_id: string }>("", {
        method: "POST",
        body: {
          job_parameters: { model: MODEL, mode: "codemix", language_code: "hi-IN", with_diarization: true, num_speakers: 2, with_timestamps: true },
        },
      });
      const { upload_urls: uploads } = await call<{ upload_urls: Record<string, { file_url: string }> }>("/upload-files", {
        method: "POST",
        body: { job_id: jobId, files: [fileName] },
      });
      const put = await fetch(uploads[fileName].file_url, {
        method: "PUT",
        headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "audio/mpeg" },
        body: bytes,
        signal: AbortSignal.timeout(60_000),
      });
      if (!put.ok) throw new Error(`Sarvam upload: HTTP ${put.status}`);
      await call(`/${jobId}/start`, { method: "POST" });

      type Status = { job_state: string; error_message?: string; job_details?: { outputs?: { file_name: string }[]; error_message?: string }[] };
      let status: Status;
      do {
        if (Date.now() - started > GIVE_UP_MS) throw new Error(`Sarvam: job ${jobId} still running after ${GIVE_UP_MS / 1000} s`);
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        status = await call<Status>(`/${jobId}/status`, { method: "GET" });
      } while (!["Completed", "Failed"].includes(status.job_state));
      if (status.job_state === "Failed") {
        throw new Error(`Sarvam: job failed: ${status.error_message ?? status.job_details?.[0]?.error_message ?? "no reason given"}`);
      }

      const output = status.job_details?.[0]?.outputs?.[0]?.file_name;
      if (!output) throw new Error("Sarvam: job finished without an output file");
      const { download_urls: downloads } = await call<{ download_urls: Record<string, { file_url: string }> }>("/download-files", {
        method: "POST",
        body: { job_id: jobId, files: [output] },
      });
      const result = await fetch(downloads[output].file_url, { signal: AbortSignal.timeout(30_000) });
      if (!result.ok) throw new Error(`Sarvam download: HTTP ${result.status}`);
      return parseSarvam(await result.json());
    },
  };
}
