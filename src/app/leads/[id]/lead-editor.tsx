"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/data/types";
import { LEAD_STATUS_LABEL } from "@/lib/format";
import { updateLead, type LeadState } from "./actions";

const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";

export function LeadEditor({
  id,
  status,
  stage,
  ownerId,
  valueInr,
  notes,
  owners,
}: {
  id: string;
  status: LeadStatus;
  stage: 1 | 2 | null;
  ownerId: string | null;
  valueInr: number | null;
  notes: string | null;
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<LeadState, FormData>(async (prev, form) => {
    const result = await updateLead(prev, form);
    if (result.done) router.refresh();
    return result;
  }, {});
  return (
    // React resets a form after its action; the key re-mounts it with the saved values once the page refreshes.
    <form key={[status, stage, ownerId, valueInr, notes].join("|")} action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Status</span>
        <select name="status" defaultValue={status} className={INPUT}>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Stage</span>
        <select name="stage" defaultValue={stage ? String(stage) : ""} className={INPUT}>
          <option value="">Not set</option>
          <option value="1">Stage 1</option>
          <option value="2">Stage 2</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Owner</span>
        <select name="ownerId" defaultValue={ownerId ?? ""} className={INPUT}>
          <option value="">No owner</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Deal value (₹)</span>
        <input name="value" inputMode="numeric" defaultValue={valueInr ?? ""} placeholder="e.g. 500000" className={INPUT} />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-xs text-muted">Notes</span>
        <textarea name="notes" rows={2} defaultValue={notes ?? ""} className={INPUT} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error && <span className="text-sm text-critical">{state.error}</span>}
        {state.done && <span className="text-sm text-good">{state.done}</span>}
      </div>
    </form>
  );
}
