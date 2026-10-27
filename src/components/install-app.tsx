"use client";

// "Install app" in the header: the browser's own install prompt where there is one (Chrome,
// Edge, Android), and a short how-to on an iPhone, where Safari has no prompt. Hidden once the
// app is installed and opened from the home screen.

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** "header": a small button for the laptop header. "menu": a full-width button for the phone menu. */
export function InstallApp({ variant = "header" }: { variant?: "header" | "menu" }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Reading the device once on mount; not render state derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt && !ios) return null;
  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      setPrompt(null);
    } else setShowHow((v) => !v);
  };
  if (variant === "menu") {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={install}
          aria-expanded={prompt ? undefined : showHow}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-opacity active:opacity-85"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path d="M8 2v8m0 0-3-3m3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Install the app on this phone
        </button>
        {showHow && (
          <p role="status" className="mt-2 rounded-lg bg-background px-3 py-2 text-xs text-muted">
            In Safari, tap <b className="text-foreground">Share</b>, then <b className="text-foreground">Add to Home Screen</b>. The app then opens full screen from its own icon.
          </p>
        )}
      </div>
    );
  }
  return (
    <span className="relative">
      <button
        type="button"
        onClick={install}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 font-medium transition-colors hover:bg-foreground/5"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
          <path d="M8 2v8m0 0-3-3m3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Install app
      </button>
      {showHow && (
        <span role="status" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
          On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. The app opens full screen from its own icon.
        </span>
      )}
    </span>
  );
}
