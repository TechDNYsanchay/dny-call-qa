"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "./actions";

const BUTTON = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-60";

/** Copies the meeting link and says so for two seconds. */
export function CopyLinkButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={BUTTON}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copied ✓" : label}</span>
    </button>
  );
}

/** Cancels the meeting after a confirm: Google emails the guests a cancellation. */
export function CancelMeetingButton({ id, client, existing = false }: { id: string; client: string; existing?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={`${BUTTON} text-critical-ink`}
        onClick={() => {
          const ask = existing
            ? `Remove the meeting with ${client} from the app? Only the recording calendar's copy goes, so tl;dv won't record it; the meeting itself and its invites stay.`
            : `Cancel the meeting with ${client}? Everyone invited gets a cancellation email.`;
          if (!window.confirm(ask)) return;
          start(async () => {
            setError(null);
            const result = await cancelBooking(id);
            if (result.error) setError(result.error);
          });
        }}
      >
        {pending ? (existing ? "Removing…" : "Cancelling…") : existing ? "Remove" : "Cancel"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-critical-ink">
          {error}
        </span>
      )}
    </span>
  );
}
