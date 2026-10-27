"use client";

import { LogoMark } from "@/components/app-nav";
import { ErrorNotice } from "@/components/error-notice";
import { fontClasses } from "./fonts";
import "./globals.css";

/** Replaces the whole page when even the header failed to load; it draws its own header. */
export default function GlobalError({ error }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className={`${fontClasses} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>Couldn&apos;t load · DNY Sales Agent</title>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
            {/* A full load on purpose: after an error the header needs reloading too. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <LogoMark />
              Sales Agent
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4">
          <ErrorNotice error={error} />
        </main>
      </body>
    </html>
  );
}
