// Callyzer -> call records, from the webhook payload or the call-history API. Pure functions;
// storing them is in lib/ingest.
// Webhook shape (help.callyzer.co, "How to manage webhook response"): a list of employees, each
// with the call logs synced from their phone. API shape: POST /admin/api/call/callHistory returns
// { data: [one row per call], recordsTotal }.

import { z } from "zod";
import { scoringEligibility, type NotScoredReason } from "@/lib/scoring/compute";

const LogSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  countryCode: z.union([z.string(), z.number()]).nullish(),
  number: z.union([z.string(), z.number()]).nullish(),
  duration: z.coerce.number().int().nonnegative(),
  callType: z.string().nullish(),
  callTime: z.string().min(1),
  recordingURL: z.string().nullish(),
});

const EmployeeSchema = z.object({
  employeeName: z.string().nullish(),
  countryCode: z.union([z.string(), z.number()]).nullish(),
  employeeNumber: z.union([z.string(), z.number()]).nullish(),
  logs: z.array(z.unknown()).nullish(),
});

export type CallDirection = "incoming" | "outgoing" | "missed" | "rejected" | "other";

export interface CallyzerCall {
  sourceId: string;
  agentPhone: string | null;
  agentName: string | null;
  clientPhone: string | null;
  clientName: string | null;
  /** ISO timestamp with the +05:30 offset. */
  startedAt: string;
  durationSec: number;
  direction: CallDirection;
  recordingUrl: string | null;
  /** Why it will never be scored, or null when it goes on to transcription. */
  notScored: NotScoredReason | null;
}

/** Callyzer sends country code and number separately; returns E.164 (+919876543210) or null. */
export function toE164(countryCode: string | number | null | undefined, number: string | number | null | undefined): string | null {
  const digits = String(number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const cc = String(countryCode ?? "").replace(/\D/g, "") || "91";
  if (digits.length > 10 && digits.startsWith(cc)) return `+${digits}`;
  return `+${cc}${digits.replace(/^0+/, "")}`;
}

/** "2023-02-04 18:09:26" is the phone's local time; DNY's phones are in India. */
export function callTimeToIso(callTime: string): string | null {
  const t = callTime.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) return Number.isNaN(Date.parse(t)) ? null : t;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  return m ? `${m[1]}T${m[2]}${m[3] ?? ":00"}+05:30` : null;
}

export function toDirection(callType: string | null | undefined): CallDirection {
  const t = (callType ?? "").trim().toLowerCase();
  return t === "incoming" || t === "outgoing" || t === "missed" || t === "rejected" ? t : "other";
}

const UNKNOWN_NAMES = new Set(["", "unknown", "null"]);

export interface ParsedPayload {
  calls: CallyzerCall[];
  /** Entries that could not be read; logged, never fatal for the rest of the batch. */
  skipped: { reason: string; id?: string }[];
}

export function parseCallyzerPayload(payload: unknown): ParsedPayload | null {
  const employees = z.union([z.array(EmployeeSchema), EmployeeSchema]).safeParse(payload);
  if (!employees.success) return null;

  const result: ParsedPayload = { calls: [], skipped: [] };
  for (const employee of Array.isArray(employees.data) ? employees.data : [employees.data]) {
    const agentPhone = toE164(employee.countryCode, employee.employeeNumber);
    for (const raw of employee.logs ?? []) {
      const log = LogSchema.safeParse(raw);
      if (!log.success) {
        result.skipped.push({ reason: "unreadable call log", id: (raw as { id?: string } | null)?.id });
        continue;
      }
      const startedAt = callTimeToIso(log.data.callTime);
      if (!startedAt) {
        result.skipped.push({ reason: `unreadable callTime "${log.data.callTime}"`, id: log.data.id });
        continue;
      }
      const recordingUrl = log.data.recordingURL?.startsWith("https://") ? log.data.recordingURL : null;
      const eligibility = scoringEligibility({
        durationSec: log.data.duration,
        recordingStatus: recordingUrl ? "available" : "pending",
      });
      const name = log.data.name?.trim() ?? "";
      result.calls.push({
        sourceId: log.data.id,
        agentPhone,
        agentName: employee.employeeName?.trim() || null,
        clientPhone: toE164(log.data.countryCode, log.data.number),
        clientName: UNKNOWN_NAMES.has(name.toLowerCase()) ? null : name,
        startedAt,
        durationSec: log.data.duration,
        direction: toDirection(log.data.callType),
        recordingUrl,
        // A recording that hasn't synced yet is not a reason to give up on the call.
        notScored: eligibility.eligible || eligibility.reason === "recording_pending" ? null : eligibility.reason,
      });
    }
  }
  return result;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** API date "21 Oct 2026" + time "11:40 am" (phone's local time, India) -> ISO with +05:30. */
export function apiDateTimeToIso(date: string, time: string): string | null {
  const d = date.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
  const month = d && MONTHS[d[2].toLowerCase()];
  if (!d || !t || !month) return null;
  let hour = Number(t[1]);
  const meridiem = t[4]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || Number(t[2]) > 59) return null;
  return `${d[3]}-${month}-${d[1].padStart(2, "0")}T${String(hour).padStart(2, "0")}:${t[2]}:${t[3] ?? "00"}+05:30`;
}

const ApiRowSchema = z.object({
  uniqueId: z.string().trim().min(1),
  employeeName: z.string().nullish(),
  employeeNumber: z.union([z.string(), z.number()]).nullish(),
  clientName: z.string().nullish(),
  countryCode: z.union([z.string(), z.number()]).nullish(),
  clientNumber: z.union([z.string(), z.number()]).nullish(),
  date: z.string(),
  time: z.string(),
  durationInSeconds: z.coerce.number().int().nonnegative(),
  callType: z.string().nullish(),
  callRecordingPath: z.string().nullish(),
});

/** Rows from the call-history API, in the same shape the webhook produces. */
export function parseCallHistoryRows(rows: unknown[]): ParsedPayload {
  const result: ParsedPayload = { calls: [], skipped: [] };
  for (const raw of rows) {
    const row = ApiRowSchema.safeParse(raw);
    if (!row.success) {
      result.skipped.push({ reason: "unreadable call-history row", id: (raw as { uniqueId?: string } | null)?.uniqueId?.trim() });
      continue;
    }
    const r = row.data;
    const startedAt = apiDateTimeToIso(r.date, r.time);
    if (!startedAt) {
      result.skipped.push({ reason: `unreadable date/time "${r.date} ${r.time}"`, id: r.uniqueId });
      continue;
    }
    const recordingUrl = r.callRecordingPath?.startsWith("https://") ? r.callRecordingPath : null;
    const eligibility = scoringEligibility({ durationSec: r.durationInSeconds, recordingStatus: recordingUrl ? "available" : "pending" });
    const name = r.clientName?.trim() ?? "";
    result.calls.push({
      sourceId: r.uniqueId,
      // The API's countryCode belongs to the client; DNY's own phones are Indian numbers.
      agentPhone: toE164("91", r.employeeNumber),
      agentName: r.employeeName?.trim() || null,
      clientPhone: toE164(r.countryCode, r.clientNumber),
      clientName: UNKNOWN_NAMES.has(name.toLowerCase()) ? null : name,
      startedAt,
      durationSec: r.durationInSeconds,
      direction: toDirection(r.callType),
      recordingUrl,
      notScored: eligibility.eligible || eligibility.reason === "recording_pending" ? null : eligibility.reason,
    });
  }
  return result;
}
