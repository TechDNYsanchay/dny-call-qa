"use client";

// Jumps straight to a chosen day. Keeps the page's other filters (e.g. scored only).

import { useRouter } from "next/navigation";

export function DayPicker({
  path,
  day,
  first,
  latest,
  params,
}: {
  path: string;
  day: string;
  first: string | null;
  latest: string | null;
  params: Record<string, string>;
}) {
  const router = useRouter();

  function go(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value === day) return;
    const query = new URLSearchParams(params);
    if (value !== latest) query.set("day", value);
    const qs = query.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  return (
    <input
      // A new day remounts the input, so it always shows the day on screen.
      key={day}
      type="date"
      aria-label="Go to a day"
      defaultValue={day}
      min={first ?? undefined}
      max={latest ?? undefined}
      onChange={(e) => go(e.target.value)}
      className="rounded-md border border-border bg-surface px-2 py-1 text-sm tabular-nums"
    />
  );
}
