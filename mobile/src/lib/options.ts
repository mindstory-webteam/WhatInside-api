import type { Category, DiscardReason, StorageLocation, Unit } from '@/api/types';

export const UNITS: Unit[] = ['pcs', 'g', 'kg', 'ml', 'l', 'pack', 'dozen', 'bottle', 'can', 'oz', 'lb'];
export const STORAGE: StorageLocation[] = ['refrigerator', 'freezer', 'pantry', 'other'];
export const CATEGORIES: Category[] = [
  'dairy', 'meat_seafood', 'produce', 'bakery', 'beverages', 'frozen', 'grains', 'snacks', 'condiments',
  'household', 'personal_care', 'medicine', 'other',
];
export const DISCARD_REASONS: DiscardReason[] = ['expired', 'spoiled', 'damaged', 'not_needed', 'other'];

export const STORAGE_ICON: Record<StorageLocation, string> = {
  refrigerator: 'fridge-outline',
  freezer: 'snowflake',
  pantry: 'archive-outline',
  other: 'home-variant-outline',
};

export const CATEGORY_ICON: Record<Category, string> = {
  dairy: 'cup-water', meat_seafood: 'fish', produce: 'food-apple-outline', bakery: 'baguette', beverages: 'bottle-soda-outline',
  frozen: 'snowflake', grains: 'grain', snacks: 'cookie-outline', condiments: 'shaker-outline', household: 'spray-bottle',
  personal_care: 'lotion-outline', medicine: 'pill', other: 'package-variant-closed',
};

/** Trim trailing zeros from API decimal strings: "2.500" → "2.5". */
export function formatQty(q: string | number | null | undefined): string {
  if (q === null || q === undefined || q === '') return '0';
  const n = Number(q);
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : String(q);
}
