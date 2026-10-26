# Scoring a first call

How to score one DNY first call (FC-01) from its transcript. Follows "Sales Call QA Agent – Brief for
the Tech Team" (12 Oct 2026), sections 3–5 and the guardrails in section 7. The scorecard, call sheet,
hard fails and result format live in code; this guide is how to judge them consistently.

## Steps

1. `npm run score -- next --call <callId> > <package.json>` gives the call, the measured facts
   (talk seconds per speaker label, silences), the rubric and the transcript as `[m:ss] label: text`.
2. Write the result as JSON matching `FirstCallResultSchema` in `src/lib/scoring/schema.ts`.
3. `npm run score -- save <callId> <result.json> --dry-run` checks it: the schema, every expected
   question, speaker labels, and that every quote is in the transcript. It prints the score and the
   measured client talk share. Fix and re-run until it passes.
4. Make any percentage you mention in a reason match the dry run's "client talked N%".
5. Only save for real (`save` without `--dry-run`) when asked to.

## Not a sales call

If the call isn't a sales conversation with a prospect (a vendor, a telecom or bank representative, a
job applicant, a personal call, a wrong number, an existing client's service issue), don't score it:
run `npm run score -- skip <callId>` and say what the call was in your report.

## Speakers

- Decide which label is DNY and which is the client from what they say (who represents DNY, who
  describes their own plans). `speakerRoles.agent` / `.client` take one label or a list.
- Speech-to-text sometimes splits one voice into an extra label. If every line of the extra label
  belongs to one person, add it to that person's list. If it mixes both people, leave it out; it stays
  "unknown" and isn't counted.
- Transcripts mishear names ("paid Puja" = Petpooja, "Hungary" = Andheri). You may interpret them in
  reasons and capture fields, but quotes are always copied exactly from the transcript.

## The seven areas (0, 5 or 10)

Score 5 whenever you're unsure, and say why (brief section 7).

| Area | 10 | 5 | 0 |
|---|---|---|---|
| **opening** (10) | Introduces self and DNY, checks it's a good time (outgoing), uses the client's name, warm | Some of these, e.g. names DNY but not herself, or names come only late in the call | Launches into questions or a pitch with none of these, or a casual or distracted tone |
| **short_precise** (15) | 6–10 minutes and the time goes on the sheet's questions | Length fine (or short), but a lot of time goes on DNY's services, stories or fees instead of the sheet | Over 15 minutes (code enforces this), or the call is mostly DNY's own pitch |
| **focus_environment** (15) | No silence over 8 s, no repeats, no interruptions | One silence over 8 s, or one moment of noise or distraction | Several long silences, or noise or multitasking throughout. Background noise isn't measured yet; say so |
| **client_engagement** (15) | Client talks at least 50% and answers fully or asks back | Engaged but under 50%, or 50%+ with short answers | One-word answers, rushed or disengaged, and the executive pushes on |
| **coverage** (20) | Every mandatory question covered | About half or more covered | Under half covered while the client was available |
| **cta** (20) | Asks for the meeting, gets a specific day and time (video, or in person if the client prefers), and WhatsApp confirmation is mentioned | Asks, even with a specific time, but nothing is confirmed ("tomorrow or Friday", "I'll revert") | No ask, or only a vague "I'll call you back" |
| **compliance** (5) | No fee, no service list, no partner company, no promises, no comments on competitors or other clients | One brief slip, e.g. a one-line answer to "what do you do?" | Fee quoted, a list of services, partner agencies pitched (staffing, branding, Gritfox, Bravas), promises (e.g. "we'll get you investors"), or another client's numbers |

**Coverage points.** Count the mandatory questions (`priority: "must"`; RB questions only when
`isRunningBusiness`). Covered = 1, partly = 0.5. At least 90% → 10; 50–89% → 5; under 50% → 0.
Questions are matched by meaning. An answer the client volunteers counts. "Partly" means part of what
the sheet captures is missing, e.g. name but no email, or size but not whether it's finalised.

## Hard fails (the call is Red whatever the score)

- `fee_or_package_quoted`: any DNY fee amount or package price, even when the client asks for it.
  Estimates of the client's own setup cost are not a DNY fee.
- `no_cta_when_engaged`: the client was reachable and engaged, and there was no meeting ask at all.
- `noise_made_client_repeat`: the client had to ask for a repeat because of noise on DNY's side.
- `rude_or_dismissive`: rude or dismissive conduct.

## Coverage list, capture and feedback

- **Coverage list:**
  - List every mandatory question, plus fc09 (good to have).
  - Mark fc06 `not_applicable` for a startup.
  - Covered or partly needs a quote; missed or not_applicable has `[]`.
- **Capture fields:** only what was said, otherwise `null`.
  - **Names:** write names as transcribed, adding "(as transcribed)" if you're unsure.
  - **`city`:** where the project is.
  - **`budgetBand`:** the client's project budget, never DNY's fee.
  - **`leadQuality`:**
    - hot: a concrete plan and a meeting fixed
    - warm: interested, but the meeting or fit is still open
    - cold: not interested, or unrealistic
  - **`vcDateTime`:** plain text with the actual date (work it out from the call date), and say if the meeting is in person.
- **Feedback:**
  - 1–2 strengths and 1–2 fixes, each with an exact quote and its timestamp.
  - Each fix has a `betterLine` the executive could actually say, in natural Hinglish in Roman script.
  - `tomorrow` is one line.

## Guardrails (brief section 7)

- Every finding quotes the words and the timestamp (`m:ss` as shown); no finding without evidence.
- Hindi, English and Hinglish are scored the same way; reasons are written in English.
- Score behaviour, not people: no remarks on personality, accent or the client's character, and no
  guessing at intent beyond what was said.
- Feedback is specific, respectful, and actionable the same day.
