"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { DURATIONS, DEFAULT_DURATION } from "@/lib/booking";
import { bookMeeting, type BookState } from "../actions";
import { CopyLinkButton } from "../meeting-buttons";

const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm aria-[invalid=true]:border-critical";
const ROLE: Record<string, string> = { consultant: "Lead consultant", founder: "Founder", manager: "Manager", executive: "Sales" };

interface Props {
  hosts: { id: string; name: string; role: string }[];
  defaultHost: string | null;
  defaults: { date: string; time: string; minDate: string };
  lead: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  meHasEmail: boolean;
}

export function BookingForm({ hosts, defaultHost, defaults, lead, meHasEmail }: Props) {
  // A new key clears the form for "Book another".
  const [round, setRound] = useState(0);
  return <Form key={round} {...{ hosts, defaultHost, defaults, lead, meHasEmail }} onAnother={() => setRound((n) => n + 1)} />;
}

function Form({ hosts, defaultHost, defaults, lead, meHasEmail, onAnother }: Props & { onAnother: () => void }) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookMeeting, {});
  const e = state.errors ?? {};
  // After an error the form shows what was typed, not the starting values.
  const v = (name: string, fallback: string) => state.values?.[name] ?? fallback;

  if (state.done) {
    const d = state.done;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-good text-sm font-semibold text-white" aria-hidden="true">
            ✓
          </span>
          <div>
            <p className="font-semibold">Booked: {d.clientName}</p>
            <p className="text-sm text-muted">{d.when}. Calendar invites with the Meet link have gone to everyone. tl;dv will record it.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <a href={d.meetUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">
            {d.meetUrl}
          </a>
          <CopyLinkButton text={d.meetUrl} />
        </div>
        <div className="flex flex-wrap gap-2">
          {d.whatsapp && (
            <a href={d.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90">
              Send the link on WhatsApp
            </a>
          )}
          <button type="button" onClick={onAnother} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">
            Book another
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
      {lead && <input type="hidden" name="leadId" value={lead.id} />}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Client</legend>
        <Field label="Name" error={e.clientName}>
          <input name="clientName" required defaultValue={v("clientName", lead?.name ?? "")} autoComplete="off" className={INPUT} aria-invalid={Boolean(e.clientName)} />
        </Field>
        <Field label="Email" error={e.clientEmail} hint="The invite goes here">
          <input name="clientEmail" type="email" required defaultValue={v("clientEmail", lead?.email ?? "")} autoComplete="off" className={INPUT} aria-invalid={Boolean(e.clientEmail)} />
        </Field>
        <Field label="Phone" error={e.clientPhone} hint="Optional, for the WhatsApp link">
          <input name="clientPhone" type="tel" defaultValue={v("clientPhone", lead?.phone ?? "")} autoComplete="off" className={INPUT} aria-invalid={Boolean(e.clientPhone)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">When (IST)</legend>
        <Field label="Date" error={e.date}>
          <input name="date" type="date" required min={defaults.minDate} defaultValue={v("date", defaults.date)} className={INPUT} aria-invalid={Boolean(e.date)} />
        </Field>
        <Field label="Time" error={e.time}>
          <input name="time" type="time" required step={300} defaultValue={v("time", defaults.time)} className={INPUT} aria-invalid={Boolean(e.time)} />
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
        <Field label="Who takes the meeting" error={e.consultantId} className="sm:col-span-2">
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
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="addMe" defaultChecked={state.values ? state.values.addMe === "on" : meHasEmail} disabled={!meHasEmail} className="size-4 accent-foreground" />
          Add me to the invite
        </label>
        <Field label="Note for the client" error={e.notes} hint="Optional, shown in the invite" className="sm:col-span-3">
          <textarea name="notes" rows={2} maxLength={500} defaultValue={v("notes", "")} className={INPUT} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60">
          {pending ? "Booking…" : "Book and send invites"}
        </button>
        <p className="text-xs text-muted">Creates the Google Meet link, emails the invites and tells the client the call is recorded.</p>
      </div>
    </form>
  );
}

export function Field({ label, error, hint, className = "", children }: { label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-critical-ink">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-2xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
