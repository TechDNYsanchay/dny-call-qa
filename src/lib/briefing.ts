// The consultant's brief for a vision call, built from what the first call captured: what we know
// and don't, a Stage 1 / 2 lean from the Service Master signals the first call can show, the
// likely package, the questions the first call missed, the client's own words, and the vision-call
// scorecard as a few reminders. Nothing here is a price.

import { firstCallRows, type CaptureRow } from "@/lib/capture";
import type { CallRecord } from "@/lib/data/types";
import { questionsFor } from "@/lib/scoring/call-sheets";
import type { FirstCallCapture } from "@/lib/scoring/schema";

export interface BriefingInput {
  leadId: string;
  name: string | null;
  phone: string | null;
  /** The person the founders set as the lead's owner, if any. */
  ownerId: string | null;
  capture: FirstCallCapture | null;
  /** The lead's latest scored first call, if any. */
  firstCall: CallRecord | null;
}

export interface StageLean {
  /** "Stage 2" when the rules say so outright; otherwise a lean to confirm on the call. */
  label: "Stage 1" | "Stage 2" | "Leaning Stage 2" | "Not clear yet";
  why: string;
  /** Stage 2 signals the first call already showed. */
  signals: string[];
  /** Signals the first call can't show: listen for them on the vision call. */
  listenFor: string[];
}

export interface Briefing {
  leadId: string;
  name: string;
  phone: string | null;
  ownerId: string | null;
  meeting: { date: string | null; when: string | null };
  known: CaptureRow[];
  unknown: string[];
  stage: StageLean;
  /** Service Master package code and name, e.g. "P03 · Specialty cafe / coffee house (new)". */
  packageHint: string | null;
  /** First Call Sheet questions the first call missed or only partly covered. */
  firstCallGaps: { question: string; status: "missed" | "partly" }[];
  inTheirWords: { quote: string; at: string }[];
  firstCall: { id: string; score: number; band: string } | null;
  reminders: string[];
}

const PACKAGES: Record<string, string> = {
  P01: "Single-outlet QSR / kiosk (new)",
  P02: "Cloud kitchen / delivery-first brand (new)",
  P03: "Specialty cafe / coffee house (new)",
  P04: "Fast-casual / casual-dining restaurant (new)",
  P05: "Bar & restaurant / food-led bar (new)",
  P08: "Multi-concept property / hotel F&B (per outlet)",
  P09: "Running business revamp, pilot outlet",
  P11: "Chain corporate systems & standardisation",
  P13: "International brand entry: deal structuring phase",
  P14: "Investor opportunity advisory",
};

const BY_FORMAT: Record<string, string> = { qsr: "P01", cloud_kitchen: "P02", cafe: "P03", restaurant: "P04", bar: "P05", multi_outlet: "P08" };
const BY_TYPE: Record<string, string> = { investor: "P14", international: "P13", chain: "P11", running_business: "P09" };

export function packageHint(c: FirstCallCapture | null): string | null {
  const code = (c?.clientType && BY_TYPE[c.clientType]) ?? (c?.format ? BY_FORMAT[c.format] : undefined);
  return code ? `${code} · ${PACKAGES[code]}` : null;
}

/** "about 40 lakh a month" -> 40; "1.2 Cr" -> 120; lakhs, or null when there's no amount. */
export function lakhsIn(text: string | null | undefined): number | null {
  const m = text?.match(/(\d+(?:\.\d+)?)\s*(cr|crore|l|lakh|lac|lakhs)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^c/i.test(m[2]) ? n * 100 : n;
}

const LISTEN_FOR = [
  "who decides: an MNC professional or a large business owner",
  "whether they ask about impact, numbers or payback before the fee",
  "whether they've worked with consultants before and valued it",
  "a committed timeline (0 to 6 months) with the capital in place",
];

/** Service Master, tab 1: client types, the running-business sales line and the startup signals. */
export function stageLean(c: FirstCallCapture | null): StageLean {
  if (!c) return { label: "Not clear yet", why: "Nothing was captured on a first call.", signals: [], listenFor: LISTEN_FOR };
  if (c.clientType === "chain" || c.clientType === "international" || c.clientType === "investor") {
    const who = { chain: "A chain or legacy brand", international: "An international project", investor: "An investor" }[c.clientType];
    return { label: "Stage 2", why: `${who} is always handled as Stage 2: a founder joins the vision call.`, signals: [], listenFor: [] };
  }
  if (c.clientType === "running_business") {
    const sales = lakhsIn(c.rbMonthlySales);
    if (sales === null) return { label: "Not clear yet", why: "A running business: Stage 2 above ₹75 L of sales a month. Ask last month's sales.", signals: [], listenFor: [] };
    return sales > 75
      ? { label: "Stage 2", why: `A running business doing about ₹${sales} L a month (above ₹75 L).`, signals: [], listenFor: [] }
      : { label: "Stage 1", why: `A running business doing about ₹${sales} L a month (₹75 L or less), unless it's a legacy or viral brand.`, signals: [], listenFor: [] };
  }
  const signals = [
    (c.budgetBand === "50l_to_1cr" || c.budgetBand === "above_1cr") && "project budget above ₹50 L",
    c.aspirationalBrand && `names an aspiration brand (${c.aspirationalBrand})`,
    (c.property?.rentPerMonthInr ?? 0) >= 200_000 && "rent of ₹2 L a month or more",
    (c.format === "multi_outlet" || (c.property?.sizeSqft ?? 0) > 3000) && "a large or multi-outlet setup",
  ].filter((s): s is string => Boolean(s));
  const label = signals.length >= 3 ? "Leaning Stage 2" : "Stage 1";
  return {
    label,
    why: `${signals.length} of the 8 Stage 2 signals so far; 5 or more makes it Stage 2. The first call can't show the other 4.`,
    signals,
    listenFor: LISTEN_FOR,
  };
}

function reminders(stage: StageLean): string[] {
  return [
    "Open with their story: why hospitality, why now, their three-year vision. Keep DNY's introduction under 2 minutes.",
    "Get the numbers: the monthly sales they expect (and the number that would worry them) and the capex budget; for a running business, last month's P&L and food cost.",
    "Share two pieces of value tied to their concept: a case study, a benchmark, a market observation. Bring up services only to answer a challenge they raise.",
    "Let them talk: under 45% of the talking in the first half. Confirm what the first call captured instead of asking it again.",
    stage.label === "Stage 1"
      ? "No partner companies before the DNY deal closes; partner needs they raise are noted for later."
      : "Stage 2: no fee or package before the vision, the number and the P&L are clear, and no partner companies.",
    `Leave with two dates: the proposal day and the review call${stage.label === "Stage 1" ? "" : ", with a founder joining the review"}.`,
  ];
}

export function buildBriefing(input: BriefingInput): Briefing {
  const c = input.capture;
  const rows = c ? firstCallRows(c).filter(([label]) => label !== "VC booked" && label !== "Call back" && label !== "Client") : [];
  const known = rows.filter(([, value]) => value !== "Not captured");
  const unknown = rows.filter(([, value]) => value === "Not captured").map(([label]) => label);
  const stage = stageLean(c);

  const result = input.firstCall?.result?.stream === "first_call" ? input.firstCall.result : null;
  const questions = questionsFor("first_call");
  const textOf = (id: string) => questions.find((q) => q.id === id)?.question ?? id;
  const firstCallGaps = (result?.coverage ?? [])
    .filter((item): item is typeof item & { status: "missed" | "partly" } => item.status === "missed" || item.status === "partly")
    .map((item) => ({ question: textOf(item.question), status: item.status }));
  // The client's own words, in the sheet's order: what they want, in how they said it.
  const inTheirWords = (result?.coverage ?? [])
    .flatMap((item) => item.evidence.filter((e) => e.speaker === "client"))
    .filter((e) => e.quote.split(/\s+/).length >= 5)
    .slice(0, 3)
    .map((e) => ({ quote: e.quote, at: e.at }));

  return {
    leadId: input.leadId,
    name: c?.clientName ?? input.name ?? "The client",
    phone: input.phone,
    ownerId: input.ownerId,
    meeting: { date: c?.vcDate ?? null, when: c?.vcDateTime ?? null },
    known,
    unknown,
    stage,
    packageHint: packageHint(c),
    firstCallGaps,
    inTheirWords,
    firstCall: input.firstCall?.final ? { id: input.firstCall.id, score: input.firstCall.final.score, band: input.firstCall.final.band } : null,
    reminders: reminders(stage),
  };
}
