"use client";

// The Team members page's forms: report delivery, adding, editing and pausing people.

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Card } from "@/components/ui";
import type { TeamMember } from "@/lib/data";
import type { PersonRole } from "@/lib/data/types";
import { savePerson, setActive, setDelivery, type FormState } from "./actions";

const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
const BUTTON = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-60";
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
  return (
    <Card title="Where reports go" className="mb-6">
      <p className="mb-3 text-sm">
        {testInbox ? (
          <>
            <span className="font-medium">Testing:</span> every report and summary goes to <span className="font-medium">{testInbox}</span>.
          </>
        ) : (
          <>
            <span className="font-medium">Live:</span> each person gets their own report; founders, managers and admins get the summary.
          </>
        )}
      </p>
      <form action={action} className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="test" checked={mode === "test"} onChange={() => setMode("test")} />
          Send everything to one test inbox
        </label>
        {mode === "test" && (
          <input name="inbox" type="email" defaultValue={testInbox ?? myEmail ?? ""} required className={`${INPUT} max-w-sm`} aria-label="Test inbox" />
        )}
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="live" checked={mode === "live"} onChange={() => setMode("live")} />
          Live: send each report to its person
        </label>
        {mode === "live" && testInbox && (
          <p className="text-xs text-muted">People without an email on the list are skipped. Check everyone&apos;s email below first.</p>
        )}
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

export function PeopleList({ people, meId }: { people: TeamMember[]; meId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {editing === "new" ? (
        <PersonForm onDone={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className={PRIMARY}>
          Add a person
        </button>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {people.map((p) => (
          <li key={p.id} className={`px-4 py-3 ${p.active ? "" : "opacity-60"}`}>
            {editing === p.id ? (
              <PersonForm person={p} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {p.name}
                    {p.id === meId && <span className="text-muted"> (you)</span>}
                    {!p.active && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted">Paused</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {ROLE_LABEL[p.role]} · {p.email ?? "no email"}
                    {p.callyzerPhone ? ` · Callyzer ${p.callyzerPhone}` : ""}
                    {p.tldvEmail ? ` · tl;dv ${p.tldvEmail}` : ""} · {p.canSignIn ? "can sign in" : "can't sign in yet"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(p.id)} className={BUTTON}>
                    Edit
                  </button>
                  {p.id !== meId && <PauseButton person={p} />}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
