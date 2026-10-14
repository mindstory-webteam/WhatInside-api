import type { BarcodeResult } from '@/api/types';
import { field, ocrFixture } from '@/test-utils/fixtures';
import { applyDateChoice, draftFromBarcode, draftFromOcr, toConfirmPayload } from '@/scan/draft';
import { productFormSchema } from '@/validation/schemas';

describe('OCR review draft', () => {
  it('maps fields and highlights uncertain ones', () => {
    const d = draftFromOcr(ocrFixture(), '2026-10-12');
    expect(d.values.name).toBe('Curd');
    expect(d.values.quantity).toBe('400');
    expect(d.values.unit).toBe('g');
    expect(d.values.expiry_date).toBe('2026-06-11');
    expect(d.uncertain).toEqual(expect.arrayContaining(['name', 'expiry_date', 'brand', 'manufacturing_date']));
    expect(d.uncertain).not.toContain('quantity');
    expect(d.notes.expiry_date).toMatch(/swapped/);
  });

  it('never fills a missing expiry date and flags it', () => {
    const d = draftFromOcr(ocrFixture({ expiry_date: field<string | null>(null, 'none') }), '2026-10-12');
    expect(d.values.expiry_date).toBeNull();
    expect(d.uncertain).toContain('expiry_date');
    // and the form refuses to save until the user decides
    expect(productFormSchema.safeParse(d.values).success).toBe(false);
  });

  it('lets the user correct a date by choosing a detected candidate', () => {
    const d = draftFromOcr(ocrFixture(), '2026-10-12');
    const v = applyDateChoice(d.values, 'expiry_date', '2026-11-06');
    expect(v.expiry_date).toBe('2026-11-06');
    expect(v.manufacturing_date).toBe('2026-05-12');
  });

  it('builds a confirmed payload; "not sure" keeps the date unconfirmed', () => {
    const d = draftFromOcr(ocrFixture(), '2026-10-12');
    const parsed = productFormSchema.parse(d.values);
    const payload = toConfirmPayload(parsed, 'ocr');
    expect(payload).toMatchObject({ confirmed: true, source: 'ocr', expiry_confirmed: true, quantity: '400',
      new_product: { name: 'Curd', brand: 'Nestlé', category: 'other' } });
    const unsure = toConfirmPayload(productFormSchema.parse({ ...d.values, expiry_unsure: true }), 'ocr');
    expect(unsure.expiry_confirmed).toBe(false);
    expect(unsure.expiry_date).toBe('2026-06-11');
  });
});

describe('barcode draft', () => {
  it('fills product identity but never an expiry date', () => {
    const r: BarcodeResult = {
      found: true, status: 'found', source: 'provider', existing_product: null, note: 'no expiry in barcodes',
      product: { name: 'Milk', brand: 'Milma', barcode: '8901058000290', category: 'dairy', quantity: 500, unit: 'ml', image_url: '' },
    };
    const d = draftFromBarcode(r, '2026-10-12');
    expect(d.values).toMatchObject({ name: 'Milk', brand: 'Milma', barcode: '8901058000290', quantity: '500', unit: 'ml' });
    expect(d.values.expiry_date).toBeNull();
    expect(d.uncertain).toEqual(['expiry_date']);
  });

  it('allows a custom product when not found', () => {
    const r: BarcodeResult = {
      found: false, status: 'not_found', source: 'provider', existing_product: null, note: '',
      product: { name: '', brand: '', barcode: '4006381333931', category: 'other', quantity: null, unit: null, image_url: '' },
    };
    const d = draftFromBarcode(r, '2026-10-12');
    expect(d.values.barcode).toBe('4006381333931');
    expect(d.uncertain).toContain('name');
  });
});
