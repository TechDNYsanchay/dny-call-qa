"use client";

// What a page shows when it couldn't load: almost always a moment when the database didn't
// answer. "Try again" reloads the whole page, header included.

import { useState } from "react";

export function ErrorNotice({ error }: { error: unknown }) {
  const [reloading, setReloading] = useState(false);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-2 py-16 text-center sm:py-24">
      <span className="grid size-14 place-items-center rounded-2xl border border-border bg-surface text-muted shadow-sm">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9L20.5 8.5" />
          <path d="M20.5 3.5v5h-5" />
          <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3.5 15.5" />
          <path d="M3.5 20.5v-5h5" />
        </svg>
      </span>
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-balance sm:text-2xl">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-pretty text-muted">
        The connection dropped for a moment while loading it. Nothing was lost; trying again usually works within a few seconds.
      </p>
      <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button
          type="button"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            window.location.reload();
          }}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          <svg viewBox="0 0 16 16" className={`size-4 ${reloading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true">
            <path d="M13.25 8A5.25 5.25 0 1 1 11.7 4.3M13.25 2.75v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {reloading ? "Trying again…" : "Try again"}
        </button>
        {/* A full load on purpose: after an error the header needs reloading too. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Go to the home page
        </a>
      </div>
      {digest && <p className="mt-8 font-mono text-[0.7rem] text-muted">Reference {digest}</p>}
    </div>
  );
}
