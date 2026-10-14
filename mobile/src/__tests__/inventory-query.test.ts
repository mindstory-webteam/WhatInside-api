import { buildInventoryQuery, parseView } from '@/features/inventory/query';

describe('inventory filters', () => {
  it('maps storage views to storage_location', () => {
    expect(buildInventoryQuery({ view: 'freezer', sort: 'expiry' })).toEqual({
      storage_location: 'freezer', ordering: 'effective_expiry', page_size: 30,
    });
  });

  it('maps expiry views and review', () => {
    expect(buildInventoryQuery({ view: 'expired', sort: 'name' })).toMatchObject({ expiry_status: 'expired', ordering: 'product_name' });
    expect(buildInventoryQuery({ view: 'expiring_soon', sort: 'recent' })).toMatchObject({ expiry_status: 'expiring_soon', ordering: '-created_at' });
    expect(buildInventoryQuery({ view: 'review', sort: 'expiry' })).toMatchObject({ needs_review: true });
  });

  it('adds trimmed search and category, ignoring "any"', () => {
    const q = buildInventoryQuery({ view: 'all', search: '  milk ', category: 'dairy', sort: 'expiry' });
    expect(q).toMatchObject({ search: 'milk', category: 'dairy' });
    expect(buildInventoryQuery({ view: 'all', search: ' ', category: 'any', sort: 'expiry' })).not.toHaveProperty('category');
  });

  it('parses route params defensively', () => {
    expect(parseView('pantry')).toBe('pantry');
    expect(parseView('../../etc')).toBe('all');
    expect(parseView(undefined)).toBe('all');
  });
});
