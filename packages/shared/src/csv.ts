/** Minimal RFC 4180 CSV writer (with formula-injection protection for spreadsheet apps). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  // Prevent CSV/formula injection when opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  // BOM so Excel opens UTF-8 (Vietnamese names) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
