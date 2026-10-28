// The exact result format, handed to the scorer with every call: a JSON Schema of what the save
// check accepts, and a complete valid result from another call. Without it the scorer had to work
// the fields out from the check's error messages.

import { z } from "zod";
import { CALLS } from "@/lib/data/sample-data";
import type { Stream } from "./call-sheets";
import { FirstCallSubmitSchema, VisionCallResultSchema, type CallResult } from "./schema";

const sampleResult = (stream: Stream): CallResult => {
  const result = CALLS.find((c) => c.result?.stream === stream)?.result;
  if (!result) throw new Error(`No sample ${stream} result`);
  // Sample results predate the follow-up fields; new results must have them.
  if (result.stream !== "first_call") return result;
  const vcDate = result.capture.vcDateTime?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  return { ...result, capture: { ...result.capture, vcDate, callBack: null } };
};

export function resultFormat(stream: Stream) {
  return {
    note: "Every field in the schema is required; use null where it allows null. The example is another call's result: copy its shape, never its content (quotes and facts come from this call's transcript).",
    schema: z.toJSONSchema(stream === "first_call" ? FirstCallSubmitSchema : VisionCallResultSchema),
    example: sampleResult(stream),
  };
}
