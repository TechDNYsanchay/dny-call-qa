import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BandBadge, CalendarIcon, Card, Loading, StatusLabel, WhatsAppButton } from "@/components/ui";
import { getBriefing, requireMe } from "@/lib/data";
import { secondsFrom } from "@/lib/format";
import type { Band } from "@/lib/scoring/compute";
import { dayName, message, timeIn } from "@/lib/whatsapp";

export const metadata = { title: "Vision-call brief · DNY Sales Agent" };

export default function BriefPage({ params }: PageProps<"/leads/[id]/brief">) {
  return (
    <Suspense fallback={<Loading what="brief" />}>
      <Brief params={params} />
    </Suspense>
  );
}

async function Brief({ params }: Pick<PageProps<"/leads/[id]/brief">, "params">) {
  const { id } = await params;
  const me = await requireMe();
  const b = await getBriefing(id, me);
  if (!b) notFound();
  const time = timeIn(b.meeting.when);
  const meeting = b.meeting.date ? `${dayName(b.meeting.date)}${time ? `, ${time}` : ""}` : b.meeting.when;

  return (
    <>
      <Link href={`/leads/${b.leadId}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground print:hidden">
        ← The lead
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wider text-brand">Vision-call brief</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-balance sm:text-2xl">{b.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <CalendarIcon />
            {meeting ? `Meeting: ${meeting}` : "No meeting fixed yet"}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {b.meeting.date && <WhatsAppButton phone={b.phone} text={message.meeting(b.name, b.meeting.date, b.meeting.when)} label="Confirm on WhatsApp" />}
        </div>
      </div>

      <Card title="How to run the call" className="mb-6">
        <ol className="space-y-2 text-sm">
          {b.reminders.map((r, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-2xs font-semibold tabular-nums text-background">
                {i + 1}
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="What the first call told us">
          {b.known.length ? (
            <dl className="space-y-2 text-sm">
              {b.known.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
                  <dt className="text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">No first call has been scored for this lead yet.</p>
          )}
          {b.unknown.length > 0 && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
              <span className="font-medium text-foreground">Not captured yet:</span> {b.unknown.join(", ")}. Ask these on the call.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Stage and package">
            <p className="text-sm">
              <span className="mr-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium">{b.stage.label}</span>
              <span className="text-muted"> · {b.stage.why}</span>
            </p>
            {b.stage.signals.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {b.stage.signals.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="text-good-ink" aria-hidden="true">
                      ✓
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
            {b.stage.listenFor.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                <span className="font-medium text-foreground">Listen for:</span> {b.stage.listenFor.join("; ")}.
              </p>
            )}
            <p className="mt-3 border-t border-border pt-3 text-sm">
              <span className="text-muted">Likely package:</span> <span className="font-medium">{b.packageHint ?? "not clear from the first call"}</span>
            </p>
          </Card>

          <Card title="What the first call missed">
            {b.firstCallGaps.length ? (
              <ul className="space-y-2 text-sm">
                {b.firstCallGaps.map((g) => (
                  <li key={g.question} className="flex items-start justify-between gap-3">
                    <span>{g.question}</span>
                    <span className="shrink-0 text-xs">
                      {g.status === "missed" ? <StatusLabel band="red">Missed</StatusLabel> : <StatusLabel band="amber">Partly</StatusLabel>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{b.firstCall ? "Nothing: every question was covered." : "No scored first call to compare with."}</p>
            )}
          </Card>
        </div>
      </div>

      {(b.inTheirWords.length > 0 || b.firstCall) && (
        <Card title="In their words" className="mt-6">
          {b.inTheirWords.length > 0 && (
            <ul className="space-y-2">
              {b.inTheirWords.map((q) => (
                <li key={q.at + q.quote} className="text-sm">
                  {b.firstCall ? (
                    <Link href={`/calls/${b.firstCall.id}?t=${secondsFrom(q.at)}`} className="mr-1.5 font-mono text-xs text-muted tabular-nums hover:text-foreground hover:underline">
                      {q.at}
                    </Link>
                  ) : (
                    <span className="mr-1.5 font-mono text-xs text-muted tabular-nums">{q.at}</span>
                  )}
                  <span className="italic">“{q.quote}”</span>
                </li>
              ))}
            </ul>
          )}
          {b.firstCall && (
            <p className={`text-sm ${b.inTheirWords.length ? "mt-3 border-t border-border pt-3" : ""}`}>
              <Link href={`/calls/${b.firstCall.id}`} className="font-medium hover:underline">
                Listen to the first call
              </Link>{" "}
              <BandBadge score={b.firstCall.score} band={b.firstCall.band as Band} />
            </p>
          )}
        </Card>
      )}
    </>
  );
}
