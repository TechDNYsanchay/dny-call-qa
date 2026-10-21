// Questions from DNY's call sheets (FC-01 First Call Sheet, LC-01 Vision Call Sheet).
// Version 1 mirrors the PDFs as of October 2026. When DNY edits a PDF, a new
// reference version is uploaded on the admin page and this list is updated to match.

export type Stream = "first_call" | "vision_call";

export type Priority = "must" | "good_to_have";

export interface SheetQuestion {
  id: string;
  number: number;
  question: string;
  /** What the answer should capture, as printed under the question. */
  captures: string;
  priority: Priority;
  /** Asked only when the client runs a business already (RB tag on the sheet). */
  runningBusinessOnly: boolean;
  section?: "vision" | "business" | "money" | "decision";
}

export const FIRST_CALL_SHEET_VERSION = "FC-01 (Oct 2026)";
export const VISION_CALL_SHEET_VERSION = "LC-01 (Oct 2026)";

export const FIRST_CALL_QUESTIONS: SheetQuestion[] = [
  { id: "fc01", number: 1, question: "Whom am I speaking with?", captures: "name, city, phone, email", priority: "must", runningBusinessOnly: false },
  { id: "fc02", number: 2, question: "What is your background, and what are you into currently?", captures: "job or business today, years in F&B if any", priority: "must", runningBusinessOnly: false },
  { id: "fc03", number: 3, question: "Startup / RB / Investor?", captures: "startup, running business, investor, chain or international", priority: "must", runningBusinessOnly: false },
  { id: "fc04", number: 4, question: "What exactly do you have in mind: the format and the food?", captures: "QSR, cafe, restaurant, bar, cloud kitchen, multi-outlet; cuisine", priority: "must", runningBusinessOnly: false },
  { id: "fc05", number: 5, question: "Do you have the property finalised? If yes, how big is it?", captures: "city, area, sq ft, floor, rent per month", priority: "must", runningBusinessOnly: false },
  { id: "fc06", number: 6, question: "How many outlets do you run, and roughly what sales a month?", captures: "outlets, monthly sales band, years running", priority: "must", runningBusinessOnly: true },
  { id: "fc07", number: 7, question: "When do you plan to start this?", captures: "launch or decision date, what is driving it", priority: "must", runningBusinessOnly: false },
  { id: "fc08", number: 8, question: "Are you doing this solo, or do you have partners?", captures: "partners, family, investor, who takes the final call", priority: "must", runningBusinessOnly: false },
  { id: "fc09", number: 9, question: "Who is your aspirational brand? Any benchmark for your concept?", captures: "the brand, what they like about it", priority: "good_to_have", runningBusinessOnly: false },
  { id: "fc10", number: 10, question: "Do you have a budget set for this project?", captures: "overall project budget: under 50 L, 50 L to 1 Cr, above 1 Cr (the project, not our fee)", priority: "must", runningBusinessOnly: false },
  { id: "fc11", number: 11, question: "Can we schedule a quick video meeting with our lead consultant?", captures: "today or tomorrow, a specific time, calendars blocked", priority: "must", runningBusinessOnly: false },
];

export const VISION_CALL_QUESTIONS: SheetQuestion[] = [
  { id: "lc01", number: 1, section: "vision", question: "If everything goes right, what is your vision for the first three years?", captures: "outlets, cities, monthly sales; RB: what three years look like after streamlining", priority: "must", runningBusinessOnly: false },
  { id: "lc02", number: 2, section: "vision", question: "Why the hospitality business, and why is now the right time?", captures: "motivation, the trigger, personal stake", priority: "must", runningBusinessOnly: false },
  { id: "lc03", number: 3, section: "vision", question: "Who is your aspirational brand, and what do you like about them?", captures: "the brand, the one thing they want to own", priority: "must", runningBusinessOnly: false },
  { id: "lc04", number: 4, section: "business", question: "Who exactly is your target customer, and what will bring them back every week?", captures: "target guest, occasion, the hook: a dish, a drink, a price, a feeling", priority: "must", runningBusinessOnly: false },
  { id: "lc05", number: 5, section: "business", question: "Based on this model, what do you think the monthly sales should be?", captures: "their number, the number that would worry them", priority: "must", runningBusinessOnly: false },
  { id: "lc06", number: 6, section: "business", question: "What are the three things you are most worried about, or see as a challenge here?", captures: "map to scope: menu, team, systems, costs, location, consistency", priority: "must", runningBusinessOnly: false },
  { id: "lc07", number: 7, section: "business", question: "Can you walk me through last month's P&L? What have you already tried to fix?", captures: "sales, food cost, payroll, rent, what is left, fixes that did not work", priority: "must", runningBusinessOnly: true },
  { id: "lc08", number: 8, section: "business", question: "Who runs the business day to day, or who will once we hand over?", captures: "team, senior people and their capability, GM or owner-run", priority: "must", runningBusinessOnly: false },
  { id: "lc09", number: 9, section: "money", question: "What is the overall capex budget?", captures: "capex + working capital; above 1 Cr changes our fee; consulting budget if shared", priority: "must", runningBusinessOnly: false },
  { id: "lc10", number: 10, section: "money", question: "Which agencies have you already hired or onboarded?", captures: "interior, architect, branding, kitchen designer, marketing", priority: "must", runningBusinessOnly: false },
  { id: "lc11", number: 11, section: "decision", question: "How will you measure that we have done our job?", captures: "the number and the date: variance report, SOP compliance, food cost, launch, sales", priority: "must", runningBusinessOnly: false },
  { id: "lc12", number: 12, section: "decision", question: "We will share the proposal by [day]. When are you free to discuss it once you have reviewed?", captures: "proposal date, review call date, founder joins the review", priority: "must", runningBusinessOnly: false },
  { id: "lc13", number: 13, section: "decision", question: "Besides consulting, anything else you need help with: brand, website, marketing, property?", captures: "procurement and monthly handholding too; ask, do not pitch", priority: "good_to_have", runningBusinessOnly: false },
];

export function questionsFor(stream: Stream): SheetQuestion[] {
  return stream === "first_call" ? FIRST_CALL_QUESTIONS : VISION_CALL_QUESTIONS;
}

/** Questions the coverage area expects for this client: must-capture, minus RB-only ones for non-RB clients. */
export function expectedQuestions(stream: Stream, isRunningBusiness: boolean): SheetQuestion[] {
  return questionsFor(stream).filter(
    (q) => q.priority === "must" && (isRunningBusiness || !q.runningBusinessOnly),
  );
}
