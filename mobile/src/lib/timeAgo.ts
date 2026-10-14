import type { TFunction } from 'i18next';

import { MONTH_NAMES } from './calendar';

/**
 * "just now" / "5 min ago" / "3 h ago" / "2 days ago" / "12 Oct".
 * Plain arithmetic + translations — Hermes (React Native) has no Intl.RelativeTimeFormat.
 */
export function timeAgo(iso: string, t: TFunction, now: number = Date.now()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const min = Math.floor(Math.max(0, now - then.getTime()) / 60000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutes', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('time.hours', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('time.days', { count: d });
  return `${then.getDate()} ${MONTH_NAMES[then.getMonth()].slice(0, 3)}`;
}
