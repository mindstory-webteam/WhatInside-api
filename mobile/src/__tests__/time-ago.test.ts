import i18n from '@/i18n';
import { timeAgo } from '@/lib/timeAgo';

const now = new Date('2026-10-13T12:00:00Z').getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('timeAgo (no Intl.RelativeTimeFormat needed)', () => {
  const t = i18n.t.bind(i18n);
  it('formats minutes, hours, days and dates', () => {
    expect(timeAgo(ago(10_000), t, now)).toBe('just now');
    expect(timeAgo(ago(5 * 60_000), t, now)).toBe('5 min ago');
    expect(timeAgo(ago(3 * 3_600_000), t, now)).toBe('3 h ago');
    expect(timeAgo(ago(86_400_000), t, now)).toBe('1 day ago');
    expect(timeAgo(ago(2 * 86_400_000), t, now)).toBe('2 days ago');
    expect(timeAgo('2026-09-01T10:00:00Z', t, now)).toMatch(/^1 Sep$/);
    expect(timeAgo('garbage', t, now)).toBe('');
  });
});
