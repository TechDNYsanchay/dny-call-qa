import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BandBadge, Card, Chip, Loading, PageHeader } from "@/components/ui";
import { firstCallRows } from "@/lib/capture";
import { getLead, listPeople, requireMe } from "@/lib/data";
import { formatClock, formatDay, formatDuration, formatPhone, IN_PROGRESS_LABEL, LEAD_STATUS_LABEL, NOT_SCORED_LABEL } from "@/lib/format";
import { LeadEditor } from "./lead-editor";

export default function LeadPage({ params }: PageProps<"/leads/[id]">) {
  return (
    <Suspense fallback={<Loading what="lead" />}>
      <Lead params={params} />
    </Suspense>
  );
}

async function Lead({ params }: Pick<PageProps<"/leads/[id]">, "params">) {
  const { id } = await params;
  const me = await requireMe();
  // Row-level security returns nothing for a lead the viewer may not see, so it reads as not found.
  const [lead, people] = await Promise.all([getLead(id), listPeople()]);
  if (!lead) notFound();
  const name = lead.capture?.clientName ?? lead.name ?? (lead.phone ? formatPhone(lead.phone) : "Unknown client");
  const nameOf = (personId: string) => people.find((p) => p.id === personId)?.name ?? "Not on the team list";
  const owners = people.filter((p) => p.role !== "admin").map((p) => ({ id: p.id, name: p.name }));

  return (
    <>
      <Link href="/leads" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← All leads
      </Link>
      <PageHeader
        title={name}
        subtitle={[lead.capture?.city, lead.phone ? formatPhone(lead.phone) : null, lead.email, `${lead.calls.length} call${lead.calls.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
      >
        <Chip>{LEAD_STATUS_LABEL[lead.status]}</Chip>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Outcome">
          {me.canSeeAll ? (
            <LeadEditor
              id={lead.id}
              status={lead.status}
              stage={lead.stage}
              ownerId={lead.ownerId}
              valueInr={lead.valueInr}
              notes={lead.notes}
              owners={owners}
            />
          ) : (
            <dl className="space-y-1 text-sm">
              <div>Status: {LEAD_STATUS_LABEL[lead.status]}</div>
              {lead.stage && <div>Stage {lead.stage}</div>}
            </dl>
          )}
          {lead.statusUpdatedAt && <p className="mt-3 text-xs text-muted">Status last changed {formatDay(lead.statusUpdatedAt)}, {formatClock(lead.statusUpdatedAt)}</p>}
        </Card>
        <Card title="Captured on calls">
          {lead.capture ? (
            <dl className="space-y-2 text-sm">
              {firstCallRows(lead.capture).map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className={value === "Not captured" || value === "Not answered" ? "text-muted" : ""}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">Nothing captured yet: details appear once a call with this lead is scored.</p>
          )}
        </Card>
      </div>

      <Card title="Calls" className="mt-6">
        <ul className="divide-y divide-border">
          {lead.calls.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <Link href={`/calls/${c.id}`} className="hover:underline">
                {formatDay(c.startedAt)}, {formatClock(c.startedAt)} · {nameOf(c.personId)} · {formatDuration(c.durationSec)}
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
    </>
  );
}
