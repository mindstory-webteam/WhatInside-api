import type { DateCandidate } from '@/api/types';
import { candidateChoices } from '@/scan/draft';

const cand = (over: Partial<DateCandidate>): DateCandidate => ({
  raw: 'x', line: 0, label: 'unknown', value: null, precision: 'day', ambiguous: false, alternatives: [], note: '', ...over,
});

describe('date choices on the review screen', () => {
  it('month-only expiry offers the last day of the month, only as expiry', () => {
    expect(candidateChoices(cand({ raw: 'APR 2027', label: 'expiry', precision: 'month', value: '2027-04-30',
      alternatives: ['2027-04-01', '2027-04-30'] }))).toEqual([{ target: 'expiry_date', iso: '2027-04-30', monthEdge: 'end' }]);
  });

  it('month-only MFG offers the first day, never as expiry', () => {
    expect(candidateChoices(cand({ raw: 'JULY 2025', label: 'manufacturing', precision: 'month', value: '2025-07-01',
      alternatives: ['2025-07-01', '2025-07-31'] }))).toEqual([{ target: 'manufacturing_date', iso: '2025-07-01', monthEdge: 'start' }]);
  });

  it('unlabelled month-only dates can be used for any field', () => {
    const c = candidateChoices(cand({ raw: 'APR 2027', precision: 'month', alternatives: ['2027-04-01', '2027-04-30'] }));
    expect(c.map((x) => `${x.target}:${x.iso}`)).toEqual([
      'expiry_date:2027-04-30', 'best_before_date:2027-04-30', 'manufacturing_date:2027-04-01']);
  });

  it('ambiguous day dates offer both readings for the labelled field', () => {
    const c = candidateChoices(cand({ label: 'expiry', value: '2026-04-05', ambiguous: true, alternatives: ['2026-05-04'] }));
    expect(c.map((x) => x.iso)).toEqual(['2026-04-05', '2026-05-04']);
    expect(c.every((x) => x.target === 'expiry_date')).toBe(true);
  });

  it('relative shelf life without a computed date offers nothing', () => {
    expect(candidateChoices(cand({ label: 'best_before', precision: 'relative', value: null }))).toEqual([]);
  });
});
