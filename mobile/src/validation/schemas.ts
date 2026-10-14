import { z } from 'zod';

import { CATEGORIES, STORAGE, UNITS } from '@/lib/options';
import { parseISODate } from '@/lib/dates';
import { isValidMobile } from '@/lib/phone';

/** Messages are i18n keys; screens translate them with t(). */
const isoDate = z.string().refine((v) => !!parseISODate(v), 'validation.date');
const optionalIsoDate = isoDate.nullable().optional();

export const phoneSchema = z.string().trim().min(1, 'validation.phoneRequired')
  .refine((v) => !v.trim() || isValidMobile(v), 'validation.phone');

const passwordSchema = z.string().min(8, 'validation.minPassword');

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'validation.required'),
});
export type LoginForm = z.infer<typeof loginSchema>;

/** Older accounts that signed up with email. */
export const emailLoginSchema = z.object({
  email: z.string().trim().min(1, 'validation.required').email('validation.email'),
  password: z.string().min(1, 'validation.required'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(120),
  phone: phoneSchema,
  password: passwordSchema,
});
export type RegisterForm = z.infer<typeof registerSchema>;

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'validation.otp');

export const resetSchema = z.object({
  otp: otpSchema,
  password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'validation.passwordMismatch' });
export type ResetForm = z.infer<typeof resetSchema>;

const positiveNumber = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .refine((v) => !Number.isNaN(Number(v.replace(',', '.'))), 'validation.number')
  .refine((v) => Number(v.replace(',', '.')) > 0, 'validation.positive');

/** OCR review / manual entry / edit form. */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.required').max(200),
    brand: z.string().trim().max(120).optional().default(''),
    barcode: z.string().trim().regex(/^(\d{6,14})?$/, 'validation.number').optional().default(''),
    category: z.enum(CATEGORIES as [string, ...string[]]),
    quantity: positiveNumber,
    unit: z.enum(UNITS as [string, ...string[]]),
    storage_location: z.enum(STORAGE as [string, ...string[]]),
    purchase_date: optionalIsoDate,
    manufacturing_date: optionalIsoDate,
    expiry_date: optionalIsoDate,
    best_before_date: optionalIsoDate,
    expiry_unsure: z.boolean().default(false),
    batch_number: z.string().trim().max(64).optional().default(''),
    purchase_price: z
      .string()
      .trim()
      .optional()
      .default('')
      .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0), 'validation.number'),
    image_url: z.string().optional().default(''),
  })
  .superRefine((v, ctx) => {
    if (!v.expiry_date && !v.best_before_date && !v.expiry_unsure) {
      ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'review.expiryRequired' });
    }
    if (v.manufacturing_date && v.expiry_date && v.manufacturing_date > v.expiry_date) {
      ctx.addIssue({ code: 'custom', path: ['manufacturing_date'], message: 'validation.mfgAfterExpiry' });
    }
  });
export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductForm = z.output<typeof productFormSchema>;

export const quantitySchema = z.object({ quantity: positiveNumber });

export const shoppingItemSchema = z.object({
  product_name: z.string().trim().min(1, 'validation.required').max(200),
  quantity: positiveNumber,
});

export const householdSchema = z.object({ name: z.string().trim().min(1, 'validation.required').max(120) });
