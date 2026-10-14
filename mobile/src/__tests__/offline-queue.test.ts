import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/api/client';
import { __resetQueueForTests, enqueue, flushQueue, loadQueue, pendingCount, type QueueEntry } from '@/offline/queue';

describe('offline queue', () => {
  beforeEach(async () => {
    await __resetQueueForTests();
  });

  it('persists queued actions with idempotency ids', async () => {
    const e = await enqueue({ type: 'consume', batchId: 1, quantity: '1', version: 3 });
    expect(e.id).toMatch(/^uuid-/);
    expect(JSON.parse((await AsyncStorage.getItem('wi.offline-queue.v1'))!)).toHaveLength(1);
  });

  it('replays in order and stops while still offline', async () => {
    await enqueue({ type: 'shopping.purchase', itemId: 1 });
    await enqueue({ type: 'shopping.purchase', itemId: 2 });
    const seen: number[] = [];
    const run = jest.fn(async (entry: QueueEntry) => {
      const id = (entry.action as { itemId: number }).itemId;
      if (id === 2) throw new ApiError('network', 'offline');
      seen.push(id);
    });
    const r = await flushQueue(run);
    expect(seen).toEqual([1]);
    expect(r).toMatchObject({ synced: 1, remaining: 1, failures: [] });
    expect(pendingCount()).toBe(1);
  });

  it('drops conflicting actions and reports them instead of overwriting', async () => {
    await enqueue({ type: 'consume', batchId: 1, quantity: '1', version: 1 });
    await enqueue({ type: 'finish', batchId: 2 });
    const run = jest.fn(async (entry: QueueEntry) => {
      if (entry.action.type === 'consume') throw new ApiError('conflict', 'changed elsewhere', 409);
    });
    const r = await flushQueue(run);
    expect(r.synced).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].conflict).toBe(true);
    expect(pendingCount()).toBe(0);
  });

  it('reloads persisted entries after restart', async () => {
    await enqueue({ type: 'shopping.remove', itemId: 9 });
    const raw = await AsyncStorage.getItem('wi.offline-queue.v1');
    await __resetQueueForTests();
    await AsyncStorage.setItem('wi.offline-queue.v1', raw!);
    expect(await loadQueue()).toHaveLength(1);
  });
});
