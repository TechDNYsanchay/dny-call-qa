import Link from "next/link";
import { Suspense } from "react";
import { BandBadge, Card, Loading, PageHeader } from "@/components/ui";
import { BUDGET, CLIENT_TYPE, FORMAT } from "@/lib/capture";
import { listLeads, listPeople, requireMe } from "@/lib/data";
import { formatDay, formatPhone } from "@/lib/format";

export const metadata = { title: "Leads · DNY Sales Agent" };

// What each scored first call captured about the client, in place of the photo-to-CRM step.
const QUALITY = ["hot", "warm", "cold"] as const;
type Quality = (typeof QUALITY)[number];
const QUALITY_LABEL: Record<Quality, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

export default function LeadsPage({ searchParams }: PageProps<"/leads">) {
  return (
    <Suspense fallback={<Loading what="leads" />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}

async function Leads({ searchParams }: Pick<PageProps<"/leads">, "searchParams">) {
  const me = await requireMe();
  const requested = (await searchParams).quality;
  const quality = QUALITY.find((q) => q === requested) ?? null;
  const [leads, people] = await Promise.all([listLeads(), listPeople()]);
  const shown = quality ? leads.filter((l) => l.capture.leadQuality === quality) : leads;
  const count = (q: Quality) => leads.filter((l) => l.capture.leadQuality === q).length;
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Not on the team list";

  return (
    <>
      <PageHeader
        title={me.canSeeAll ? "Leads" : "My leads"}
        subtitle={`${shown.length} of ${leads.length} leads · captured from scored first calls, latest call first`}
      >
        <nav aria-label="Lead quality" className="inline-flex overflow-hidden rounded-md border border-border bg-surface text-sm">
          {[null, ...QUALITY].map((q, i) => (
            <Link
              key={q ?? "all"}
              href={q ? `/leads?quality=${q}` : "/leads"}
              aria-current={quality === q ? "true" : undefined}
              className={`px-2.5 py-1 ${i > 0 ? "border-l border-border" : ""} ${quality === q ? "bg-background font-medium" : "text-muted hover:text-foreground"}`}
            >
              {q ? `${QUALITY_LABEL[q]} ${count(q)}` : "All"}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <Card>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Lead</th>
                <th className="px-2 py-2 font-medium">What they want</th>
                <th className="px-2 py-2 font-medium">Budget</th>
                <th className="px-2 py-2 font-medium">Quality</th>
                <th className="px-2 py-2 font-medium">Meeting</th>
                <th className="px-4 py-2 font-medium sm:px-5">Last scored call</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((lead) => {
                const c = lead.capture;
                const what = [c.clientType && CLIENT_TYPE[c.clientType], c.format && FORMAT[c.format]].filter(Boolean).join(" · ");
                return (
                  <tr key={lead.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="font-medium">{c.clientName ?? (lead.phone ? formatPhone(lead.phone) : "Unknown")}</div>
                      <div className="text-xs text-muted">
                        {[c.city, c.clientName && lead.phone ? formatPhone(lead.phone) : null, lead.email].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div>{what || "–"}</div>
                      {c.concept && <div className="text-xs text-muted">{c.concept}</div>}
                    </td>
                    <td className="px-2 py-3">{c.budgetBand ? BUDGET[c.budgetBand] : <span className="text-muted">–</span>}</td>
                    <td className="px-2 py-3">
                      {c.leadQuality ? <span className={c.leadQuality === "hot" ? "font-medium" : ""}>{QUALITY_LABEL[c.leadQuality]}</span> : "–"}
                    </td>
                    <td className="px-2 py-3">{c.vcDateTime ?? <span className="text-muted">Not fixed</span>}</td>
                    <td className="px-4 py-3 sm:px-5">
                      {lead.lastCall ? (
                        <Link href={`/calls/${lead.lastCall.id}`} className="block hover:underline">
                          <span className="whitespace-nowrap">{formatDay(lead.lastCall.startedAt)}</span>
                          {lead.lastCall.score !== null && lead.lastCall.band && (
                            <span className="ml-2">
                              <BandBadge score={lead.lastCall.score} band={lead.lastCall.band} />
                            </span>
                          )}
                          <div className="text-xs text-muted">
                            {nameOf(lead.lastCall.personId)}
                            {lead.callCount > 1 ? ` · ${lead.callCount} calls` : ""}
                          </div>
                        </Link>
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted sm:px-5">
                    {leads.length === 0 ? "No leads yet: they appear once calls are scored." : "No leads with this quality."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
