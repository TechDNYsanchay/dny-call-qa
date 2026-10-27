"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef } from "react";
import { pinExample, removeExample, type ExampleState } from "./actions";

function useExampleAction(action: (prev: ExampleState, form: FormData) => Promise<ExampleState>) {
  const router = useRouter();
  return useActionState<ExampleState, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (result.done) router.refresh();
    return result;
  }, {});
}

const BUTTON = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-60";

export function PinButton({ questionId, callId, startSec, quote, speaker }: { questionId: string; callId: string; startSec: number; quote: string; speaker: "agent" | "client" }) {
  const [state, action, pending] = useExampleAction(pinExample);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="callId" value={callId} />
      <input type="hidden" name="startSec" value={startSec} />
      <input type="hidden" name="quote" value={quote} />
      <input type="hidden" name="speaker" value={speaker} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Pinning…" : "Pin as example"}
      </button>
      {state.error && <span className="text-xs text-critical">{state.error}</span>}
    </form>
  );
}

export function RemoveButton({ id }: { id: string }) {
  const [state, action, pending] = useExampleAction(removeExample);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Removing…" : "Remove"}
      </button>
      {state.error && <span className="text-xs text-critical">{state.error}</span>}
    </form>
  );
}

/** Plays only the clip: from `start` to `end` seconds of the recording. */
export function ClipPlayer({ url, start, end }: { url: string; start: number; end: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  return (
    <audio
      ref={ref}
      controls
      preload="none"
      src={`${url}#t=${start},${end}`}
      onPlay={() => {
        const a = ref.current;
        if (a && (a.currentTime < start - 1 || a.currentTime >= end)) a.currentTime = start;
      }}
      className="h-9 w-full max-w-md"
    >
      Your browser can&apos;t play this recording.
    </audio>
  );
}
