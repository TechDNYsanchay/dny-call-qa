// The Roll-ups page's two pattern cards: when clients pick up (by hour), and how fast missed
// calls are returned.

import Link from "next/link";
import { Avatar, StatusLabel } from "@/components/ui";
import { formatWait, hourLabel, MIN_ATTEMPTS, summariseResponses, type HourStat, type MissedResponse } from "@/lib/call-patterns";
import { MISSED_OVERDUE_HOURS } from "@/lib/follow-ups";

/** One bar per hour: the share of outgoing calls that connected. Hours with few calls are faded. */
export function PickupChart({ hours }: { hours: HourStat[] }) {
  const attempts = hours.reduce((s, h) => s + h.attempts, 0);
  if (attempts === 0) return <p className="text-sm text-muted">No outgoing calls in this period.</p>;
  const connected = hours.reduce((s, h) => s + h.connected, 0);
  const overall = connected / attempts;
  const rate = (h: HourStat) => (h.attempts ? h.connected / h.attempts : 0);
  const readable = hours.filter((h) => h.attempts >= MIN_ATTEMPTS);
  const best = readable.length ? readable.reduce((a, b) => (rate(b) > rate(a) ? b : a)) : null;
  const worst = readable.length > 1 ? readable.reduce((a, b) => (rate(b) < rate(a) ? b : a)) : null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div>
      <p className="mb-4 text-sm">
        {best && (
          <>
            Best hour <b>{hourLabel(best.hour)}</b>: {pct(rate(best))} picked up.{" "}
          </>
        )}
        {worst && worst.hour !== best?.hour && (
          <span className="text-muted">
            Lowest {hourLabel(worst.hour)}: {pct(rate(worst))}.{" "}
          </span>
        )}
        <span className="text-muted">
          Overall {connected} of {attempts} calls connected ({pct(overall)}).
        </span>
      </p>
      <div className="relative">
        {/* The period's average, as a faint guide across the bars. */}
        <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `calc(1.5rem + ${overall} * 8rem)` }} aria-hidden="true" />
        <ol className="flex items-end gap-1" aria-label="Share of outgoing calls that connected, by hour">
          {hours.map((h) => {
            const r = rate(h);
            const few = h.attempts < MIN_ATTEMPTS;
            return (
              <li key={h.hour} tabIndex={0} className="group relative flex min-w-0 flex-1 flex-col items-center outline-none">
                <span className="flex h-32 w-full items-end justify-center">
                  {h.attempts > 0 ? (
                    <span
                      className={`block w-full max-w-7 rounded-t-[4px] bg-series ${few ? "opacity-35" : ""} ${h.hour === best?.hour ? "" : "group-hover:opacity-80"}`}
                      style={{ height: `${Math.max(3, r * 100)}%` }}
                    />
                  ) : (
                    <span className="mb-1 text-2xs text-muted">–</span>
                  )}
                </span>
                <span className="mt-1 h-5 text-2xs leading-5 whitespace-nowrap text-muted">{h.hour % 3 === 0 || h.hour === hours[0].hour ? hourLabel(h.hour) : h.hour % 12 || 12}</span>
                {h.hour === best?.hour && <span className="absolute -top-5 text-2xs font-semibold tabular-nums">{pct(r)}</span>}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm group-hover:block group-focus-visible:block"
                >
                  <span className="block font-medium">{hourLabel(h.hour)}</span>
                  <span className="block text-muted">
                    {h.attempts ? `${h.connected} of ${h.attempts} calls picked up (${pct(r)})` : "No calls made"}
                    {few && h.attempts > 0 ? " · few calls" : ""}
                  </span>
                  {h.incoming > 0 && <span className="block text-muted">{h.incoming} client{h.incoming === 1 ? "" : "s"} called in</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-3 text-xs text-muted">Outgoing calls only. Faded bars have fewer than {MIN_ATTEMPTS} calls; the dashed line is the average.</p>
    </div>
  );
}

/** Missed client calls in the period: how many were called back within 2 hours, and how fast. */
export function ResponseCard({ responses, nameOf, showPeople }: { responses: MissedResponse[]; nameOf: (id: string) => string; showPeople: boolean }) {
  const s = summariseResponses(responses);
  if (s.missed === 0) return <p className="text-sm text-muted">No missed client calls in this period.</p>;
  const people = [...new Set(responses.map((r) => r.personId))].map((id) => ({ id, s: summariseResponses(responses.filter((r) => r.personId === id)) }));
  const pct = (n: number) => `${Math.round((n / s.missed) * 100)}%`;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3">
        <Tile label="Missed client calls" value={s.missed} note={s.handled ? `${s.handled} marked handled` : undefined} />
        <Tile label={`Called back within ${MISSED_OVERDUE_HOURS} h`} value={`${s.withinTarget}`} note={`${pct(s.withinTarget)} of missed calls`} />
        <Tile label="Typical wait for a call back" value={s.medianMinutes === null ? "–" : formatWait(s.medianMinutes)} note="median, over the ones called back" />
        <Tile label="Never called back" value={s.never ? <StatusLabel band="red">{s.never}</StatusLabel> : <span className="text-good-ink">0</span>} note={s.never ? undefined : "every client called back"} />
      </dl>
      {showPeople && people.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-t border-border text-sm">
          {people.map(({ id, s: p }) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2.5">
                <Avatar name={nameOf(id)} />
                {nameOf(id)}
              </span>
              <span className="text-xs text-muted">
                {p.withinTarget} of {p.missed} within {MISSED_OVERDUE_HOURS} h
                {p.medianMinutes !== null ? ` · typical ${formatWait(p.medianMinutes)}` : ""}
                {p.never ? (
                  <>
                    {" · "}
                    <span className="text-critical-ink">{p.never} never</span>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        A call back is any call DNY makes to the number, or any call that connects. Today&apos;s open ones are on{" "}
        <Link href="/follow-ups" className="underline-offset-2 hover:text-foreground hover:underline">
          Follow-ups
        </Link>
        .
      </p>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {note && <div className="text-2xs text-muted">{note}</div>}
    </div>
  );
}
