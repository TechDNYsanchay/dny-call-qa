import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Avatar, Card, Loading, PageHeader, QualityPill, StatusLabel } from "@/components/ui";
import { listPeople, requireMe, search, searchTerm, type CallRecord } from "@/lib/data";
import { formatClock, formatDay, formatDuration, formatPhone, formatTimestamp, IN_PROGRESS_LABEL, NOT_SCORED_LABEL } from "@/lib/format";

export const metadata = { title: "Search · DNY Sales Agent" };

const EXAMPLES = ["Mohit", "94136", "Noida", "franchise", "cloud kitchen"];

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <Suspense fallback={<Loading what="results" />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  await requireMe();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : "";
  const term = searchTerm(query);
  const [{ leads, calls, said }, people] = await Promise.all([search(query), listPeople()]);
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Not on the team list";
  const searched = term.length >= 2;
  const total = leads.length + calls.length + said.length;

  return (
    <>
      <PageHeader title="Search" subtitle="Clients by name, phone, email, city or what they want, and anything said on a call." />

      <Card className="mb-6">
        <form action="/search" className="flex flex-wrap gap-2" role="search">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search</span>
            <SearchIcon />
            <input
              name="q"
              defaultValue={query}
              autoFocus={!query}
              placeholder="Search leads and calls"
              className="w-full rounded-lg border border-border bg-background py-2.5 pr-3 pl-10 text-base outline-none focus:border-foreground/40"
            />
          </label>
          <button type="submit" className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white">
            Search
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Try</span>
          {EXAMPLES.map((e) => (
            <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="rounded-full border border-border px-2.5 py-0.5 text-muted hover:bg-background hover:text-foreground">
              {e}
            </Link>
          ))}
        </div>
      </Card>

      {searched && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {total} result{total === 1 ? "" : "s"} for “{term}”
            </span>
            <span className="text-xs text-muted">
              {leads.length} lead{leads.length === 1 ? "" : "s"} · {said.length} call{said.length === 1 ? "" : "s"} where it was said
              {calls.length ? ` · ${calls.length} call${calls.length === 1 ? "" : "s"} with that number` : ""}
            </span>
          </div>

          {total === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm text-muted">
                Nothing found. Try part of a name, the last 4 or 5 digits of a number, a city, or a word the client would have said.
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {leads.length > 0 && (
                <Section title="Leads" count={leads.length}>
                  {leads.map((l) => {
                    const name = l.capture.clientName ?? (l.phone ? formatPhone(l.phone) : "Unknown");
                    return (
                      <li key={l.id} className={ROW}>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={l.capture.clientName ?? ""} />
                          <div className="min-w-0">
                            <Link href={`/leads/${l.id}`} className="block max-w-md truncate font-medium hover:underline">
                              <Highlight text={name} term={term} />
                            </Link>
                            <div className="max-w-xl truncate text-xs text-muted">
                              <Highlight text={[l.capture.city, l.phone ? formatPhone(l.phone) : null, l.capture.concept].filter(Boolean).join(" · ")} term={term} />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          {l.capture.leadQuality && l.capture.leadQuality !== "cold" && <QualityPill quality={l.capture.leadQuality} />}
                          {l.lastCall?.score != null && l.lastCall.band && <StatusLabel band={l.lastCall.band}>{l.lastCall.score}</StatusLabel>}
                        </div>
                      </li>
                    );
                  })}
                </Section>
              )}

              {said.length > 0 && (
                <Section title="Said on calls" count={said.length}>
                  {said.map(({ call: c, lines }) => (
                    <li key={c.id} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={nameOf(c.personId)} />
                          <div className="min-w-0 text-sm">
                            <Link href={`/calls/${c.id}`} className="block max-w-md truncate font-medium hover:underline" title={c.client.name}>
                              {c.client.name}
                            </Link>
                            <div className="text-xs text-muted">
                              {nameOf(c.personId)} · {formatDay(c.startedAt)}, {formatClock(c.startedAt)} · {formatDuration(c.durationSec)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs">{c.final && <StatusLabel band={c.final.band}>{c.final.score}</StatusLabel>}</span>
                      </div>
                      <ul className="mt-2 space-y-1 sm:pl-11">
                        {lines.slice(0, 3).map((l) => (
                          <li key={l.startSec}>
                            <Link
                              href={`/calls/${c.id}?t=${Math.floor(l.startSec)}`}
                              title="Play the call from here"
                              className="group flex gap-3 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-background"
                            >
                              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-background px-1.5 font-mono text-2xs tabular-nums text-muted group-hover:text-foreground">
                                <PlayIcon />
                                {formatTimestamp(l.startSec)}
                              </span>
                              <span className="min-w-0">
                                <Highlight text={l.text} term={term} />
                              </span>
                            </Link>
                          </li>
                        ))}
                        {lines.length > 3 && <li className="px-2 text-xs text-muted">and {lines.length - 3} more in this call</li>}
                      </ul>
                    </li>
                  ))}
                </Section>
              )}

              {calls.length > 0 && (
                <Section title="Calls with that number" count={calls.length}>
                  {calls.map((c) => (
                    <li key={c.id} className={ROW}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={nameOf(c.personId)} />
                        <div className="min-w-0 text-sm">
                          <Link href={`/calls/${c.id}`} className="block max-w-md truncate font-medium hover:underline" title={c.client.name}>
                            {c.client.name}
                          </Link>
                          <div className="text-xs text-muted">
                            {nameOf(c.personId)} · {formatDay(c.startedAt)}, {formatClock(c.startedAt)} · {c.durationSec > 0 ? formatDuration(c.durationSec) : "not connected"}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs">
                        <CallResult call={c} />
                      </span>
                    </li>
                  ))}
                </Section>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

const ROW = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-background/60 sm:px-5";

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-full border border-border px-2 py-px text-xs tabular-nums text-muted">{count}</span>
      </div>
      <ul className="-mx-4 divide-y divide-border border-t border-border sm:-mx-5">{children}</ul>
    </Card>
  );
}

function CallResult({ call: c }: { call: CallRecord }) {
  if (c.final) return <StatusLabel band={c.final.band}>{c.final.score}</StatusLabel>;
  return <span className="text-muted">{c.notScored ? NOT_SCORED_LABEL[c.notScored] : c.inProgress ? IN_PROGRESS_LABEL[c.inProgress] : "Not scored"}</span>;
}

/** The text with each case-insensitive match of `term` marked. */
function Highlight({ text, term }: { text: string; term: string }) {
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"));
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded-sm bg-brand/15 px-0.5 text-foreground">{part}</mark> : part));
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
      <path d="M3.5 2.2v7.6L9.6 6Z" fill="currentColor" />
    </svg>
  );
}
