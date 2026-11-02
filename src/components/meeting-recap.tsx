// What a consultant takes away from a vision call: the next steps to tick off (with calendar
// entries and WhatsApp nudges), what is worth remembering, what is still open, and the recap
// to send the client. Server-rendered; only the ticks and the copy button run in the browser.

import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton, StepItem } from "@/components/step-item";
import { BandBadge, CalendarIcon, Quote, StatusLabel, WhatsAppButton } from "@/components/ui";
import { relativeDay } from "@/lib/follow-ups";
import { formatClock } from "@/lib/format";
import {
  actionState,
  agreedTime,
  byDue,
  calendarLink,
  clientNudgeMessage,
  clientRecapMessage,
  dueLabel,
  recapMailto,
  type MeetingAction,
  type MeetingRecap,
} from "@/lib/recap";
import { dayName } from "@/lib/whatsapp";

export interface Viewer {
  id: string;
  canSeeAll: boolean;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dny-call-qa.vercel.app";
const shortDay = (date: string) => dayName(date).replace(/^(\w{3})\w*/, "$1");
const BUTTON = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-background";

/** When it's due, as a word and a shape for overdue and today, never colour alone. */
function DueChip({ action, today }: { action: MeetingAction; today: string }) {
  const state = actionState(action, today);
  const time = agreedTime(action.dueText);
  if (state === "overdue") return <StatusLabel band="red">Overdue · {shortDay(action.due!)}</StatusLabel>;
  if (state === "today") return <StatusLabel band="amber">Today{time ? `, ${time}` : ""}</StatusLabel>;
  if (state === "upcoming") {
    const day = relativeDay(action.due!, today) ?? shortDay(action.due!);
    return (
      <span className="inline-flex items-center gap-1.5 font-medium">
        <CalendarIcon />
        {day}
        {time ? `, ${time}` : ""}
      </span>
    );
  }
  return <span className="text-muted">{action.dueText ? `“${action.dueText}”` : "No date set"}</span>;
}

function CalendarButton({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="Add to Google Calendar" className={BUTTON}>
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3M8 8.5v3M6.5 10h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <span className="sr-only sm:not-sr-only">Calendar</span>
    </a>
  );
}

/**
 * Next steps as a tick list. `context` adds the client and the meeting under each one, for lists
 * that mix meetings (Follow-ups); a single meeting's recap leaves it out.
 */
export function StepList({
  actions,
  today,
  viewer,
  context = false,
  personName,
}: {
  actions: MeetingAction[];
  today: string;
  viewer: Viewer;
  context?: boolean;
  personName?: (id: string) => string | null;
}) {
  return (
    <ul className="-mx-4 divide-y divide-border sm:-mx-5">
      {actions.map((a) => {
        const recapUrl = `${SITE}/calls/${a.callId}/recap`;
        const meetingDay = a.meetingAt.slice(0, 10);
        const nudge = a.owner === "client" && actionState(a, today) === "overdue";
        const who = personName?.(a.personId);
        const meta: ReactNode = (
          <>
            {context && (
              <span className="block truncate">
                {a.owner === "client" ? "Waiting on " : ""}
                {a.leadId ? (
                  <Link href={`/leads/${a.leadId}`} className="font-medium text-foreground hover:underline">
                    {a.client.name}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{a.client.name}</span>
                )}
                {" · "}
                <Link href={`/calls/${a.callId}/recap`} className="hover:text-foreground hover:underline">
                  vision call {relativeDay(meetingDay, today)?.toLowerCase() ?? shortDay(meetingDay)}
                </Link>
                {who ? ` · ${who}` : ""}
              </span>
            )}
            {a.quote && (
              <span className="mt-0.5 line-clamp-2">
                {a.quoteAt && <span className="mr-1.5 font-mono tabular-nums">{a.quoteAt}</span>}
                <q className="italic">{a.quote}</q>
              </span>
            )}
          </>
        );
        return (
          <StepItem
            key={a.id}
            id={a.id}
            done={Boolean(a.doneAt)}
            canTick={viewer.canSeeAll || a.personId === viewer.id}
            task={a.task}
            meta={meta}
            aside={
              <>
                <DueChip action={a} today={today} />
                {nudge && <WhatsAppButton phone={a.client.phone} text={clientNudgeMessage(a.client.name, a.task, meetingDay)} label="Nudge" />}
                <CalendarButton href={calendarLink(a, a.client.name, recapUrl)} />
              </>
            }
            doneAside={<span className="text-muted">Done{a.doneAt ? ` · ${relativeDay(a.doneAt.slice(0, 10), today) ?? shortDay(a.doneAt.slice(0, 10))}` : ""}</span>}
          />
        );
      })}
    </ul>
  );
}

function Heading({ children, count }: { children: ReactNode; count?: string }) {
  return (
    <h3 className="mb-1 flex items-baseline justify-between gap-2 text-2xs font-semibold uppercase tracking-wider text-muted">
      <span>{children}</span>
      {count && <span className="font-medium normal-case tracking-normal tabular-nums">{count}</span>}
    </h3>
  );
}

/** The whole recap of one meeting. `full` is the recap page; on the call page it links there. */
export function MeetingRecapCard({ recap, today, viewer, full = false }: { recap: MeetingRecap; today: string; viewer: Viewer; full?: boolean }) {
  const meetingDay = recap.meetingAt.slice(0, 10);
  const ours = recap.actions.filter((a) => a.owner === "dny");
  const theirs = recap.actions.filter((a) => a.owner === "client");
  const open = recap.actions.filter((a) => !a.doneAt);
  const overdue = open.filter((a) => actionState(a, today) === "overdue" && a.owner === "dny").length;
  const next = [...ours].filter((a) => !a.doneAt && a.due).sort(byDue)[0];
  const message = clientRecapMessage(recap.client.name, recap.actions, meetingDay, today);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-labelledby={`recap-${recap.callId}`}>
      <div className="border-b border-border px-4 pt-4 pb-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p id={`recap-${recap.callId}`} className="text-2xs font-semibold uppercase tracking-wider text-brand">
            Meeting recap
          </p>
          <p className="text-xs text-muted">
            {recap.actions.length === 0
              ? "No next steps were agreed"
              : open.length === 0
                ? "✓ Every next step done"
                : `${open.length} of ${recap.actions.length} next step${recap.actions.length === 1 ? "" : "s"} open${overdue ? ` · ${overdue} overdue` : ""}`}
          </p>
        </div>
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-pretty">{recap.summary}</p>
        {next && (
          <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-background px-3 py-1.5 text-sm">
            <span className="text-muted">Next up:</span>
            <span className="font-medium">{next.task}</span>
            <span className="text-muted">{dueLabel(next, true)}</span>
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="px-4 py-4 sm:px-5 lg:border-r lg:border-border">
          {recap.actions.length === 0 && <p className="text-sm text-muted">No next steps were agreed on the call. Worth a call or a WhatsApp to set one.</p>}
          {ours.length > 0 && (
            <div>
              <Heading count={`${ours.filter((a) => !a.doneAt).length} open`}>DNY to do</Heading>
              <StepList actions={ours} today={today} viewer={viewer} />
            </div>
          )}
          {theirs.length > 0 && (
            <div className={ours.length ? "mt-5" : ""}>
              <Heading count={`${theirs.filter((a) => !a.doneAt).length} open`}>Waiting on the client</Heading>
              <StepList actions={theirs} today={today} viewer={viewer} />
            </div>
          )}
        </div>
        <div className="space-y-5 border-t border-border px-4 py-4 sm:px-5 lg:border-t-0">
          <div>
            <Heading>Worth remembering</Heading>
            <ul className="mt-2 space-y-3">
              {recap.keyPoints.map((k, i) => (
                <li key={i} className="text-sm">
                  <p>{k.point}</p>
                  <div className="mt-0.5 text-muted">
                    <Quote evidence={k.evidence} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {recap.openQuestions.length > 0 && (
            <div>
              <Heading>Still open</Heading>
              <ul className="mt-2 space-y-1.5 text-sm">
                {recap.openQuestions.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-muted">
                      ?
                    </span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm">
            <span className="font-medium">Send {recap.client.name} the recap</span> <span className="text-muted">· the next steps, ready to edit</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppButton phone={recap.client.phone} text={message} label="WhatsApp" />
            <a href={recapMailto(recap.client.email, message)} className={BUTTON}>
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                <rect x="2" y="3.5" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="m2.5 4.5 5.5 4 5.5-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Email
            </a>
            <CopyButton text={message} />
          </div>
        </div>
        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 12 12" className="size-3 transition-transform group-open:rotate-90" aria-hidden="true">
              <path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="group-open:hidden">See the message</span>
            <span className="hidden group-open:inline">Hide the message</span>
          </summary>
          <p className="mt-2 whitespace-pre-line rounded-lg border border-border bg-surface px-3.5 py-3 text-sm">{message}</p>
        </details>
      </div>

      {!full && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted sm:px-5">
          <span>
            Vision call {shortDay(meetingDay)}, {formatClock(recap.meetingAt)}
            {recap.score && (
              <>
                {" · scored "}
                <BandBadge score={recap.score.score} band={recap.score.band} />
              </>
            )}
          </span>
          <Link href={`/calls/${recap.callId}/recap`} className="font-medium text-foreground hover:underline">
            Open the recap page <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </section>
  );
}
