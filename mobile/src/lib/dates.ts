import type { DateFormat, ISODate } from '@/api/types';

/**
 * Expiry dates are calendar dates, not instants. They are always handled as
 * 'YYYY-MM-DD' strings or as *local* Date objects built from components — never
 * via `new Date('YYYY-MM-DD')`, which parses as UTC midnight and can shift a day.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function isoFromParts(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISODate(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return { y, m, d };
}

/** Local-midnight Date for a date-only string (for date pickers). */
export function dateFromISO(iso: string): Date {
  const p = parseISODate(iso);
  if (!p) throw new Error(`Invalid date ${iso}`);
  return new Date(p.y, p.m - 1, p.d);
}

/** Date-only string from a picker's local Date. */
export function isoFromLocalDate(date: Date): ISODate {
  return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Today's calendar date in an IANA timezone (falls back to device local time). */
export function todayIn(timeZone?: string, now: Date = new Date()): ISODate {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      return isoFromParts(get('year'), get('month'), get('day'));
    } catch {
      // Intl timezone data unavailable — fall through
    }
  }
  return isoFromLocalDate(now);
}

/** Whole days from `from` to `to` (both date-only). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  if (!a || !b) return NaN;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const p = parseISODate(iso)!;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string | null | undefined, format: DateFormat = 'DD/MM/YYYY'): string {
  const p = parseISODate(iso ?? null);
  if (!p) return '—';
  if (format === 'MM/DD/YYYY') return `${pad(p.m)}/${pad(p.d)}/${p.y}`;
  if (format === 'YYYY-MM-DD') return isoFromParts(p.y, p.m, p.d);
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

export function formatDateLong(iso: string | null | undefined): string {
  const p = parseISODate(iso ?? null);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : '—';
}

export function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
