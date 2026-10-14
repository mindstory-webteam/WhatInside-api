import { render, screen } from '@testing-library/react-native';

import { buildQuery } from '@/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import { buildInventoryQuery, parseView } from '@/features/inventory/query';

describe('used-up items', () => {
  it('has a Used up view that asks for finished and discarded batches', () => {
    expect(parseView('used_up')).toBe('used_up');
    const q = buildInventoryQuery({ view: 'used_up', sort: 'expiry' });
    expect(q.status).toEqual(['finished', 'discarded']);
    expect(buildQuery(q as never)).toContain('status=finished&status=discarded');
  });

  it('repeats array params and skips empty values', () => {
    expect(buildQuery({ a: ['x', 'y'], b: 1, c: '' })).toBe('?a=x&a=y&b=1');
  });

  it('shows Finished instead of a countdown for a finished batch', async () => {
    await render(<StatusBadge status="fresh" days={199} batchStatus="finished" />);
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.queryByText(/Expires in/)).toBeNull();
  });

  it('still shows the countdown for active batches', async () => {
    await render(<StatusBadge status="fresh" days={199} />);
    expect(screen.getByText('Expires in 199 days')).toBeTruthy();
  });
});
