# Scoring a vision call

How to score one DNY vision call (LC-01) from its tl;dv transcript. Follows "Sales Call QA Agent – Brief
for the Tech Team" (12 Oct 2026), sections 2, 4 and 5 and the guardrails in section 7, with the stage
rules from the Service Master (tabs 1 to 5). The scorecard, call sheet, hard fails and result format
live in code; this guide is how to judge them consistently.

A vision call is relationship first, numbers second and services last: the consultant learns the
client's story, gets the specific answers, shares value, and leaves with two dates.

## Steps

By hand: `npm run score -- next|save|skip` (scripts/score.mts). The nightly routine does the same
through the scoring API (`/api/scoring/next`, `save?callId=…&dryRun=1`, `save?callId=…`, `skip?callId=…`).

1. Get the next call. `call.stream` is `vision_call`; `call.lead.firstCallNotes` holds what the first
   call already captured (null when there was no first call on record).
2. Write the result as JSON in the shape below (`VisionCallResultSchema` in `src/lib/scoring/schema.ts`).
3. Dry-run it. The check covers the schema, every expected question, speaker labels, topic tags and
   that every quote is in the transcript. It returns the score, the client talk share and, under
   `vision`, the consultant's talk share (first half and overall), service talk as a share of the
   consultant's talk, and minutes of DNY credentials. Fix and repeat until it passes.
4. Make any percentage or minutes you mention in a reason match the dry run.
5. Save it.

## Not a vision call

Meetings with only DNY people never reach you. If the meeting still isn't a vision call with a
prospect (an existing client's project review, a partner or vendor meeting, a job interview, a
demo), don't score it: skip it and say what it was in your report.

## Speakers

- tl;dv labels each line with the participant's name. The DNY consultant (and a founder or head, if
  one joined) go under `speakerRoles.agent`; the client and anyone on their side (partner, family,
  their architect) under `speakerRoles.client`. Both take one label or a list.
- `call.person` is the consultant the call belongs to; `call.lead` is the client.
- Leave out a label that isn't a person (a notetaker bot) or that you can't place; it isn't counted.
- Names in the transcript can be misheard. You may interpret them in reasons and capture fields, but
  quotes are always copied exactly from the transcript.

## Stage 1 or Stage 2 (Service Master, tab 1)

Decide the stage before judging the fee hard fail, the round two and the package. Put it in
`capture.stageRecommendation` with the reason.

- Chain or legacy / viral brand (5 to 50 outlets), international project, investor: Stage 2.
- Running business: Stage 2 with sales over ₹75 L a month, or legacy / viral status; otherwise Stage 1.
- New business (startup): count what is true; 5 or more is Stage 2:
  investment above ₹50 L · decision maker is an MNC professional or large business owner · asks
  about impact, numbers or ROI before the fee · names an aspiration brand or a clear vision for scale ·
  has worked with consultants or agencies and values them · property with rent above ₹2 to 2.5 L a
  month, or wants help finding one · committed timeline (0 to 6 months) with capital in place ·
  large or multi-outlet setup (above 3,000 sq ft, more than one outlet, hotel F&B).
- When too little was said to tell, say so in the reason and don't flag the Stage 2 fee hard fail.

## The six areas (0, 5 or 10)

Score 5 whenever you're unsure, and say why (brief section 7).

| Area | 10 | 5 | 0 |
|---|---|---|---|
| **relationship_first** (20) | The first 5 to 10 minutes are about the client: their story, why hospitality, their aspiration; follow-ups build on what the client just said; DNY's credentials take under 2 minutes (code checks this from the topics) | The client's story comes, but after a long DNY introduction, or the questions run one after another with few follow-ups | Opens with a DNY presentation, runs the sheet as an interrogation, no follow-ups on the client's answers |
| **interest_specificity** (20) | Every mandatory question covered naturally, and the numbers obtained: the client's monthly sales number, the capex budget and, for a running business, last month's P&L and food cost; target customer and top challenges confirmed | Most mandatory questions covered, but a number is missing or a vague answer is accepted without a "roughly how much?" | Under half covered while the client was available, the number questions skipped, or the RB question asked to a startup |
| **value_over_pitch** (25) | At least two pieces of value tied to the client's concept: a DNY case study of a similar format, a benchmark (food cost, APC, payback), a market observation; services come up only as the answer to a challenge the client raised; within the talk limits below | One piece of value, or services drift past the client's challenges for a stretch, or generic claims sit beside the real value | Lists services head by head, discusses the fee before the vision, number and P&L on a Stage 2 deal, pitches partner companies, talks discounts, or only generic claims with no example |
| **listening_presence** (10) | No interrupting, summarises back what the client said, prepared: nothing in the first-call notes is asked again as if new (confirming it is fine), questions asked in conversation, not read off the sheet | One or two interruptions, one basic re-asked, or nothing summarised back | Interrupts repeatedly, signs of multitasking ("sorry, what was that?"), several first-call basics re-asked, or the sheet read word for word |
| **closing** (20) | Commits the proposal day, fixes the review call, suggests a round two with a founder on a hot or Stage 2 deal, summarises next steps and what the client will send (P&L, menu, plans) | One of the two dates fixed, or both but no summary of next steps; or no round two suggested on a Stage 2 or hot deal | Ends without a date, "I will send something across", no next step for the client |
| **compliance** (5) | Standard scope language, no promised outcomes beyond the agreed milestones, no comments on competitors or other clients | One brief slip | Promises results ("you will do ₹50 L a month"), invents scope, bad-mouths anyone, or shares another client's confidential figures (their sales, P&L or fee). A DNY case study's outcome is value, not a slip |

**Talk limits (measured by code).** Value over pitch scores 10 only when the consultant talks at most
45% in the first half and 55% overall, and service talk is at most 20% of the consultant's time;
relationship first scores 10 only with DNY's credentials under 2 minutes. The dry run applies these
and says so in its summary.

**Stage 2 closing.** At Stage 2 there is no proposal before the vision, the number and (running
business) the P&L are understood. If something is still missing, fixing a round two with a founder,
with a date, counts as the commitment in place of a proposal day.

**Camera and punctuality** aren't in a transcript. Don't guess; use them only when said ("sorry I'm
late", "my camera isn't working").

## Coverage

- List every mandatory question (`priority: "must"`; lc07 only when `isRunningBusiness`), plus lc13
  (good to have). Mark lc07 `not_applicable` for a startup.
- Covered = the meaning was asked and answered, in any order and any language; partly = part of what
  the sheet captures is missing (e.g. a sales number but no "worry" number for lc05, a P&L without food
  cost for lc07). An answer the client volunteers counts. Covered or partly needs a quote; missed or
  not_applicable has `[]`.
- First-call answers don't count as covered on this call, but confirming them briefly does.

## Topics

Tag the call as stretches in order (`from`/`to` as `m:ss` from the transcript, no overlaps). Switch
topic when the conversation switches for about 30 seconds or more; cover the whole call.

- `client_story`: the client's background, vision, plans, numbers, challenges, team, and the
  consultant's questions and follow-ups about them.
- `value`: a case study, benchmark or market observation tied to the client's own concept.
- `dny_credentials`: DNY presenting itself (who we are, years, brands done, team, awards), not tied to
  the client's concept.
- `services`: DNY's services, scope or deliverables described.
- `fees`: DNY's fee, packages, payment terms or discounts.
- `other`: small talk, scheduling, logistics, technical trouble.

## Hard fails (the call is Red whatever the score)

- `fee_before_vision_stage2`: a Stage 2 deal, and DNY's fee, a package price or a discount was
  discussed before the client's vision, number (monthly sales or capex) and, for a running business,
  the P&L were heard on the call. "The proposal will cover it once we understand X" is not a fee.
- `partner_pitched`: a partner company's service offered or sold before the DNY deal closes:
  naming Gritfox, Bravas Digital, Restro Easy, PlateSpace or the staffing agency, or describing their
  packages or prices, even when the client asks. "Supply chain is licensed with TRS" as part of DNY's
  scope is allowed. Noting a need the client raised ("we will take that up after the consulting
  scope") is not pitching; capture it in `partnerNeeds`.
- `proposal_without_date`: a proposal promised with no day ("soon", "in a few days", "next week").
  A named or worked-out day counts ("by Thursday", "day after tomorrow"). If no proposal was promised
  at all, it isn't this hard fail; judge it under closing.
- `client_talk_under_35` is measured by code; don't list it.

## Capture and feedback

- **Capture fields:** only what was said, otherwise `null`. Keep them short: they're shown on the call
  and lead pages.
  - **`answers`:** every question on the sheet (lc01 to lc13), each one short line with the client's
    answer (numbers as said, e.g. "₹18 to 20 L a month"), or `null` when not answered.
  - **`stageRecommendation`:** `{ "stage": 1 or 2, "reason": "…" }` from the criteria above, e.g.
    "Running business, 2 outlets, about ₹40 L a month". `null` if too little was said.
  - **`packageSuggestion`:** the package that fits, code and name, never a price, e.g.
    "P03 · Specialty cafe / coffee house (new)". `null` when unclear.
    P01 Single-outlet QSR / kiosk (new) · P02 Cloud kitchen / delivery-first brand (new) · P03
    Specialty cafe / coffee house (new) · P04 Fast-casual / casual-dining restaurant (new) · P05 Bar &
    restaurant / food-led bar (new) · P06 Cocktail / destination bar (new) · P07 Rooftop /
    multi-engine destination (new) · P08 Multi-concept property / hotel F&B (per outlet) · P09
    Running business revamp, pilot outlet · P10 Running business roll-out (per additional outlet) ·
    P11 Chain corporate systems & standardisation · P12 Franchise development pack · P13
    International brand entry: deal structuring phase · P14 Investor opportunity advisory · R01
    Post-launch handholding retainer · R02 Corporate advisory retainer (chains) · R03 Restro Easy SOP
    & checklist handholding.
  - **`caseStudiesDiscussed`:** DNY case studies or brands mentioned as DNY's work, as named.
  - **`challengesToHeads`:** each challenge the client raised, mapped to one head:
    H01 Market research, gap analysis & business modelling · H02 Concept creation, positioning &
    experience design · H03 Menu engineering, culinary R&D & product development · H04 Beverage
    programmes: coffee & bar · H05 Production planning & kitchen inputs · H06 Business processes,
    SOPs & operating system · H07 Technology flow, POS & inventory · H08 Supply chain & procurement
    (licensed with TRS) · H09 Manpower planning & recruitment support · H10 Trainings, mock operations
    & launch · H11 Growth, franchise & scale · H12 Running business audit, revamp & turnaround · H13
    International brand entry & cross-border advisory · H14 Retainers & handholding.
  - **`proposalDate`** and **`reviewCallDate`:** `YYYY-MM-DD`, worked out from the call date; `null`
    when no day was committed.
  - **`founderRoundTwo`:** `true` when a round two with a founder was suggested or agreed, otherwise
    `false`; `null` only when the call ended before any closing.
  - **`partnerNeeds`:** only needs the client raised on their own: brand, website, marketing,
    property, procurement, handholding.
- **Feedback:**
  - 1–2 strengths and 1–2 fixes, each with an exact quote and its timestamp.
  - Each fix has a `betterLine` the consultant could actually say, in the call's language (English,
    or natural Hinglish in Roman script).
  - `tomorrow` is one line with **one** behaviour to change, the most important one. Never a list.

## Guardrails (brief section 7)

- Every finding quotes the words and the timestamp (`m:ss` as shown); no finding without evidence.
- Hindi, English and Hinglish are scored the same way; reasons are written in English.
- Score behaviour, not people: no remarks on personality, accent or the client's character, and no
  guessing at intent beyond what was said.
- Feedback is specific, respectful, and actionable the same day.
