// Earlier / later buttons for pages that show one day of calls. They jump to the nearest day
// that has calls; the latest day keeps the page's plain address.

import Link from "next/link";
import { formatShortDay } from "@/lib/format";

const BUTTON = "inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-background";

export function DayNav({
  path,
  day,
  latest,
  previous,
  next,
}: {
  path: string;
  day: string;
  latest: string | null;
  previous: string | null;
  next: string | null;
}) {
  const href = (d: string) => (d === latest ? path : `${path}?day=${d}`);
  return (
    <nav aria-label="Choose a day" className="flex flex-wrap items-center gap-2 text-sm">
      {previous ? (
        <Link href={href(previous)} className={BUTTON} title="Earlier day with calls">
          ← {formatShortDay(previous)}
        </Link>
      ) : (
        <span className={`${BUTTON} text-muted opacity-60`}>← Earlier</span>
      )}
      {next ? (
        <Link href={href(next)} className={BUTTON} title="Later day with calls">
          {formatShortDay(next)} →
        </Link>
      ) : (
        <span className={`${BUTTON} text-muted opacity-60`}>Later →</span>
      )}
      {latest && day !== latest && (
        <Link href={path} className="px-1 text-brand hover:underline">
          Latest
        </Link>
      )}
    </nav>
  );
}
