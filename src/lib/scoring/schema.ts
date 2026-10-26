// The JSON the scoring routine must return for each call. The scoring script validates every
// result against these schemas before saving it; a result that fails is marked for retry.
// Guardrail (brief section 7): every finding quotes the words used and the timestamp.

import { z } from "zod";

export const TimestampSchema = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, "Use mm:ss or h:mm:ss");

export const EvidenceSchema = z.object({
  quote: z.string().min(1),
  speaker: z.enum(["agent", "client"]),
  at: TimestampSchema,
});

export const LevelSchema = z.union([z.literal(0), z.literal(5), z.literal(10)]);

const AreaResultSchema = z.object({
  level: LevelSchema,
  reason: z.string().min(1),
  evidence: z.array(EvidenceSchema).min(1),
});

const CoverageItemSchema = z
  .object({
    question: z.string().regex(/^(fc|lc)\d{2}$/),
    status: z.enum(["covered", "partly", "missed", "not_applicable"]),
    evidence: z.array(EvidenceSchema),
  })
  .refine((c) => c.status === "missed" || c.status === "not_applicable" || c.evidence.length > 0, {
    message: "A covered or partly covered question needs a quote",
  });

const FeedbackSchema = z.object({
  strengths: z.array(z.object({ text: z.string().min(1), evidence: EvidenceSchema })).min(1).max(2),
  fixes: z
    .array(z.object({ text: z.string().min(1), evidence: EvidenceSchema, betterLine: z.string().min(1) }))
    .min(1)
    .max(2),
  /** A single coaching line for tomorrow, never a list. */
  tomorrow: z.string().min(1),
});

/** One transcript speaker label, or several when the speech-to-text service split one voice in two. */
const SpeakerLabelsSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const SpeakerRolesSchema = z.object({
  /** Transcript speaker label(s) of the DNY executive or consultant. */
  agent: SpeakerLabelsSchema,
  client: SpeakerLabelsSchema,
});

export function speakerLabels(labels: string | string[]): string[] {
  return typeof labels === "string" ? [labels] : labels;
}

const ConsentSchema = z.enum(["stated", "not_stated", "declined"]);

const hardFailItem = <T extends readonly [string, ...string[]]>(ids: T) =>
  z.object({ id: z.enum(ids), evidence: z.array(EvidenceSchema).min(1) });

// Model-judged hard fails only; measured ones (VC client talk under 35%) are added by code.
export const FIRST_CALL_JUDGED_HARD_FAILS = [
  "fee_or_package_quoted",
  "no_cta_when_engaged",
  "noise_made_client_repeat",
  "rude_or_dismissive",
] as const;
export const VISION_CALL_JUDGED_HARD_FAILS = ["fee_before_vision_stage2", "partner_pitched", "proposal_without_date"] as const;

export const FirstCallCaptureSchema = z.object({
  clientName: z.string().nullable(),
  city: z.string().nullable(),
  email: z.string().nullable(),
  background: z.string().nullable(),
  clientType: z.enum(["startup", "running_business", "investor", "chain", "international"]).nullable(),
  concept: z.string().nullable(),
  format: z.enum(["qsr", "cafe", "restaurant", "bar", "cloud_kitchen", "multi_outlet", "other"]).nullable(),
  property: z
    .object({
      finalised: z.boolean().nullable(),
      area: z.string().nullable(),
      sizeSqft: z.number().nullable(),
      floor: z.string().nullable(),
      rentPerMonthInr: z.number().nullable(),
    })
    .nullable(),
  rbOutlets: z.number().int().nullable(),
  rbMonthlySales: z.string().nullable(),
  timeline: z.string().nullable(),
  partners: z.string().nullable(),
  aspirationalBrand: z.string().nullable(),
  budgetBand: z.enum(["under_50l", "50l_to_1cr", "above_1cr"]).nullable(),
  leadQuality: z.enum(["hot", "warm", "cold"]).nullable(),
  suggestedRoute: z
    .enum(["sales_consultant", "south_indian_cafe", "bar", "chain_multi_outlet", "founder_stage2"])
    .nullable(),
  vcDateTime: z.string().nullable(),
  caseStudiesMentioned: z.array(z.string()),
});

export const VisionCallCaptureSchema = z.object({
  /** Question id (lc01-lc13) to a one-line answer, null when not answered. */
  answers: z.record(z.string().regex(/^lc\d{2}$/), z.string().nullable()),
  stageRecommendation: z.object({ stage: z.union([z.literal(1), z.literal(2)]), reason: z.string().min(1) }).nullable(),
  packageSuggestion: z.string().nullable(),
  caseStudiesDiscussed: z.array(z.string()),
  /** Each challenge mapped to a Service Master head (H01-H14). */
  challengesToHeads: z.array(z.object({ challenge: z.string(), head: z.string().regex(/^H\d{2}$/) })),
  proposalDate: z.string().nullable(),
  reviewCallDate: z.string().nullable(),
  founderRoundTwo: z.boolean().nullable(),
  partnerNeeds: z.array(z.enum(["brand", "website", "marketing", "property", "procurement", "handholding"])),
});

export const FirstCallResultSchema = z.object({
  stream: z.literal("first_call"),
  speakerRoles: SpeakerRolesSchema,
  consent: ConsentSchema,
  isRunningBusiness: z.boolean(),
  areas: z.object({
    opening: AreaResultSchema,
    short_precise: AreaResultSchema,
    focus_environment: AreaResultSchema,
    client_engagement: AreaResultSchema,
    coverage: AreaResultSchema,
    cta: AreaResultSchema,
    compliance: AreaResultSchema,
  }),
  coverage: z.array(CoverageItemSchema),
  hardFails: z.array(hardFailItem(FIRST_CALL_JUDGED_HARD_FAILS)),
  capture: FirstCallCaptureSchema,
  feedback: FeedbackSchema,
});

export const VisionCallResultSchema = z.object({
  stream: z.literal("vision_call"),
  speakerRoles: SpeakerRolesSchema,
  isRunningBusiness: z.boolean(),
  areas: z.object({
    relationship_first: AreaResultSchema,
    interest_specificity: AreaResultSchema,
    value_over_pitch: AreaResultSchema,
    listening_presence: AreaResultSchema,
    closing: AreaResultSchema,
    compliance: AreaResultSchema,
  }),
  coverage: z.array(CoverageItemSchema),
  /** Topic tags for stretches of the call; code adds up minutes per topic. */
  topics: z.array(
    z.object({
      from: TimestampSchema,
      to: TimestampSchema,
      topic: z.enum(["client_story", "dny_credentials", "services", "fees", "other"]),
    }),
  ),
  hardFails: z.array(hardFailItem(VISION_CALL_JUDGED_HARD_FAILS)),
  capture: VisionCallCaptureSchema,
  feedback: FeedbackSchema,
});

export const CallResultSchema = z.discriminatedUnion("stream", [FirstCallResultSchema, VisionCallResultSchema]);

export type Evidence = z.infer<typeof EvidenceSchema>;
export type FirstCallCapture = z.infer<typeof FirstCallCaptureSchema>;
export type FirstCallResult = z.infer<typeof FirstCallResultSchema>;
export type VisionCallResult = z.infer<typeof VisionCallResultSchema>;
export type CallResult = z.infer<typeof CallResultSchema>;
