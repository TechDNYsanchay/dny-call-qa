"use client";

// The Team members page's forms: report delivery, adding, editing and pausing people.

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Avatar, Card, StatusLabel } from "@/components/ui";
import { formatPhone } from "@/lib/format";
import type { TeamMember } from "@/lib/data";
import type { PersonRole } from "@/lib/data/types";
import { savePerson, setActive, setDelivery, type FormState } from "./actions";

const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
const BUTTON = "inline-flex items-center whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-60";
const PRIMARY = "rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60";
const ROLE_LABEL: Record<PersonRole, string> = {
  executive: "First Calls Executive",
  consultant: "Lead Consultant",
  manager: "Manager",
  founder: "Founder",
  admin: "Admin",
};

/** A form action that refreshes the page after it succeeds. */
function useRefreshingAction(action: (prev: FormState, form: FormData) => Promise<FormState>, after?: () => void) {
  const router = useRouter();
  return useActionState<FormState, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (result.done) {
      after?.();
      router.refresh();
    }
    return result;
  }, {});
}

function Message({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-critical">{state.error}</p>;
  if (state.done) return <p className="text-sm text-good">{state.done}</p>;
  return null;
}

export function DeliveryCard({ testInbox, myEmail }: { testInbox: string | null; myEmail: string | null }) {
  const [state, action, pending] = useRefreshingAction(setDelivery);
  const [mode, setMode] = useState<"test" | "live">(testInbox ? "test" : "live");
  const option = (active: boolean) =>
    `flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors ${active ? "border-foreground/40 bg-background" : "border-border hover:bg-background/60"}`;
  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Where reports go</h2>
        <span className="text-xs">
          {testInbox ? <StatusLabel band="amber">Testing: all to {testInbox}</StatusLabel> : <StatusLabel band="green">Live: each person gets theirs</StatusLabel>}
        </span>
      </div>
      <form action={action} className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={option(mode === "test")}>
            <input type="radio" name="mode" value="test" checked={mode === "test"} onChange={() => setMode("test")} className="mt-1" />
            <span className="min-w-0">
              <span className="block font-medium">One test inbox</span>
              <span className="block text-xs text-muted">Every report and summary goes to one inbox, for checking before going live.</span>
              {mode === "test" && (
                <input name="inbox" type="email" defaultValue={testInbox ?? myEmail ?? ""} required className={`${INPUT} mt-2`} aria-label="Test inbox" />
              )}
            </span>
          </label>
          <label className={option(mode === "live")}>
            <input type="radio" name="mode" value="live" checked={mode === "live"} onChange={() => setMode("live")} className="mt-1" />
            <span className="min-w-0">
              <span className="block font-medium">Live</span>
              <span className="block text-xs text-muted">Each person gets their own 8 am report; founders, managers and admins get the team summary.</span>
              {mode === "live" && testInbox && <span className="mt-2 block text-xs text-warning-ink">People without an email below are skipped. Check everyone&apos;s email first.</span>}
            </span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Saving…" : "Save"}
          </button>
          <Message state={state} />
        </div>
      </form>
    </Card>
  );
}

function PersonForm({ person, onDone }: { person?: TeamMember; onDone: () => void }) {
  const [state, action, pending] = useRefreshingAction(savePerson, onDone);
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-brand/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
      {person && <input type="hidden" name="id" value={person.id} />}
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Name</span>
        <input name="name" defaultValue={person?.name ?? ""} required minLength={2} className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Role</span>
        <select name="role" defaultValue={person?.role ?? "executive"} className={INPUT}>
          {(Object.keys(ROLE_LABEL) as PersonRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Work email (to sign in and get reports)</span>
        <input name="email" type="email" defaultValue={person?.email ?? ""} placeholder="name@dnyhospitality.com" className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Callyzer number (their phone)</span>
        <input name="phone" defaultValue={person?.callyzerPhone ?? ""} placeholder="93225 40272" className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">tl;dv email (consultants)</span>
        <input name="tldvEmail" type="email" defaultValue={person?.tldvEmail ?? ""} className={INPUT} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Saving…" : person ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onDone} className={BUTTON}>
          Cancel
        </button>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}

function PauseButton({ person }: { person: TeamMember }) {
  const [state, action, pending] = useRefreshingAction(setActive);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={person.id} />
      <input type="hidden" name="active" value={person.active ? "false" : "true"} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {person.active ? "Pause" : "Resume"}
      </button>
      {state.error && <span className="ml-2 text-xs text-critical">{state.error}</span>}
    </form>
  );
}

function PersonRow({ person: p, meId, editing, onEdit, onDone }: { person: TeamMember; meId: string; editing: boolean; onEdit: () => void; onDone: () => void }) {
  if (editing) {
    return (
      <li className="px-4 py-3 sm:px-5">
        <PersonForm person={p} onDone={onDone} />
      </li>
    );
  }
  const contact = [p.email, p.callyzerPhone ? `Callyzer ${formatPhone(p.callyzerPhone)}` : null, p.tldvEmail ? `tl;dv ${p.tldvEmail}` : null].filter(Boolean);
  return (
    <li className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-background/60 sm:px-5 ${p.active ? "" : "opacity-70"}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={p.name} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.name}</span>
            {p.id === meId && <span className="text-xs text-muted">(you)</span>}
            <span className="rounded-full border border-border px-2 py-px text-2xs text-muted">{ROLE_LABEL[p.role]}</span>
          </div>
          <div className="truncate text-xs text-muted">{contact.length ? contact.join(" · ") : "No email or number yet"}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs">
          {p.canSignIn ? <StatusLabel band="green">Can sign in</StatusLabel> : <span className="text-muted">{p.email ? "Login not set up" : "Tracked by phone only"}</span>}
        </span>
        <button type="button" onClick={onEdit} className={BUTTON}>
          Edit
        </button>
        {p.id !== meId && <PauseButton person={p} />}
      </div>
    </li>
  );
}

export function PeopleList({ people, meId }: { people: TeamMember[]; meId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const active = people.filter((p) => p.active);
  const paused = people.filter((p) => !p.active);
  const row = (p: TeamMember) => (
    <PersonRow key={p.id} person={p} meId={meId} editing={editing === p.id} onEdit={() => setEditing(p.id)} onDone={() => setEditing(null)} />
  );
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">People</h2>
          <span className="rounded-full border border-border px-2 py-px text-xs tabular-nums text-muted">{active.length}</span>
        </div>
        {editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className={PRIMARY}>
            + Add a person
          </button>
        )}
      </div>
      {editing === "new" && (
        <div className="mb-3">
          <PersonForm onDone={() => setEditing(null)} />
        </div>
      )}
      <ul className="-mx-4 divide-y divide-border border-t border-border sm:-mx-5">{active.map(row)}</ul>
      {paused.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted hover:text-foreground">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Paused ({paused.length}): not tracked and can&apos;t sign in
          </summary>
          <ul className="-mx-4 mt-2 divide-y divide-border border-t border-border sm:-mx-5">{paused.map(row)}</ul>
        </details>
      )}
    </Card>
  );
}
