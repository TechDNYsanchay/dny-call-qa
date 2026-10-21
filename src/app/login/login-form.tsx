"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "./actions";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendSignInLink, {});

  if (state.sent) {
    return (
      <div role="status" className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
        <p>
          If <strong>{state.sent}</strong> is on the DNY team list, a sign-in link is on its way. It works once and expires in an hour.
        </p>
        <p className="text-muted">
          Nothing after a few minutes? Check spam, or{" "}
          <a href="/login" className="text-brand hover:underline">
            send it again
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {notice && (
        <p role="alert" className="rounded-lg border border-critical/40 px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="block text-sm font-medium">
        Work email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@dnyhospitality.com"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground"
      />
      {state.error && (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
