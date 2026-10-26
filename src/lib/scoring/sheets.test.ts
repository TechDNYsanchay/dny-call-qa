import { describe, expect, it } from "vitest";
import { FIRST_CALL_QUESTIONS, VISION_CALL_QUESTIONS } from "./call-sheets";
import { expectedFrom, parseSheetText, SheetQuestionsSchema } from "./sheets";

// Text as unpdf extracts it from DNY's October 2026 PDFs (abridged).
const FC01 = `FIRST CALL SHEET · FIRST CALLS EXECUTIVE
must capture good to have RB running business only Your words, not a script.
01 Whom am I speaking with?
name · city · phone · email
02 What is your background, and what are you into currently?
job or business today · years in F&B, if any
03 Startup / RB / Investor? Startup RB (running business) Investor Chain International
04 What exactly do you have in mind: the format and the food?
QSR · cafe · restaurant · bar · cloud kitchen · multi-outlet · cuisine
05 Do you have the property finalised? If yes, how big is it?
city · area · sq ft · floor · rent per month
06 RB How many outlets do you run, and roughly what sales a month?
outlets · monthly sales band · years running
09 Who is your aspirational brand? Any benchmark for your concept?
the brand · what they like about it
YOUR CALL: FILL BEFORE YOU CLOSE THE LEAD
Stage 1 2 Lead quality Hot Warm Cold`;

const LC01 = `VISION CALL SHEET · LEAD CONSULTANT, SALES
VISION
01 If everything goes right, what is your vision for the first three years?
outlets · cities · monthly sales · RB: after streamlining, what should three years look like?
BUSINESS
07 RB Can you walk me through last month's P&L? What have you already tried to fix?
sales · food cost · payroll · rent · what is left · fixes that did not work
DECISION
12 We will share the proposal by [day]. When are you free to discuss it once you have reviewed?
proposal date · review call date · founder joins the review`;

describe("reading a call sheet PDF", () => {
  const fc = parseSheetText(FC01, "first_call", FIRST_CALL_QUESTIONS);

  it("finds each numbered question and what it captures", () => {
    expect(fc.map((q) => q.id)).toEqual(["fc01", "fc02", "fc03", "fc04", "fc05", "fc06", "fc09"]);
    expect(fc[0]).toMatchObject({ number: 1, question: "Whom am I speaking with?", captures: "name · city · phone · email" });
  });

  it("drops answer options printed after a question", () => {
    expect(fc.find((q) => q.id === "fc03")).toMatchObject({ question: "Startup / RB / Investor?", captures: "" });
  });

  it("keeps two-sentence questions whole", () => {
    expect(fc.find((q) => q.id === "fc05")?.question).toBe("Do you have the property finalised? If yes, how big is it?");
  });

  it("reads the RB marker and carries must / good-to-have over from the last version", () => {
    expect(fc.find((q) => q.id === "fc06")).toMatchObject({ runningBusinessOnly: true, question: "How many outlets do you run, and roughly what sales a month?" });
    expect(fc.find((q) => q.id === "fc09")?.priority).toBe("good_to_have");
    expect(parseSheetText("12 Is this a new question?", "first_call", FIRST_CALL_QUESTIONS)[0].priority).toBe("must");
  });

  it("keeps the vision sheet's sections", () => {
    const lc = parseSheetText(LC01, "vision_call", VISION_CALL_QUESTIONS);
    expect(lc.map((q) => [q.id, q.section, q.runningBusinessOnly])).toEqual([
      ["lc01", "vision", false],
      ["lc07", "business", true],
      ["lc12", "decision", false],
    ]);
  });

  it("produces questions that pass the stored-version check", () => {
    expect(SheetQuestionsSchema.safeParse(fc).success).toBe(true);
  });
});

describe("expected questions", () => {
  it("expects must-capture ones, RB-only ones only for running businesses", () => {
    expect(expectedFrom(FIRST_CALL_QUESTIONS, false).map((q) => q.id)).not.toContain("fc06");
    expect(expectedFrom(FIRST_CALL_QUESTIONS, true).map((q) => q.id)).toContain("fc06");
    expect(expectedFrom(FIRST_CALL_QUESTIONS, true).map((q) => q.id)).not.toContain("fc09");
  });
});
