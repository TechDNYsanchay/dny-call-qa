import Link from "next/link";
import { Suspense } from "react";
import { BandBadge, Card, Chip, Loading, PageHeader } from "@/components/ui";
import { listPeople, requireMe, search, searchTerm } from "@/lib/data";
import { formatClock, formatDay, formatDuration, formatPhone, IN_PROGRESS_LABEL, NOT_SCORED_LABEL } from "@/lib/format";

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
  const [{ leads, calls }, people] = await Promise.all([search(query), listPeople()]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Not on the team list";

  return (
    <>
      <PageHeader title="Search" subtitle={term ? `“${term}”: ${leads.length} lead${leads.length === 1 ? "" : "s"}, ${calls.length} call${calls.length === 1 ? "" : "s"} by phone` : "Search by a client's name, phone, email, city or what they want"}>
        <form action="/search" className="flex gap-2">
          <input name="q" defaultValue={query} placeholder="e.g. Mohit, 94136, Noida, QSR" aria-label="Search" className="w-64 rounded-md border border-border bg-surface px-3 py-1.5 text-sm" />
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
