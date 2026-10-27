// Turns a call's capture fields into label/value rows for the call page and the lead page.

import { VISION_CALL_QUESTIONS } from "@/lib/scoring/call-sheets";
import type { CallResult, FirstCallResult, VisionCallResult } from "@/lib/scoring/schema";

export type CaptureRow = [label: string, value: string];

const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${n.toLocaleString("en-IN")}`);
const words = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const CLIENT_TYPE: Record<string, string> = {
  startup: "Startup",
  running_business: "Running business",
  investor: "Investor",
  chain: "Chain",
  international: "International",
};
export const BUDGET: Record<string, string> = { under_50l: "Under ₹50 L", "50l_to_1cr": "₹50 L to ₹1 Cr", above_1cr: "Above ₹1 Cr" };
export const FORMAT: Record<string, string> = {
  qsr: "QSR",
  cafe: "Cafe",
  restaurant: "Restaurant",
  bar: "Bar",
  cloud_kitchen: "Cloud kitchen",
  multi_outlet: "Multi-outlet",
  other: "Other",
};
export const ROUTE: Record<string, string> = {
  sales_consultant: "Sales consultant",
  south_indian_cafe: "South Indian / cafe lead",
  bar: "Bar lead",
  chain_multi_outlet: "Chain / multi-outlet lead",
  founder_stage2: "Founder (Stage 2)",
};

export function firstCallRows(c: FirstCallResult["capture"]): CaptureRow[] {
  const property = c.property
    ? [
        c.property.finalised === null ? null : c.property.finalised ? "Finalised" : "Not finalised",
        c.property.area,
        c.property.sizeSqft ? `${c.property.sizeSqft.toLocaleString("en-IN")} sq ft` : null,
        c.property.floor ? `${c.property.floor} floor` : null,
        c.property.rentPerMonthInr ? `${inr(c.property.rentPerMonthInr)} rent a month` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const rows: [string, string | null][] = [
    ["Client", c.clientName],
    ["City", c.city],
    ["Email", c.email],
    ["Background", c.background],
    ["Client type", c.clientType && CLIENT_TYPE[c.clientType]],
    ["Concept", c.concept],
    ["Format", c.format && FORMAT[c.format]],
    ["Property", property],
    ["Outlets (RB)", c.rbOutlets === null ? null : String(c.rbOutlets)],
    ["Monthly sales (RB)", c.rbMonthlySales],
    ["Timeline", c.timeline],
    ["Partners", c.partners],
    ["Aspirational brand", c.aspirationalBrand],
    ["Project budget", c.budgetBand && BUDGET[c.budgetBand]],
    ["Lead quality", c.leadQuality && words(c.leadQuality)],
    ["Suggested route", c.suggestedRoute && ROUTE[c.suggestedRoute]],
    ["VC booked", c.vcDateTime],
    ["Call back", c.callBack ? c.callBack.when : null],
    ["Case studies mentioned", c.caseStudiesMentioned.join(", ") || null],
  ];
  return rows.map(([label, value]) => [label, value ?? "Not captured"]);
}

function visionCallRows(c: VisionCallResult["capture"]): CaptureRow[] {
  const answers: CaptureRow[] = VISION_CALL_QUESTIONS.map((q) => [
    `${q.number}. ${q.question}`,
    c.answers[q.id] ?? "Not answered",
  ]);
  const rows: [string, string | null][] = [
    ["Stage recommendation", c.stageRecommendation && `Stage ${c.stageRecommendation.stage}: ${c.stageRecommendation.reason}`],
    ["Package suggestion", c.packageSuggestion],
    ["Case studies discussed", c.caseStudiesDiscussed.join(", ") || null],
    ["Challenges mapped to heads", c.challengesToHeads.map((x) => `${x.challenge} → ${x.head}`).join("; ") || null],
    ["Proposal date", c.proposalDate],
    ["Review call date", c.reviewCallDate],
    ["Founder round two", c.founderRoundTwo === null ? null : c.founderRoundTwo ? "Yes" : "No"],
    ["Partner needs raised", c.partnerNeeds.map(words).join(", ") || null],
  ];
  return [...rows.map(([label, value]): CaptureRow => [label, value ?? "Not captured"]), ...answers];
}

export function captureRows(result: CallResult): CaptureRow[] {
  return result.stream === "first_call" ? firstCallRows(result.capture) : visionCallRows(result.capture);
}
