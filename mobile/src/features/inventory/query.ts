import type { Category, InventoryQuery } from '@/api/types';

export type InventoryView = 'all' | 'refrigerator' | 'freezer' | 'pantry' | 'other' | 'expiring_soon' | 'expired' | 'review' | 'used_up';
export type SortKey = 'expiry' | 'name' | 'recent';

export const VIEWS: InventoryView[] = ['all', 'refrigerator', 'freezer', 'pantry', 'other', 'expiring_soon', 'expired', 'review', 'used_up'];

const SORT: Record<SortKey, string> = { expiry: 'effective_expiry', name: 'product_name', recent: '-created_at' };

/** Translate UI filter state into API query parameters (unit-tested). */
export function buildInventoryQuery(opts: { view: InventoryView; search?: string; category?: Category | 'any'; sort: SortKey }):
  InventoryQuery {
  const q: InventoryQuery = { ordering: SORT[opts.sort], page_size: 30 };
  switch (opts.view) {
    case 'refrigerator':
    case 'freezer':
    case 'pantry':
    case 'other':
      q.storage_location = opts.view;
      break;
    case 'expiring_soon':
    case 'expired':
      q.expiry_status = opts.view;
      break;
    case 'review':
      q.needs_review = true;
      break;
    case 'used_up':
      // Finished/discarded batches are hidden from every other view.
      q.status = ['finished', 'discarded'];
      q.ordering = '-created_at';
      break;
    default:
      break;
  }
  const s = opts.search?.trim();
  if (s) q.search = s;
  if (opts.category && opts.category !== 'any') q.category = opts.category;
  return q;
}

export function parseView(v: unknown): InventoryView {
  return typeof v === 'string' && (VIEWS as string[]).includes(v) ? (v as InventoryView) : 'all';
}
