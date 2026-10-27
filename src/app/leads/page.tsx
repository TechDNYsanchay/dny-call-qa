import Link from "next/link";
import { Suspense } from "react";
import { Avatar, CalendarIcon, Card, Loading, PageHeader, QualityPill, ScoreFigure, StatTile, StatusLabel } from "@/components/ui";
import { BUDGET, CLIENT_TYPE, FORMAT } from "@/lib/capture";
import { LEAD_STATUSES, listLeads, listPeople, requireMe, type LeadStatus } from "@/lib/data";
import { dateFromText } from "@/lib/follow-ups";
import { formatDay, formatPhone, formatShortDay, LEAD_STATUS_LABEL } from "@/lib/format";

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
  const params = await searchParams;
  const quality = QUALITY.find((q) => q === params.quality) ?? null;
  const status = LEAD_STATUSES.find((s) => s === params.status) ?? null;
  const [leads, people] = await Promise.all([listLeads(), listPeople()]);
  const byStatus = status ? leads.filter((l) => l.status === status) : leads;
  const shown = quality ? byStatus.filter((l) => l.capture.leadQuality === quality) : byStatus;
  const count = (q: Quality) => byStatus.filter((l) => l.capture.leadQuality === q).length;
  const statusCount = (s: LeadStatus) => leads.filter((l) => l.status === s).length;
  const href = (q: Quality | null, s: LeadStatus | null) => {
    const query = new URLSearchParams({ ...(q ? { quality: q } : {}), ...(s ? { status: s } : {}) }).toString();
    return query ? `/leads?${query}` : "/leads";
  };
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Not on the team list";

  const hot = leads.filter((l) => l.capture.leadQuality === "hot").length;
  const meetings = leads.filter((l) => l.capture.vcDateTime).length;
  const won = leads.filter((l) => l.status === "won").length;
  const segment = (active: boolean, first: boolean) =>
    `px-2.5 py-1 ${first ? "" : "border-l border-border"} ${active ? "bg-background font-medium text-foreground" : "text-muted hover:text-foreground"}`;

  return (
    <>
      <PageHeader title={me.canSeeAll ? "Leads" : "My leads"} subtitle="Captured from scored first calls, latest call first" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Leads" value={leads.length} note={`${leads.filter((l) => l.capture.leadQuality === "warm").length} warm, ${leads.filter((l) => l.capture.leadQuality === "cold").length} cold`} />
        <StatTile label="Hot leads" value={hot} note="a concrete plan and a meeting" />
        <StatTile label="Meetings fixed" value={meetings} note="on first calls" />
        <StatTile
          label="Won"
          value={won ? <StatusLabel band="green">{won}</StatusLabel> : <span className="text-muted">0</span>}
          note={`${statusCount("proposal")} proposal${statusCount("proposal") === 1 ? "" : "s"} sent · ${statusCount("lost")} lost`}
        />
      </div>

      {/* Filters in one row above the list. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <nav aria-label="Lead status" className="inline-flex flex-wrap overflow-hidden rounded-md border border-border bg-surface">
          {[null, ...LEAD_STATUSES].map((s, i) => (
            <Link key={s ?? "all"} href={href(quality, s)} aria-current={status === s ? "true" : undefined} className={segment(status === s, i === 0)}>
              {s ? (
                <>
                  {LEAD_STATUS_LABEL[s]} <span className="tabular-nums text-muted">{statusCount(s)}</span>
                </>
              ) : (
                "Any status"
              )}
            </Link>
          ))}
        </nav>
        <nav aria-label="Lead quality" className="inline-flex overflow-hidden rounded-md border border-border bg-surface">
          {[null, ...QUALITY].map((q, i) => (
            <Link key={q ?? "all"} href={href(q, status)} aria-current={quality === q ? "true" : undefined} className={segment(quality === q, i === 0)}>
              {q ? (
                <>
                  {QUALITY_LABEL[q]} <span className="tabular-nums text-muted">{count(q)}</span>
                </>
              ) : (
                "Any quality"
              )}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted">
          Showing {shown.length} of {leads.length}
        </span>
      </div>

      <Card>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium sm:px-5">Lead</th>
                <th className="px-2 py-2 font-medium">What they want</th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">Quality · status</th>
                <th className="px-2 py-2 font-medium">Meeting</th>
                <th className="px-4 py-2 font-medium sm:px-5">Last scored call</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((lead) => {
                const c = lead.capture;
                const what = [c.clientType && CLIENT_TYPE[c.clientType], c.format && FORMAT[c.format]].filter(Boolean).join(" · ");
                const name = c.clientName ?? (lead.phone ? formatPhone(lead.phone) : "Unknown");
                return (
                  <tr key={lead.id} className="border-b border-border align-top transition-colors last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3.5 sm:px-5">
                      <div className="flex items-start gap-3">
                        <Avatar name={c.clientName ?? ""} />
                        <div className="min-w-0">
                          <Link href={`/leads/${lead.id}`} title={name} className="block max-w-[12rem] truncate font-medium hover:underline">
                            {name}
                          </Link>
                          <div className="text-xs text-muted">
                            {[c.city, c.clientName && lead.phone ? formatPhone(lead.phone) : null].filter(Boolean).join(" · ") || "–"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[18rem] px-2 py-3.5">
                      <div className="font-medium">{what || <span className="font-normal text-muted">–</span>}</div>
                      {c.concept && (
                        <div className="truncate text-xs text-muted" title={c.concept}>
                          {c.concept}
                        </div>
                      )}
                      {c.budgetBand && <div className="mt-1 text-xs">Budget {BUDGET[c.budgetBand]}</div>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3.5">
                      <div>{c.leadQuality ? <QualityPill quality={c.leadQuality} /> : <span className="text-xs text-muted">–</span>}</div>
                      <div className="mt-1 text-xs">
                        {lead.status === "won" ? (
                          <StatusLabel band="green">Won</StatusLabel>
                        ) : (
                          <span className={lead.status === "lost" ? "text-muted line-through decoration-muted/60" : lead.status === "open" ? "text-muted" : "font-medium"}>
                            {LEAD_STATUS_LABEL[lead.status]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[11rem] px-2 py-3.5">
                      {c.vcDateTime ? (
                        // The date at a glance; the meeting as said, on one line with the rest on hover.
                        <span className="flex items-start gap-1.5" title={c.vcDateTime}>
                          <CalendarIcon />
                          <span className="min-w-0">
                            <span className="block whitespace-nowrap font-medium">
                              {meetingDay(c.vcDate ?? dateFromText(c.vcDateTime, lead.lastCall?.startedAt.slice(0, 10) ?? "2026-01-01"))}
                            </span>
                            <span className="block truncate text-xs text-muted">{c.vcDateTime}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Not fixed</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 sm:px-5">
                      {lead.lastCall ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/calls/${lead.lastCall.id}`} className="whitespace-nowrap font-medium hover:underline">
                              {formatDay(lead.lastCall.startedAt).replace(/ \d{4}$/, "")}
                            </Link>
                            <div className="text-xs text-muted">
                              {nameOf(lead.lastCall.personId)}
                              {lead.callCount > 1 ? ` · ${lead.callCount} calls` : ""}
                            </div>
                          </div>
                          {lead.lastCall.score !== null && lead.lastCall.band && <ScoreFigure score={lead.lastCall.score} band={lead.lastCall.band} size="md" />}
                        </div>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted sm:px-5">
                    {leads.length === 0 ? "No leads yet: they appear once calls are scored." : "No leads match these filters."}
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

/** "2026-10-25" -> "Sun 25 Oct"; the text itself when the date couldn't be read. */
function meetingDay(date: string | null): string {
  if (!date) return "Meeting fixed";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${formatShortDay(date)}`;
}
