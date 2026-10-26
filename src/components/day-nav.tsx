// Earlier / later buttons and a date picker for pages that show one day of calls. The buttons
// jump to the nearest day that has calls; the latest day keeps the page's plain address.

import Link from "next/link";
import { DayPicker } from "@/components/day-picker";
import { formatShortDay } from "@/lib/format";

const BUTTON = "inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-background";

export function DayNav({
  path,
  day,
  first,
  latest,
  previous,
  next,
  params = {},
}: {
  path: string;
  day: string;
  first: string | null;
  latest: string | null;
  previous: string | null;
  next: string | null;
  /** Other query parameters to keep, e.g. { scored: "1" }. */
  params?: Record<string, string>;
}) {
  const href = (d: string | null) => {
    const query = new URLSearchParams(params);
    if (d && d !== latest) query.set("day", d);
    const qs = query.toString();
    return qs ? `${path}?${qs}` : path;
  };
  return (
    <nav aria-label="Choose a day" className="flex flex-wrap items-center gap-2 text-sm">
      {previous ? (
        <Link href={href(previous)} className={BUTTON} title="Earlier day with calls">
          ← {formatShortDay(previous)}
        </Link>
      ) : (
        <span className={`${BUTTON} text-muted opacity-60`}>← Earlier</span>
      )}
      <DayPicker path={path} day={day} first={first} latest={latest} params={params} />
      {next ? (
        <Link href={href(next)} className={BUTTON} title="Later day with calls">
          {formatShortDay(next)} →
        </Link>
      ) : (
        <span className={`${BUTTON} text-muted opacity-60`}>Later →</span>
      )}
      {latest && day !== latest && (
        <Link href={href(null)} className="px-1 text-brand hover:underline">
          Latest
        </Link>
      )}
    </nav>
  );
}
