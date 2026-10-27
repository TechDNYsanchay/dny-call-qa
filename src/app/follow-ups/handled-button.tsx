"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { markMissedHandled, type HandledState } from "./actions";

export function HandledButton({ callIds }: { callIds: string[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HandledState, FormData>(async (prev, form) => {
    const result = await markMissedHandled(prev, form);
    if (result.done) router.refresh();
    return result;
  }, {});
  return (
    <form action={action} className="flex items-center gap-2">
      {callIds.map((id) => (
        <input key={id} type="hidden" name="callId" value={id} />
      ))}
      <button
        type="submit"
        disabled={pending}
        title="The client was reached another way, or it wasn't a client"
        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark handled"}
      </button>
      {state.error && <span className="text-xs text-critical">{state.error}</span>}
    </form>
  );
}
