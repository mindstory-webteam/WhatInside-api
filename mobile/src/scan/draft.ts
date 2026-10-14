import type { BarcodeResult, Batch, BatchUpdate, Category, ConfirmScanInput, DateCandidate, OcrResult, Unit } from '@/api/types';
import { UNITS } from '@/lib/options';
import type { ProductForm, ProductFormInput } from '@/validation/schemas';

export type DraftSource = 'ocr' | 'barcode' | 'manual';
export type ReviewField = keyof ProductFormInput;

export interface ReviewDraft {
  source: DraftSource;
  values: ProductFormInput;
  /** Fields the user must look at (low/medium confidence, ambiguous, conflicting, or missing expiry). */
  uncertain: ReviewField[];
  notes: Partial<Record<ReviewField, string>>;
  ocr?: OcrResult;
  barcodeNote?: string;
}

export function blankValues(today: string): ProductFormInput {
  return {
    name: '', brand: '', barcode: '', category: 'other', quantity: '1', unit: 'pcs',
    storage_location: 'refrigerator', purchase_date: today, manufacturing_date: null, expiry_date: null,
    best_before_date: null, expiry_unsure: false, batch_number: '', purchase_price: '', image_url: '',
  };
}

export function emptyDraft(today: string): ReviewDraft {
  return { source: 'manual', values: blankValues(today), uncertain: [], notes: {} };
}

const asUnit = (u: string | null): Unit => (u && (UNITS as string[]).includes(u) ? (u as Unit) : 'pcs');

/** Map normalised OCR fields into the review form. Nothing is ever auto-confirmed. */
export function draftFromOcr(result: OcrResult, today: string): ReviewDraft {
  const f = result.fields;
  const values = blankValues(today);
  const uncertain = new Set<ReviewField>();
  const notes: ReviewDraft['notes'] = {};

  const take = <K extends ReviewField>(key: K, field: { value: unknown; uncertain: boolean; note: string },
                                      map: (v: never) => ProductFormInput[K]) => {
    if (field.value !== null && field.value !== undefined && field.value !== '') {
      values[key] = map(field.value as never);
    }
    if (field.uncertain) uncertain.add(key);
    if (field.note) notes[key] = field.note;
  };

  take('name', f.name, (v: string) => v);
  take('brand', f.brand, (v: string) => v);
  take('quantity', f.quantity, (v: number) => String(v));
  take('unit', f.unit, (v: string) => asUnit(v));
  take('manufacturing_date', f.manufacturing_date, (v: string) => v);
  take('expiry_date', f.expiry_date, (v: string) => v);
  take('best_before_date', f.best_before_date, (v: string) => v);
  take('batch_number', f.batch_number, (v: string) => v);

  // Quantity/unit not found: keep defaults but don't flag as uncertain noise unless OCR tried.
  if (f.quantity.value === null) uncertain.add('quantity');
  // A missing expiry is always highlighted — never silently guessed.
  if (!values.expiry_date && !values.best_before_date) uncertain.add('expiry_date');
  // Brand is optional; don't nag when OCR found nothing at all.
  if (f.brand.value === null) uncertain.delete('brand');

  return { source: 'ocr', values, uncertain: [...uncertain], notes, ocr: result };
}

export function draftFromBarcode(result: BarcodeResult, today: string): ReviewDraft {
  const values = blankValues(today);
  const p = result.product;
  values.name = p.name;
  values.brand = p.brand;
  values.barcode = p.barcode;
  values.category = (p.category || 'other') as Category;
  if (p.quantity) values.quantity = String(p.quantity);
  if (p.unit) values.unit = p.unit;
  values.image_url = p.image_url ?? '';
  if (result.existing_product) {
    values.category = result.existing_product.category;
    values.unit = result.existing_product.default_unit;
  }
  const uncertain: ReviewField[] = ['expiry_date'];
  if (!p.name) uncertain.push('name');
  return { source: 'barcode', values, uncertain, notes: {}, barcodeNote: result.note };
}

/** Build the /scanning/confirm/ payload from validated form values. */
export function toConfirmPayload(v: ProductForm, source: DraftSource): ConfirmScanInput {
  const hasDate = !!(v.expiry_date || v.best_before_date);
  return {
    confirmed: true,
    source,
    new_product: {
      name: v.name.trim(),
      brand: (v.brand ?? '').trim(),
      barcode: v.barcode ?? '',
      category: v.category as Category,
      default_unit: v.unit as Unit,
      image_url: v.image_url || '',
    },
    quantity: v.quantity.replace(',', '.'),
    unit: v.unit as Unit,
    storage_location: v.storage_location as ConfirmScanInput['storage_location'],
    purchase_date: v.purchase_date || null,
    manufacturing_date: v.manufacturing_date || null,
    expiry_date: v.expiry_date || null,
    best_before_date: v.best_before_date || null,
    // "Not sure" keeps the batch flagged for review even if a date was typed.
    expiry_confirmed: hasDate && !v.expiry_unsure,
    batch_number: v.batch_number ?? '',
    purchase_price: v.purchase_price ? v.purchase_price : null,
  };
}

/** Assign a detected date candidate to a form field (user's explicit choice). */
export function applyDateChoice(values: ProductFormInput, target: 'expiry_date' | 'manufacturing_date' | 'best_before_date',
                                iso: string): ProductFormInput {
  return { ...values, [target]: iso, ...(target !== 'manufacturing_date' ? { expiry_unsure: false } : {}) };
}

// ------------------------------------------------ in-memory hand-off between screens

let currentDraft: ReviewDraft | null = null;
export const draftStore = {
  set(d: ReviewDraft) {
    currentDraft = d;
  },
  get() {
    return currentDraft;
  },
  clear() {
    currentDraft = null;
  },
};

// ------------------------------------------------ editing an existing batch

export function draftFromBatch(b: Batch): ReviewDraft {
  return {
    source: 'manual',
    values: {
      name: b.product.name, brand: b.product.brand, barcode: b.product.barcode, category: b.product.category,
      quantity: String(Number(b.quantity)), unit: b.unit, storage_location: b.storage_location,
      purchase_date: b.purchase_date, manufacturing_date: b.manufacturing_date, expiry_date: b.expiry_date,
      best_before_date: b.best_before_date, expiry_unsure: !b.expiry_confirmed && !!(b.expiry_date || b.best_before_date),
      batch_number: b.batch_number, purchase_price: b.purchase_price ?? '', image_url: b.product.image_url,
    },
    uncertain: b.needs_review ? ['expiry_date'] : [],
    notes: {},
  };
}

/** PATCH body for /inventory/{id}/ — includes `version` for conflict detection. */
export function toBatchUpdate(v: ProductForm, version: number): BatchUpdate {
  const hasDate = !!(v.expiry_date || v.best_before_date);
  return {
    version,
    storage_location: v.storage_location as BatchUpdate['storage_location'],
    quantity: v.quantity.replace(',', '.'),
    unit: v.unit as Unit,
    purchase_date: v.purchase_date || null,
    manufacturing_date: v.manufacturing_date || null,
    expiry_date: v.expiry_date || null,
    best_before_date: v.best_before_date || null,
    expiry_confirmed: hasDate && !v.expiry_unsure,
    batch_number: v.batch_number ?? '',
    purchase_price: v.purchase_price ? v.purchase_price : null,
  };
}

/** New batch for an existing product (second purchase with its own dates). */
export function draftForNewBatch(product: Batch['product'], today: string): ReviewDraft {
  const values = blankValues(today);
  Object.assign(values, { name: product.name, brand: product.brand, barcode: product.barcode, category: product.category,
    unit: product.default_unit, image_url: product.image_url });
  return { source: 'manual', values, uncertain: ['expiry_date'], notes: {} };
}


// ------------------------------------------------ date choices offered on the review screen

export type DateTarget = 'expiry_date' | 'best_before_date' | 'manufacturing_date';
export interface DateChoice {
  target: DateTarget;
  iso: string;
  /** Set when a month-only date ("APR 2027") was turned into a day. */
  monthEdge?: 'start' | 'end';
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tappable options for one detected date. The printed label decides which fields
 * it may fill: a MFG date is never offered as an expiry date and vice versa.
 * Month-only dates map to the last day (expiry/best before) or first day (MFG).
 */
export function candidateChoices(c: DateCandidate): DateChoice[] {
  const targets: DateTarget[] =
    c.label === 'expiry' || c.label === 'use_by' ? ['expiry_date']
      : c.label === 'best_before' ? ['best_before_date', 'expiry_date']
        : c.label === 'manufacturing' || c.label === 'packed' ? ['manufacturing_date']
          : ['expiry_date', 'best_before_date', 'manufacturing_date'];
  const out: DateChoice[] = [];
  const add = (choice: DateChoice) => {
    if (ISO_DAY.test(choice.iso) && !out.some((o) => o.target === choice.target && o.iso === choice.iso)) out.push(choice);
  };
  if (c.precision === 'month') {
    const [first, last] = c.alternatives;
    for (const target of targets) {
      if (target === 'manufacturing_date') add({ target, iso: first, monthEdge: 'start' });
      else add({ target, iso: last, monthEdge: 'end' });
    }
    return out;
  }
  const days = [c.value, ...c.alternatives].filter((v): v is string => !!v);
  for (const iso of days) for (const target of targets) add({ target, iso });
  return out;
}
