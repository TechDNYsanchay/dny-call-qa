// Spreadsheet downloads: CSV that Excel and Google Sheets open directly. The byte-order mark
// makes Excel read it as UTF-8, so Hindi and the rupee sign come through.

export type Cell = string | number | null | undefined;

const BOM = "﻿";

function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote anything with a comma, quote or line break; a leading = + - @ could run as a formula.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** "dny-leads-2026-10-27.csv" */
export function csvFilename(kind: string, day: string): string {
  return `dny-${kind}-${day}.csv`;
}
