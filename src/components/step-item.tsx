"use client";

// A next step from a meeting, ticked off in place: the tick shows at once, the server saves it,
// and the page refreshes behind it. Also the copy button for the client recap.

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { setActionDone } from "@/app/calls/[id]/recap/actions";

export function StepItem({
  id,
  done,
  canTick,
  task,
  meta,
  aside,
  doneAside,
}: {
  id: string;
  done: boolean;
  canTick: boolean;
  task: string;
  /** Under the task: who, from which meeting, the line it was agreed in. */
  meta?: ReactNode;
  /** On the right while open: when it's due, calendar, a WhatsApp nudge. */
  aside?: ReactNode;
  /** On the right once done. */
  doneAside?: ReactNode;
}) {
  const [shown, setShown] = useOptimistic(done);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      setShown(!shown);
      const result = await setActionDone(id, !shown);
      if (result.error) setError(result.error);
    });

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-background/60 sm:px-5">
      <div className="flex min-w-0 flex-1 basis-64 gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={shown}
          aria-label={shown ? `Mark “${task}” as not done` : `Mark “${task}” as done`}
          title={canTick ? (shown ? "Done. Tap to reopen" : "Mark done") : "Only the consultant on the call or a founder can tick this"}
          disabled={!canTick}
          onClick={toggle}
          className={`group mt-px grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            shown ? "border-foreground bg-foreground text-background" : "border-chart-muted text-transparent hover:border-foreground hover:text-chart-muted"
          }`}
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path
              d="M2.5 6.2 5 8.5l4.5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className={`[stroke-dasharray:1] motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300 ${shown ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1] group-hover:[stroke-dashoffset:0]"}`}
            />
          </svg>
        </button>
        <div className="min-w-0">
          <div className={`text-sm transition-colors ${shown ? "text-muted line-through decoration-chart-muted" : "font-medium"}`}>{task}</div>
          {meta && <div className={`mt-0.5 text-xs text-muted ${shown ? "opacity-70" : ""}`}>{meta}</div>}
          {error && (
            <p role="alert" className="mt-1 text-xs text-critical-ink">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 text-xs sm:pl-0">{shown ? doneAside : aside}</div>
    </li>
  );
}

/** Copies `text` and says so for two seconds. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-background"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        {copied ? (
          <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </>
        )}
      </svg>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
