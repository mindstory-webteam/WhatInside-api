import type { DateFormat } from '@/api/types';

import { addDays, isoFromParts, parseISODate } from './dates';

/** Pure calendar helpers (unit-tested). All values are date-only ISO strings. */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

/** 6×7 grid (Monday first). Cells outside the month are null. */
export function monthGrid(y: number, m: number): (string | null)[] {
  const first = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
  const lead = (first + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth(y, m); d += 1) cells.push(isoFromParts(y, m, d));
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function endOfMonth(iso: string): string {
  const p = parseISODate(iso)!;
  return isoFromParts(p.y, p.m, daysInMonth(p.y, p.m));
}

export function addMonths(iso: string, n: number): string {
  const p = parseISODate(iso)!;
  const t = shiftMonth(p.y, p.m, n);
  return isoFromParts(t.y, t.m, Math.min(p.d, daysInMonth(t.y, t.m)));
}

export function quickPicks(today: string): { label: string; iso: string }[] {
  return [
    { label: 'Today', iso: today },
    { label: '+3 days', iso: addDays(today, 3) },
    { label: '+7 days', iso: addDays(today, 7) },
    { label: 'End of month', iso: endOfMonth(today) },
    { label: '+6 months', iso: addMonths(today, 6) },
  ];
}

/**
 * Parse a typed date in the user's format. Accepts / - . or spaces, 2- or 4-digit
 * years, and month names ("30 Apr 2027"). Returns null if it isn't a real date.
 */
export function parseTypedDate(input: string, format: DateFormat = 'DD/MM/YYYY'): string | null {
  const s = input.trim();
  if (!s) return null;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const named = /^(\d{1,2})\s*[-/. ]?\s*([a-z]{3,9})\.?\s*[-/. ,]?\s*(\d{2}|\d{4})$/i.exec(s);
  if (named) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (m > 0) return valid(year(named[3]), m, Number(named[1]));
  }
  const parts = s.split(/[\s/.\-]+/).filter(Boolean);
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, c] = parts.map(Number);
  if (format === 'YYYY-MM-DD' || parts[0].length === 4) return valid(a, b, c);
  if (format === 'MM/DD/YYYY') return valid(year(parts[2]), a, b);
  return valid(year(parts[2]), b, a);
}

const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

function valid(y: number, m: number, d: number): string | null {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m))) return null;
  return isoFromParts(y, m, d);
}
