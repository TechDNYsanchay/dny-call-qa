import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar, CalendarIcon, Card, Loading, QualityPill, ScoreFigure, StatTile, StatusLabel } from "@/components/ui";
import { firstCallRows } from "@/lib/capture";
import { getLead, listPeople, requireMe, type LeadStatus } from "@/lib/data";
import { dateFromText } from "@/lib/follow-ups";
import { formatClock, formatDay, formatDuration, formatPhone, formatShortDay, IN_PROGRESS_LABEL, LEAD_STATUS_LABEL, NOT_SCORED_LABEL } from "@/lib/format";
import { LeadEditor } from "./lead-editor";

export default function LeadPage({ params }: PageProps<"/leads/[id]">) {
  return (
    <Suspense fallback={<Loading what="lead" />}>
      <Lead params={params} />
    </Suspense>
  );
}

/** Where a lead goes after the first call; Lost sits outside the line. */
const PIPELINE: LeadStatus[] = ["open", "vc_held", "proposal", "won"];
const STEP_LABEL: Record<LeadStatus, string> = { open: "First call", vc_held: "Vision call held", proposal: "Proposal sent", won: "Won", lost: "Lost" };
const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

async function Lead({ params }: Pick<PageProps<"/leads/[id]">, "params">) {
  const { id } = await params;
  const me = await requireMe();
  // Row-level security returns nothing for a lead the viewer may not see, so it reads as not found.
  const [lead, people] = await Promise.all([getLead(id), listPeople()]);
  if (!lead) notFound();
  const name = lead.capture?.clientName ?? lead.name ?? (lead.phone ? formatPhone(lead.phone) : "Unknown client");
  const nameOf = (personId: string | null) => people.find((p) => p.id === personId)?.name ?? "Not on the team list";
  const owners = people.filter((p) => p.role !== "admin").map((p) => ({ id: p.id, name: p.name }));
  const latestScored = lead.calls.find((c) => c.final);
  const connected = lead.calls.filter((c) => c.durationSec > 0).length;
  const meeting = lead.capture?.vcDateTime ?? null;
  const meetingDate = meeting ? (lead.capture?.vcDate ?? dateFromText(meeting, latestScored?.startedAt.slice(0, 10) ?? "2026-01-01")) : null;
  const reached = PIPELINE.indexOf(lead.status);

  return (
    <>
      <Link href="/leads" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
        ← All leads
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Avatar name={lead.capture?.clientName ?? lead.name ?? ""} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{name}</h1>
            <p className="mt-1 text-sm text-muted">
              {[lead.capture?.city, lead.phone ? formatPhone(lead.phone) : null, lead.email, lead.ownerId ? `owner ${nameOf(lead.ownerId)}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {lead.capture?.leadQuality && lead.capture.leadQuality !== "cold" && <QualityPill quality={lead.capture.leadQuality} />}
          {lead.status === "won" ? <StatusLabel band="green">Won</StatusLabel> : lead.status === "lost" ? <StatusLabel band="red">Lost</StatusLabel> : null}
        </div>
      </div>

      {/* The pipeline: steps reached are solid, the current one is named, Lost is off the line. */}
      <Card className="mb-6">
        <ol className="grid grid-cols-4 gap-2" aria-label="Where this lead is">
          {PIPELINE.map((step, i) => {
            const done = lead.status !== "lost" && i <= reached;
            const current = lead.status !== "lost" && i === reached;
            return (
              <li key={step} className="min-w-0" aria-current={current ? "step" : undefined}>
                <span className={`block h-1.5 rounded-full ${done ? (step === "won" ? "bg-good" : "bg-foreground") : "bg-border"}`} />
                <span className={`mt-2 block truncate text-xs ${current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted"}`}>
                  {STEP_LABEL[step]}
                </span>
              </li>
            );
          })}
        </ol>
        {lead.status === "lost" && <p className="mt-3 text-xs text-muted">Marked lost{lead.statusUpdatedAt ? ` on ${formatDay(lead.statusUpdatedAt)}` : ""}.</p>}
        {lead.status !== "lost" && lead.statusUpdatedAt && (
          <p className="mt-3 text-xs text-muted">
            Moved to “{LEAD_STATUS_LABEL[lead.status]}” on {formatDay(lead.statusUpdatedAt)}, {formatClock(lead.statusUpdatedAt)}
          </p>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Latest scored call"
          value={latestScored?.final ? <ScoreFigure score={latestScored.final.score} band={latestScored.final.band} /> : <span className="text-muted">–</span>}
        />
        <StatTile label="Calls" value={lead.calls.length} note={`${connected} connected`} />
        <StatTile
          label="Meeting"
          value={
            meeting ? (
              <span className="inline-flex items-center gap-2">
                <CalendarIcon />
                {meetingDate ? formatShortDay(meetingDate) : "Fixed"}
              </span>
            ) : (
              <span className="text-muted">–</span>
            )
          }
          note={meeting ?? "not fixed yet"}
        />
        <StatTile label="Deal value" value={lead.valueInr !== null ? inr(lead.valueInr) : <span className="text-muted">–</span>} note={lead.stage ? `Stage ${lead.stage}` : "stage not set"} />
      </div>

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
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{LEAD_STATUS_LABEL[lead.status]}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Stage</dt>
                <dd>{lead.stage ? `Stage ${lead.stage}` : "Not set"}</dd>
              </div>
              {lead.notes && <p className="rounded-lg border border-border bg-background px-3 py-2">{lead.notes}</p>}
            </dl>
          )}
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

      <Card className="mt-6">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Calls</h2>
          <span className="rounded-full border border-border px-2 py-px text-xs tabular-nums text-muted">{lead.calls.length}</span>
        </div>
        <ul className="-mx-4 divide-y divide-border border-t border-border sm:-mx-5">
          {lead.calls.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-background/60 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={nameOf(c.personId)} />
                <div className="min-w-0 text-sm">
                  <Link href={`/calls/${c.id}`} className="font-medium hover:underline">
                    {formatDay(c.startedAt)}, {formatClock(c.startedAt)}
                  </Link>
                  <div className="text-xs text-muted">
                    {[
                      nameOf(c.personId),
                      c.direction === "missed" || c.direction === "rejected" ? (c.direction === "missed" ? "missed" : "rejected") : c.direction,
                      c.durationSec > 0 ? formatDuration(c.durationSec) : "not connected",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>
              {c.final ? (
                <ScoreFigure score={c.final.score} band={c.final.band} size="md" />
              ) : (
                <span className="text-xs text-muted">
                  {c.durationSec === 0
                    ? "–"
                    : c.notScored === "under_2_min"
                      ? "Under 2 min, not scored"
                      : c.notScored
                        ? NOT_SCORED_LABEL[c.notScored]
                        : c.inProgress
                          ? IN_PROGRESS_LABEL[c.inProgress]
                          : "Not scored"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
