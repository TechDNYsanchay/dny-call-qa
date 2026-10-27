"use client";

// The founders' controls on a coaching focus: set or change it (a question or an area, with a
// short note), or end it.

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { endFocus, setFocus, type FocusState } from "./focus-actions";

const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
const BUTTON = "inline-flex items-center whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-60";

function useRefresh(action: (prev: FocusState, form: FormData) => Promise<FocusState>, after?: () => void) {
  const router = useRouter();
  return useActionState<FocusState, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (result.done) {
      after?.();
      router.refresh();
    }
    return result;
  }, {});
}

export function FocusControls({
  personId,
  current,
  questions,
  areas,
}: {
  personId: string;
  current: { id: string; target: string; note: string | null } | null;
  questions: { value: string; label: string }[];
  areas: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(!current);
  const [state, action, pending] = useRefresh(setFocus, () => setOpen(false));
  const [endState, endAction, ending] = useRefresh(endFocus);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
          Change focus
        </button>
        {current && (
          <form action={endAction}>
            <input type="hidden" name="id" value={current.id} />
            <button type="submit" disabled={ending} className={BUTTON}>
              {ending ? "Ending…" : "End focus"}
            </button>
          </form>
        )}
        {endState.error && <span className="text-xs text-critical-ink">{endState.error}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="grid w-full gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] sm:items-end">
      <input type="hidden" name="personId" value={personId} />
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Focus on</span>
        <select name="target" defaultValue={current?.target ?? ""} required className={INPUT}>
          <option value="" disabled>
            Choose a question or an area
          </option>
          <optgroup label="Ask on every call">
            {questions.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Get this area to Met">
            {areas.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Note for them (optional)</span>
        <input name="note" defaultValue={current?.note ?? ""} maxLength={300} placeholder="e.g. Ask it right after the format, before talking about DNY" className={INPUT} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {current && (
          <button type="button" onClick={() => setOpen(false)} className={BUTTON}>
            Cancel
          </button>
        )}
      </div>
      {state.error && <p className="text-sm text-critical-ink sm:col-span-3">{state.error}</p>}
    </form>
  );
}
