"use client";

// "Install app" in the header: the browser's own install prompt where there is one (Chrome,
// Edge, Android), and a short how-to on an iPhone, where Safari has no prompt. Hidden once the
// app is installed and opened from the home screen.

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function InstallApp() {
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
  return (
    <span className="relative">
      <button
        type="button"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            setPrompt(null);
          } else setShowHow((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-background"
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
