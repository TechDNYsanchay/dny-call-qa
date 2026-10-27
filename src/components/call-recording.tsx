"use client";

// The call page's recording player and transcript. Clicking a line plays the recording from there.

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui";
import type { TranscriptLine } from "@/lib/data/types";
import { formatTimestamp } from "@/lib/format";

const PLAYER_ID = "call-recording";

/** `startAt` (seconds) cues the recording there, e.g. from a search result. */
export function RecordingPlayer({ url, pageUrl, fallback, startAt }: { url?: string; pageUrl?: string; fallback: string; startAt?: number }) {
  return (
    <Card className="mb-6">
      {url ? (
        <audio id={PLAYER_ID} controls preload="metadata" src={startAt ? `${url}#t=${startAt}` : url} className="w-full">
          Your browser can&apos;t play this recording.
        </audio>
      ) : pageUrl ? (
        <p className="text-sm">
          The recording is kept in tl;dv.{" "}
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
            Open it in tl;dv ↗
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted">{fallback}</p>
      )}
    </Card>
  );
}

/**
 * "DNY" and "Client" once scoring has worked out who is who. Until then, a real name when the
 * transcript has one (tl;dv), otherwise Speaker 1, 2 in order of first words.
 */
function speakerNames(lines: TranscriptLine[]): (line: TranscriptLine) => string {
  const order: string[] = [];
  for (const line of lines) if (line.speaker && !order.includes(line.speaker)) order.push(line.speaker);
  const numbered = (label: string) => /^(\d+|speaker_\d+)$/i.test(label);
  return (line) =>
    line.role === "agent"
      ? "DNY"
      : line.role === "client"
        ? "Client"
        : !line.speaker
          ? ""
          : numbered(line.speaker)
            ? `Speaker ${order.indexOf(line.speaker) + 1}`
            : line.speaker;
}

/** `focusSec` highlights the line spoken at that second and scrolls it into view. */
export function Transcript({ lines, focusSec }: { lines: TranscriptLine[]; focusSec?: number }) {
  const nameOf = speakerNames(lines);
  const focused = focusSec === undefined ? -1 : lines.findLastIndex((l) => l.startSec <= focusSec + 0.5);
  const focusRef = useRef<HTMLLIElement>(null);
  useEffect(() => focusRef.current?.scrollIntoView({ block: "center" }), []);
  const rolesKnown = lines.some((l) => l.role !== "unknown");
  const playFrom = (sec: number) => {
    const player = document.getElementById(PLAYER_ID);
    if (!(player instanceof HTMLAudioElement)) return;
    player.currentTime = sec;
    void player.play();
  };

  return (
    <Card title="Transcript" className="mt-6">
      {!rolesKnown && lines.some((l) => l.speaker && /^(\d+|speaker_\d+)$/i.test(l.speaker)) && (
        <p className="mb-3 text-xs text-muted">Speakers are numbered until tonight&apos;s scoring works out which one is the executive.</p>
      )}
      <ol className="max-h-[36rem] space-y-1 overflow-y-auto pr-1">
        {lines.map((line, i) => (
          <li key={i} ref={i === focused ? focusRef : undefined} className={i === focused ? "rounded-md bg-brand/10" : undefined}>
            <button
              type="button"
              onClick={() => playFrom(line.startSec)}
              className="flex w-full gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-background focus-visible:bg-background focus-visible:outline-none"
            >
              <span className="w-12 shrink-0 font-mono text-xs leading-5 text-muted tabular-nums">{formatTimestamp(line.startSec)}</span>
              <span title={nameOf(line)} className={`w-24 shrink-0 truncate text-xs leading-5 ${line.role === "agent" ? "font-medium" : "text-muted"}`}>
                {nameOf(line)}
              </span>
              <span className="min-w-0">{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
