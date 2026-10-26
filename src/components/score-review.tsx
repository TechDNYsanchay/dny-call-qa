"use client";

// The founders' review panel on a scored call: agree with the AI's score, or correct it.

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { reviewCall, type ReviewState } from "@/app/calls/[id]/actions";
import { Card } from "@/components/ui";
import type { Level } from "@/lib/scoring/compute";

interface Props {
  callId: string;
  areas: { id: string; name: string; weight: number; level: Level }[];
  hardFails: { id: string; label: string; on: boolean }[];
  reviewed: boolean;
  /** Set when the score was corrected: agreeing then means going back to the AI's score. */
  aiScore?: number;
}

export function ScoreReview({ callId, areas, hardFails, reviewed, aiScore }: Props) {
  const router = useRouter();
  const [correcting, setCorrecting] = useState(false);
  const [open, setOpen] = useState(!reviewed);
  const [state, action, pending] = useActionState<ReviewState, FormData>(async (previous, form) => {
    const result = await reviewCall(previous, form);
    if (result.done) {
      setCorrecting(false);
      setOpen(false);
      router.refresh();
    }
    return result;
  }, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand hover:underline">
        Change the review
      </button>
    );
  }

  return (
    <Card title="Your review" className="border-brand/40">
      <p className="mb-3 text-sm text-muted">
        Does this score match how you&apos;d judge the call? Agreeing or correcting it is how the scoring gets calibrated.
      </p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="callId" value={callId} />
        {correcting && (
          <>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Points per area</legend>
              {areas.map((area) => (
                <label key={area.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    {area.name} <span className="text-muted">· weight {area.weight}</span>
                  </span>
                  <select name={`level:${area.id}`} defaultValue={String(area.level)} className="rounded border border-border bg-surface px-2 py-1">
                    <option value="10">10 Met</option>
                    <option value="5">5 Partial</option>
                    <option value="0">0 Missed</option>
                  </select>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Hard fails (any one makes the call Red)</legend>
              <div className="space-y-1">
                {hardFails.map((h) => (
                  <label key={h.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="hardFail" value={h.id} defaultChecked={h.on} />
                    {h.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            {correcting ? "Why you changed it (required)" : "Note (optional)"}
          </span>
          <textarea
            name="note"
            rows={2}
            required={correcting}
            minLength={correcting ? 5 : undefined}
            className="w-full rounded-md border border-border bg-surface px-3 py-2"
            placeholder={correcting ? "e.g. She did ask for the meeting at 6:10; CTA should be partial, not missed." : ""}
          />
        </label>
        {state.error && <p className="text-sm text-critical">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          {correcting ? (
            <>
              <button type="submit" name="verdict" value="corrected" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                {pending ? "Saving…" : "Save the corrected score"}
              </button>
              <button type="button" onClick={() => setCorrecting(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="submit" name="verdict" value="agree" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                {pending ? "Saving…" : aiScore !== undefined ? `Go back to the AI's score (${aiScore})` : "Agree with this score"}
              </button>
              <button type="button" onClick={() => setCorrecting(true)} className="rounded-md border border-border px-3 py-1.5 text-sm">
                Correct it
              </button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
