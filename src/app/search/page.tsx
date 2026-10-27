import Link from "next/link";
import { Suspense } from "react";
import { BandBadge, Card, Chip, Loading, PageHeader } from "@/components/ui";
import { listPeople, requireMe, search, searchTerm } from "@/lib/data";
import { formatClock, formatDay, formatDuration, formatPhone, formatTimestamp, IN_PROGRESS_LABEL, NOT_SCORED_LABEL } from "@/lib/format";

export const metadata = { title: "Search · DNY Sales Agent" };

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
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Not on the team list";

  return (
    <>
      <PageHeader title="Search" subtitle={term ? `“${term}”: ${plural(leads.length, "lead")}, ${plural(calls.length, "call")} by phone, ${plural(said.length, "call")} where it was said` : "Search by a client's name, phone, email, city or what they want, or by anything said on a call"}>
        <form action="/search" className="flex gap-2">
          <input name="q" defaultValue={query} placeholder="e.g. Mohit, 94136, Noida, franchise" aria-label="Search" className="w-64 rounded-md border border-border bg-surface px-3 py-1.5 text-sm" />
          <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </PageHeader>
      {term.length >= 2 && (
        <div className="space-y-6">
          <Card title="Leads">
            {leads.length ? (
              <ul className="divide-y divide-border">
                {leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                        {l.capture.clientName ?? (l.phone ? formatPhone(l.phone) : "Unknown")}
                      </Link>
                      <div className="text-xs text-muted">{[l.capture.city, l.phone ? formatPhone(l.phone) : null, l.capture.concept].filter(Boolean).join(" · ")}</div>
                    </div>
                    {l.lastCall?.score != null && l.lastCall.band && <BandBadge score={l.lastCall.score} band={l.lastCall.band} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No leads match. Leads appear once a call with them is scored.</p>
            )}
          </Card>
          {said.length > 0 && (
            <Card title="Said on calls">
              <ul className="divide-y divide-border">
                {said.map(({ call: c, lines }) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <Link href={`/calls/${c.id}`} className="font-medium hover:underline">
                        {c.client.name} · {nameOf(c.personId)} · {formatDay(c.startedAt)}, {formatClock(c.startedAt)}
                      </Link>
                      {c.final && <BandBadge score={c.final.score} band={c.final.band} />}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {lines.slice(0, 3).map((l) => (
                        <li key={l.startSec}>
                          <Link href={`/calls/${c.id}?t=${Math.floor(l.startSec)}`} className="flex gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-background">
                            <span className="w-12 shrink-0 font-mono text-xs leading-5 text-muted tabular-nums">{formatTimestamp(l.startSec)}</span>
                            <span className="min-w-0">
                              <Highlight text={l.text} term={term} />
                            </span>
                          </Link>
                        </li>
                      ))}
                      {lines.length > 3 && <li className="px-1 text-xs text-muted">and {lines.length - 3} more in this call</li>}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {calls.length > 0 && (
            <Card title="Calls with that number">
              <ul className="divide-y divide-border">
                {calls.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <Link href={`/calls/${c.id}`} className="hover:underline">
                      {formatDay(c.startedAt)}, {formatClock(c.startedAt)} · {c.client.name} · {nameOf(c.personId)} · {formatDuration(c.durationSec)}
                    </Link>
                    {c.final ? (
                      <BandBadge score={c.final.score} band={c.final.band} />
                    ) : (
                      <Chip>{c.notScored ? NOT_SCORED_LABEL[c.notScored] : c.inProgress ? IN_PROGRESS_LABEL[c.inProgress] : "Not scored"}</Chip>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

/** The text with each case-insensitive match of `term` marked. */
function Highlight({ text, term }: { text: string; term: string }) {
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"));
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded-sm bg-brand/15 px-0.5 text-foreground">{part}</mark> : part));
}
