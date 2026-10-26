"use client";

// On their own scored call, an executive can challenge the score; founders are emailed and
// their review of the call answers it.

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { disputeScore, type DisputeState } from "@/app/calls/[id]/actions";
import { Card } from "@/components/ui";

export function DisputeForm({ callId }: { callId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DisputeState, FormData>(async (prev, form) => {
    const result = await disputeScore(prev, form);
    if (result.done) router.refresh();
    return result;
  }, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand hover:underline">
        Think this score is wrong? Dispute it
      </button>
    );
  }
  return (
    <Card title="Dispute this score">
      <form action={action} className="space-y-3">
        <input type="hidden" name="callId" value={callId} />
        <label className="block text-sm">
          <span className="mb-1 block text-muted">What did the score get wrong? Point to the part of the call if you can.</span>
          <textarea
            name="comment"
            required
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder="e.g. I did ask about the budget, at about 4:10, but the client changed the subject."
            className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
            {pending ? "Sending…" : "Send to the founders"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background">
            Cancel
          </button>
          {state.error && <span className="text-sm text-critical">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
