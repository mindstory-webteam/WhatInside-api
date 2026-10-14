import { formatPhone, isValidMobile, toE164 } from '@/lib/phone';
import { loginSchema, productFormSchema, resetSchema, shoppingItemSchema } from '@/validation/schemas';

const base = {
  name: 'Curd', brand: 'Nestlé', barcode: '', category: 'dairy', quantity: '400', unit: 'g',
  storage_location: 'refrigerator', purchase_date: '2026-10-01', manufacturing_date: '2026-10-01',
  expiry_date: '2026-10-20', best_before_date: null, expiry_unsure: false, batch_number: 'B1', purchase_price: '',
};

const messages = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('login schema', () => {
  it('requires a valid mobile number and password', () => {
    expect(messages(loginSchema.safeParse({ phone: '12345', password: '' }))).toEqual({
      phone: 'validation.phone', password: 'validation.required',
    });
    expect(messages(loginSchema.safeParse({ phone: '', password: 'x' }))).toEqual({ phone: 'validation.phoneRequired' });
    expect(loginSchema.safeParse({ phone: '98765 43210', password: 'x' }).success).toBe(true);
  });

  it('normalises Indian mobile numbers', () => {
    for (const raw of ['9876543210', '+91 98765 43210', '098765-43210', '0091 9876543210', '919876543210']) {
      expect(toE164(raw)).toBe('+919876543210');
      expect(isValidMobile(raw)).toBe(true);
    }
    expect(isValidMobile('5876543210')).toBe(false);
    expect(isValidMobile('98765')).toBe(false);
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('reset form needs a 6-digit code and matching passwords', () => {
    expect(messages(resetSchema.safeParse({ otp: '12', password: 'Gr33n-leaves', confirm: 'other' }))).toEqual({
      otp: 'validation.otp', confirm: 'validation.passwordMismatch',
    });
    expect(resetSchema.safeParse({ otp: '123456', password: 'Gr33n-leaves', confirm: 'Gr33n-leaves' }).success).toBe(true);
  });
});

describe('product form schema', () => {
  it('accepts a complete, consistent form', () => {
    expect(productFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires an expiry date unless the user says they are unsure', () => {
    const missing = { ...base, expiry_date: null };
    expect(messages(productFormSchema.safeParse(missing))).toEqual({ expiry_date: 'review.expiryRequired' });
    expect(productFormSchema.safeParse({ ...missing, expiry_unsure: true }).success).toBe(true);
    expect(productFormSchema.safeParse({ ...missing, best_before_date: '2026-12-01' }).success).toBe(true);
  });

  it('rejects manufacturing date after expiry date', () => {
    const r = productFormSchema.safeParse({ ...base, manufacturing_date: '2026-11-01' });
    expect(messages(r)).toEqual({ manufacturing_date: 'validation.mfgAfterExpiry' });
  });

  it.each([['0'], ['-2'], ['abc'], ['']])('rejects quantity %p', (quantity) => {
    expect(productFormSchema.safeParse({ ...base, quantity }).success).toBe(false);
  });

  it('accepts decimal comma quantities and validates barcode digits', () => {
    expect(productFormSchema.safeParse({ ...base, quantity: '1,5' }).success).toBe(true);
    expect(productFormSchema.safeParse({ ...base, barcode: '12ab' }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, barcode: '8901058000290' }).success).toBe(true);
  });

  it('rejects impossible calendar dates', () => {
    expect(productFormSchema.safeParse({ ...base, expiry_date: '2026-02-30' }).success).toBe(false);
  });
});

describe('shopping item schema', () => {
  it('requires a name and positive quantity', () => {
    expect(shoppingItemSchema.safeParse({ product_name: ' ', quantity: '1' }).success).toBe(false);
    expect(shoppingItemSchema.safeParse({ product_name: 'Milk', quantity: '0' }).success).toBe(false);
    expect(shoppingItemSchema.safeParse({ product_name: 'Milk', quantity: '2' }).success).toBe(true);
  });
});
