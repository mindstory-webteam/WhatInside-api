import type { OcrResult } from '@/api/types';

export const field = <T,>(value: T, confidence: 'high' | 'medium' | 'low' | 'none' = 'high', note = '') =>
  ({ value, confidence, source: 'label', note, uncertain: confidence !== 'high' });

export const ocrFixture = (over: Partial<OcrResult['fields']> = {}): OcrResult => ({
  raw_text: 'Nestlé\nCurd\nNet Quantity: 400g\nMFD: 12/05/2026\nEXP: 11/06/2026',
  lines: ['Nestlé', 'Curd'],
  fields: {
    name: field<string | null>('Curd', 'low', 'Product name guessed'),
    brand: field<string | null>('Nestlé', 'medium'),
    quantity: field<number | null>(400),
    unit: field<string | null>('g'),
    manufacturing_date: field<string | null>('2026-05-12', 'medium'),
    expiry_date: field<string | null>('2026-06-11', 'low', 'Day and month could be swapped.'),
    best_before_date: field<string | null>(null, 'none'),
    batch_number: field<string | null>('B1234', 'medium'),
    ...over,
  },
  date_candidates: [
    { raw: '11/06/2026', line: 4, label: 'expiry', value: '2026-06-11', precision: 'day', ambiguous: true,
      alternatives: ['2026-11-06'], note: 'Day and month could be swapped.' },
  ],
  warnings: ['Some dates could be read as day/month or month/day. Please check them.'],
  requires_review: true,
  ocr_source: 'device',
});

