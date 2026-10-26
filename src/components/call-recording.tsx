"use client";

// The call page's recording player and transcript. Clicking a line plays the recording from there.

import { Card } from "@/components/ui";
import type { TranscriptLine } from "@/lib/data/types";
import { formatTimestamp } from "@/lib/format";

const PLAYER_ID = "call-recording";

export function RecordingPlayer({ url, fallback }: { url?: string; fallback: string }) {
  return (
    <Card className="mb-6">
      {url ? (
        <audio id={PLAYER_ID} controls preload="metadata" src={url} className="w-full">
          Your browser can&apos;t play this recording.
        </audio>
      ) : (
        <p className="text-sm text-muted">{fallback}</p>
      )}
    </Card>
  );
}

/** "DNY" and "Client" once scoring has worked out who is who; until then Speaker 1, 2 in order of first words. */
function speakerNames(lines: TranscriptLine[]): (line: TranscriptLine) => string {
  const order: string[] = [];
  for (const line of lines) if (line.speaker && !order.includes(line.speaker)) order.push(line.speaker);
  return (line) =>
    line.role === "agent" ? "DNY" : line.role === "client" ? "Client" : line.speaker ? `Speaker ${order.indexOf(line.speaker) + 1}` : "";
}

export function Transcript({ lines }: { lines: TranscriptLine[] }) {
  const nameOf = speakerNames(lines);
  const rolesKnown = lines.some((l) => l.role !== "unknown");
  const playFrom = (sec: number) => {
    const player = document.getElementById(PLAYER_ID);
    if (!(player instanceof HTMLAudioElement)) return;
    player.currentTime = sec;
    void player.play();
  };

  return (
    <Card title="Transcript" className="mt-6">
      {!rolesKnown && (
        <p className="mb-3 text-xs text-muted">Speakers are numbered until tonight&apos;s scoring works out which one is the executive.</p>
      )}
      <ol className="max-h-[36rem] space-y-1 overflow-y-auto pr-1">
        {lines.map((line, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => playFrom(line.startSec)}
              className="flex w-full gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-background focus-visible:bg-background focus-visible:outline-none"
            >
              <span className="w-12 shrink-0 font-mono text-xs leading-5 text-muted tabular-nums">{formatTimestamp(line.startSec)}</span>
              <span className={`w-20 shrink-0 text-xs leading-5 ${line.role === "agent" ? "font-medium" : "text-muted"}`}>{nameOf(line)}</span>
              <span className="min-w-0">{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
