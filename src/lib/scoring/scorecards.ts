// Scorecards from "Sales Call QA Agent - Brief for the Tech Team" (12 Oct 2026), sections 3-5.
// Weights in each scorecard sum to 100. Each area is scored 0, 5 or 10 (missed, partial, met).

import type { Stream } from "./call-sheets";

export const RUBRIC_VERSION = "brief-2026-10-12";

export interface ScorecardArea {
  id: string;
  name: string;
  weight: number;
  /** What scores 10. */
  does: string;
  /** What scores 0. */
  doesNot: string;
}

export const FIRST_CALL_AREAS = [
  {
    id: "opening",
    name: "Opening and professionalism",
    weight: 10,
    does: "Introduces self and DNY, checks it is a good time, uses the client's name, warm and unhurried tone",
    doesNot: "Launches into questions, talks over the client, casual or distracted tone",
  },
  {
    id: "short_precise",
    name: "Short and precise",
    weight: 15,
    does: "6 to 10 minutes; covers the question areas by meaning; stays on the main questions",
    doesNot: "Over 15 minutes, monologues about DNY, reading the sheet word for word, drilling for data-entry details on the call",
  },
  {
    id: "focus_environment",
    name: "Focus and environment",
    weight: 15,
    does: "Quiet line, clear audio, no multitasking, no silence over 8 seconds, no colleague interruptions",
    doesNot: "Background noise or traffic, speakerphone in a noisy place, typing or side conversations while the client talks",
  },
  {
    id: "client_engagement",
    name: "Client engagement",
    weight: 15,
    does: "Client talks at least half the time, answers fully, asks something back; if the client is in a hurry the executive offers a callback slot",
    doesNot: "Client gives one-word answers, sounds rushed or disengaged and the executive pushes on regardless",
  },
  {
    id: "coverage",
    name: "Coverage of the mandatory questions",
    weight: 20,
    does: "Every must-capture question on the First Call Sheet covered by meaning; RB questions only for running businesses",
    doesNot: "Any mandatory area skipped while the client was available for it; RB question asked to a startup",
  },
  {
    id: "cta",
    name: "CTA",
    weight: 20,
    does: "Asks for the video meeting with the lead consultant, offers today or tomorrow, gets a slot or a specific callback time, confirms on WhatsApp",
    doesNot: "Ends without the ask, or with a vague \"I will call you back\"",
  },
  {
    id: "compliance",
    name: "Compliance",
    weight: 5,
    does: "No fee, no service list, no partner company, no promises on deliverables",
    doesNot: "Quotes a fee or a package, lists services, pitches Gritfox, Bravas or others, comments on competitors or past clients",
  },
] as const satisfies readonly ScorecardArea[];

export const VISION_CALL_AREAS = [
  {
    id: "relationship_first",
    name: "Relationship first",
    weight: 20,
    does: "First 5 to 10 minutes are about the client: their story, why hospitality, their aspiration; follow-ups build on what the client said; DNY's credentials take under 2 minutes",
    doesNot: "Opens with a DNY presentation, runs the questions as an interrogation, no follow-ups on the client's answers",
  },
  {
    id: "interest_specificity",
    name: "Interest and specificity",
    weight: 20,
    does: "Covers the mandatory questions naturally and gets numbers: monthly sales target, capex budget, RB P&L and food cost; confirms target customer and top challenges",
    doesNot: "Accepts vague answers without a \"roughly how much?\", skips the number questions, asks the RB question to a startup",
  },
  {
    id: "value_over_pitch",
    name: "Value over pitch",
    weight: 25,
    does: "Shares at least two pieces of value tied to the client's concept (case study, benchmark, market observation); services come up only as the answer to a challenge the client raised; consultant talk at most 45% in the first half and 55% overall; service talk at most 20% of the consultant's time",
    doesNot: "Lists services head by head, discusses fee before vision, number and P&L (Stage 2), pitches partner companies, talks discounts, generic claims with no example",
  },
  {
    id: "listening_presence",
    name: "Listening and presence",
    weight: 10,
    does: "No interrupting, summarises back what the client said, camera on, punctual, prepared with the first-call notes so nothing already captured is re-asked",
    doesNot: "Multitasking, re-asking basics from the first call, reading questions off the sheet, late or camera off",
  },
  {
    id: "closing",
    name: "Closing",
    weight: 20,
    does: "Commits the proposal date, fixes the review call date, suggests a round two with a founder on hot or Stage 2 deals, summarises next steps and what the client will send (P&L, menu, plans)",
    doesNot: "Ends without a date, \"I will send something across\", no next step for the client",
  },
  {
    id: "compliance",
    name: "Compliance",
    weight: 5,
    does: "Standard scope language, no promised outcomes beyond the agreed milestones, no comments on competitors or other clients",
    doesNot: "Promises results, invents scope, bad-mouths anyone",
  },
] as const satisfies readonly ScorecardArea[];

export type FirstCallAreaId = (typeof FIRST_CALL_AREAS)[number]["id"];
export type VisionCallAreaId = (typeof VISION_CALL_AREAS)[number]["id"];

export function areasFor(stream: Stream): readonly ScorecardArea[] {
  return stream === "first_call" ? FIRST_CALL_AREAS : VISION_CALL_AREAS;
}

export interface HardFail {
  id: string;
  label: string;
  /** Measured by code from the transcript timings, not judged by the model. */
  measured: boolean;
}

export const FIRST_CALL_HARD_FAILS = [
  { id: "fee_or_package_quoted", label: "A fee or package quoted", measured: false },
  { id: "no_cta_when_engaged", label: "No CTA although the client was reachable and engaged", measured: false },
  { id: "noise_made_client_repeat", label: "Background noise that made the client ask to repeat", measured: false },
  { id: "rude_or_dismissive", label: "Rude or dismissive conduct", measured: false },
] as const satisfies readonly HardFail[];

export const VISION_CALL_HARD_FAILS = [
  { id: "fee_before_vision_stage2", label: "Fee discussed before vision, number and P&L on a Stage 2 deal", measured: false },
  { id: "partner_pitched", label: "Partner companies pitched", measured: false },
  { id: "proposal_without_date", label: "Proposal promised without a date", measured: false },
  { id: "client_talk_under_35", label: "The client talked under 35% of the time", measured: true },
] as const satisfies readonly HardFail[];

export function hardFailsFor(stream: Stream): readonly HardFail[] {
  return stream === "first_call" ? FIRST_CALL_HARD_FAILS : VISION_CALL_HARD_FAILS;
}
