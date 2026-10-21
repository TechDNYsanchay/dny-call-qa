// Pulls call history from Callyzer's API and stores it like webhook deliveries.
// CALLYZER_API_BASE is the sandbox (https://sandbox.api.callyzer.co) until the paid API add-on is
// active, then the production host (https://api1.callyzer.co); the key changes with it.

import "server-only";
import { parseCallHistoryRows } from "@/lib/callyzer";
import { storeCallyzerCalls } from "./callyzer";
import { copyRecording } from "./recordings";

const PAGE_SIZE = 100;
const MAX_ROWS = 20_000;

export async function fetchCallHistory(fromDay: string, toDay: string): Promise<unknown[]> {
  const key = process.env.CALLYZER_API_KEY;
  if (!key) throw new Error("CALLYZER_API_KEY is not set");
  const base = process.env.CALLYZER_API_BASE ?? "https://api1.callyzer.co";

  const rows: unknown[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE_SIZE) {
    const response = await fetch(`${base}/admin/api/call/callHistory`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        callStartDate: fromDay,
        callEndDate: toDay,
        callTypes: "Incoming,Outgoing,Missed,Rejected",
        recordFrom: String(start),
        pageSize: String(PAGE_SIZE),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Callyzer API: HTTP ${response.status}`);
    const text = await response.text();
    // The sandbox answers with an empty body for dates outside its locked window.
    if (!text) throw new Error(`Callyzer API returned nothing for ${fromDay} to ${toDay} (outside the allowed dates?)`);
    const json = JSON.parse(text) as { data?: unknown; recordsTotal?: number };
    const page = Array.isArray(json.data) ? json.data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE || rows.length >= (json.recordsTotal ?? 0)) break;
  }
  return rows;
}

export interface SyncResult {
  from: string;
  to: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  recordingsCopied: number;
  recordingsFailed: number;
}

export async function syncCallyzer(fromDay: string, toDay: string): Promise<SyncResult> {
  const rows = await fetchCallHistory(fromDay, toDay);
  const parsed = parseCallHistoryRows(rows);
  if (parsed.skipped.length) console.warn("callyzer sync: skipped rows", parsed.skipped.slice(0, 10));
  const stored = await storeCallyzerCalls(parsed.calls);

  let recordingsCopied = 0;
  let recordingsFailed = 0;
  for (const call of stored.toDownload) {
    try {
      await copyRecording(call);
      recordingsCopied++;
    } catch (error) {
      recordingsFailed++;
      console.error(`callyzer sync: recording for call ${call.callId} not copied:`, error instanceof Error ? error.message : error);
    }
  }
  return {
    from: fromDay,
    to: toDay,
    fetched: rows.length,
    inserted: stored.inserted,
    updated: stored.updated,
    skipped: parsed.skipped.length,
    recordingsCopied,
    recordingsFailed,
  };
}
