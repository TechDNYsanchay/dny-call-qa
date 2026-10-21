// Data access for the screens. Reads sample data until Supabase is connected; the
// function signatures are what the Supabase version will keep.

import { CALLS, IS_SAMPLE_DATA, PEOPLE, PREVIOUS_DAYS, REPORT_DATE } from "./sample-data";
import type { CallRecord, Person } from "./types";

export type { CallRecord, Person } from "./types";
export { IS_SAMPLE_DATA, REPORT_DATE };

export function listPeople(): Person[] {
  return PEOPLE;
}

export function getPerson(id: string): Person | null {
  return PEOPLE.find((p) => p.id === id) ?? null;
}

/** Calls for the report day, earliest first. */
export function listCalls(): CallRecord[] {
  return [...CALLS].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function getCall(id: string): CallRecord | null {
  return CALLS.find((c) => c.id === id) ?? null;
}

export function previousDayAverages(): Record<string, number[]> {
  return PREVIOUS_DAYS;
}
