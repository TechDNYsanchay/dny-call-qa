"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { DEFAULT_DURATION, DURATIONS } from "@/lib/booking";
import { addExistingMeeting, type ExistingState } from "../actions";
import { Field } from "../new/booking-form";

const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm aria-[invalid=true]:border-critical";
const ROLE: Record<string, string> = { consultant: "Lead consultant", founder: "Founder", manager: "Manager", executive: "Sales" };

interface Props {
  hosts: { id: string; name: string; role: string }[];
  defaultHost: string | null;
  today: string;
}

export function ExistingMeetingForm(props: Props) {
  // A new key clears the form for "Add another".
  const [round, setRound] = useState(0);
  return <Form key={round} {...props} onAnother={() => setRound((n) => n + 1)} />;
}

function Form({ hosts, defaultHost, today, onAnother }: Props & { onAnother: () => void }) {
  const [state, action, pending] = useActionState<ExistingState, FormData>(addExistingMeeting, {});
  const e = state.errors ?? {};
  const v = (name: string, fallback: string) => state.values?.[name] ?? fallback;

  if (state.done) {
    const d = state.done;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-good text-sm font-semibold text-white" aria-hidden="true">
            ✓
          </span>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Added: {d.clientName}, {d.when}</p>
            <p className="text-muted">It&apos;s on the recording calendar{d.videoAttached ? " with its Meet link" : ""}, and it&apos;s marked as a sales meeting, so it&apos;s scored minutes after it ends. Nobody was emailed.</p>
            {!d.withClient && (
              <p className="text-warning-ink">Without the client&apos;s email tl;dv may treat it as an internal meeting and not join. If it doesn&apos;t, use Record now in tl;dv when the meeting starts.</p>
            )}
            <p className="text-muted">When tl;dv asks to join, the meeting&apos;s host clicks Admit: Google asks for that in meetings set up on someone else&apos;s calendar.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAnother} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">
            Add another
          </button>
          <Link href="/meetings" className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-foreground">
            All meetings →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {e.form && (
        <p role="alert" className="rounded-lg border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical-ink">
          {e.form}
        </p>
      )}

      <Field label="Google Meet link" error={e.meetLink} hint="From the calendar invite, e.g. https://meet.google.com/abc-defg-hij">
        <input name="meetLink" required defaultValue={v("meetLink", "")} autoComplete="off" placeholder="https://meet.google.com/abc-defg-hij" className={INPUT} aria-invalid={Boolean(e.meetLink)} />
      </Field>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Client</legend>
        <Field label="Name" error={e.clientName}>
          <input name="clientName" required defaultValue={v("clientName", "")} autoComplete="off" className={INPUT} aria-invalid={Boolean(e.clientName)} />
        </Field>
        <Field label="Email" error={e.clientEmail} hint="Optional, but with it tl;dv joins by itself. The client isn't emailed.">
          <input name="clientEmail" type="email" defaultValue={v("clientEmail", "")} autoComplete="off" className={INPUT} aria-invalid={Boolean(e.clientEmail)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">When (IST)</legend>
        <Field label="Date" error={e.date}>
          <input name="date" type="date" required min={today} defaultValue={v("date", today)} className={INPUT} aria-invalid={Boolean(e.date)} />
        </Field>
        <Field label="Start time" error={e.time}>
          <input name="time" type="time" required step={300} defaultValue={v("time", "")} className={INPUT} aria-invalid={Boolean(e.time)} />
        </Field>
        <Field label="Length" error={e.durationMin}>
          <select name="durationMin" defaultValue={v("durationMin", String(DEFAULT_DURATION))} className={INPUT}>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">DNY</legend>
        <Field label="Who takes the meeting" error={e.consultantId} hint="Their score" className="sm:col-span-3">
          <select name="consultantId" required defaultValue={v("consultantId", defaultHost ?? "")} className={INPUT} aria-invalid={Boolean(e.consultantId)}>
            {!defaultHost && (
              <option value="" disabled>
                Pick a person
              </option>
            )}
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} · {ROLE[h.role] ?? h.role}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60">
          {pending ? "Adding…" : "Add the meeting"}
        </button>
        <p className="text-xs text-muted">Adds it to the recording calendar so tl;dv records it. Nobody is emailed.</p>
      </div>
    </form>
  );
}
