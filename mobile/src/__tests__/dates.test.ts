import { addDays, dateFromISO, daysBetween, formatDate, isoFromLocalDate, parseISODate, todayIn } from '@/lib/dates';

describe('date-only handling', () => {
  it('round-trips without timezone shifts', () => {
    const d = dateFromISO('2026-03-01');
    expect(d.getDate()).toBe(1);
    expect(isoFromLocalDate(d)).toBe('2026-03-01');
  });

  it('rejects invalid dates', () => {
    expect(parseISODate('2026-02-29')).toBeNull();
    expect(parseISODate('2028-02-29')).not.toBeNull();
    expect(parseISODate('12/05/2025')).toBeNull();
  });

  it('computes day differences across DST and month boundaries', () => {
    expect(daysBetween('2026-03-28', '2026-04-02')).toBe(5);
    expect(daysBetween('2026-10-12', '2026-10-05')).toBe(-7);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('uses the household timezone for "today"', () => {
    const instant = new Date('2026-10-12T20:00:00Z'); // 01:30 next day in India
    expect(todayIn('Asia/Kolkata', instant)).toBe('2026-10-13');
    expect(todayIn('America/New_York', instant)).toBe('2026-10-12');
  });

  it('formats according to the user preference', () => {
    expect(formatDate('2026-06-11', 'DD/MM/YYYY')).toBe('11/06/2026');
    expect(formatDate('2026-06-11', 'MM/DD/YYYY')).toBe('06/11/2026');
    expect(formatDate(null)).toBe('—');
  });
});
