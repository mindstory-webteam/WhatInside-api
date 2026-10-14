import NetInfo from '@react-native-community/netinfo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { enqueue, flushQueue, loadQueue, pendingCount, type QueuedAction, subscribeQueue } from '@/offline/queue';

import { ApiError } from './client';
import { dashboardApi, householdApi, inventoryApi, notificationApi, shoppingApi } from './endpoints';
import type { Batch, DiscardReason, ID, InventoryQuery, NotificationPreferences, Paginated, ShoppingItem } from './types';

/** Query keys are namespaced by household so switching homes never mixes data. */
export const qk = {
  dashboard: (h?: ID) => ['dashboard', h] as const,
  expiring: (h?: ID) => ['expiring', h] as const,
  inventory: (h: ID | undefined, q: InventoryQuery) => ['inventory', h, q] as const,
  batch: (h: ID | undefined, id: ID) => ['batch', h, id] as const,
  history: (id: ID) => ['history', id] as const,
  activity: (h?: ID) => ['activity', h] as const,
  shopping: (h?: ID) => ['shopping', h] as const,
  notifications: (upcoming: boolean) => ['notifications', upcoming] as const,
  preferences: ['preferences'] as const,
  overview: (h?: ID) => ['overview', h] as const,
  waste: (h?: ID) => ['waste', h] as const,
  members: (h?: ID) => ['members', h] as const,
};

const useHid = () => useAuth().household?.id;

export function useDashboard() {
  const h = useHid();
  return useQuery({ queryKey: qk.dashboard(h), queryFn: dashboardApi.summary, enabled: !!h });
}

export function useExpiringSoon(days = 7) {
  const h = useHid();
  return useQuery({ queryKey: qk.expiring(h), queryFn: () => dashboardApi.expiringSoon(days), enabled: !!h });
}

export function useActivity() {
  const h = useHid();
  return useQuery({ queryKey: qk.activity(h), queryFn: () => inventoryApi.activity(8), enabled: !!h });
}

export function useInventory(query: InventoryQuery) {
  const h = useHid();
  return useQuery({ queryKey: qk.inventory(h, query), queryFn: () => inventoryApi.list(query), enabled: !!h });
}

export function useBatch(id: ID) {
  const h = useHid();
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.batch(h, id),
    queryFn: () => inventoryApi.get(id),
    enabled: !!h && Number.isFinite(id),
    // Show the list row instantly while the detail loads / when offline.
    initialData: () => {
      for (const [, data] of qc.getQueriesData<Paginated<Batch>>({ queryKey: ['inventory', h] })) {
        const hit = data?.results.find((b) => b.id === id);
        if (hit) return hit;
      }
      return undefined;
    },
  });
}

export function useBatchHistory(id: ID) {
  return useQuery({ queryKey: qk.history(id), queryFn: () => inventoryApi.history(id) });
}

export function useShopping() {
  const h = useHid();
  return useQuery({ queryKey: qk.shopping(h), queryFn: shoppingApi.list, enabled: !!h });
}

export function useNotificationHistory(upcoming = false) {
  return useQuery({ queryKey: qk.notifications(upcoming), queryFn: () => notificationApi.history(upcoming) });
}

export function usePreferences() {
  return useQuery({ queryKey: qk.preferences, queryFn: notificationApi.preferences });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<NotificationPreferences>) => notificationApi.updatePreferences(data),
    onMutate: async (data) => {
      const prev = qc.getQueryData<NotificationPreferences>(qk.preferences);
      if (prev) qc.setQueryData(qk.preferences, { ...prev, ...data });
      return { prev };
    },
    onError: (_e, _d, ctx) => ctx?.prev && qc.setQueryData(qk.preferences, ctx.prev),
    onSuccess: (data) => qc.setQueryData(qk.preferences, data),
  });
}

export function useOverview() {
  const h = useHid();
  return useQuery({ queryKey: qk.overview(h), queryFn: () => dashboardApi.overview(6), enabled: !!h });
}

export function useWaste() {
  const h = useHid();
  return useQuery({ queryKey: qk.waste(h), queryFn: () => dashboardApi.waste(6), enabled: !!h });
}

export function useMembers() {
  const h = useHid();
  return useQuery({ queryKey: qk.members(h), queryFn: () => householdApi.members(h!), enabled: !!h });
}

/** Invalidate everything derived from inventory after a change. */
export function useInvalidateInventory() {
  const qc = useQueryClient();
  return useCallback(
    () => Promise.all(['inventory', 'batch', 'dashboard', 'expiring', 'activity', 'overview', 'waste', 'shopping',
      'history', 'notifications', 'reminder-batches'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
    [qc],
  );
}

// ---------------------------------------------------------------- batch actions

export type BatchAction =
  | { kind: 'consume'; quantity: string }
  | { kind: 'finish' }
  | { kind: 'discard'; quantity?: string; reason: DiscardReason }
  | { kind: 'restock'; quantity: string };

/**
 * Runs a batch action online; if the device is offline, the (replay-safe)
 * action is queued with the batch's version and synced later.
 */
export function useBatchAction(batch: Batch | undefined) {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: async (a: BatchAction): Promise<{ queued: boolean }> => {
      if (!batch) throw new Error('No batch');
      const v = batch.version;
      try {
        if (a.kind === 'consume') await inventoryApi.consume(batch.id, a.quantity, v);
        else if (a.kind === 'finish') await inventoryApi.finish(batch.id, v);
        else if (a.kind === 'discard') await inventoryApi.discard(batch.id, { quantity: a.quantity, reason: a.reason, version: v });
        else await inventoryApi.restock(batch.id, a.quantity);
        return { queued: false };
      } catch (e) {
        if (e instanceof ApiError && e.isOffline && a.kind !== 'restock') {
          const queued: QueuedAction = a.kind === 'consume'
            ? { type: 'consume', batchId: batch.id, quantity: a.quantity, version: v }
            : a.kind === 'finish' ? { type: 'finish', batchId: batch.id, version: v }
              : { type: 'discard', batchId: batch.id, quantity: a.quantity, reason: a.reason, version: v };
          await enqueue(queued);
          return { queued: true };
        }
        throw e;
      }
    },
    onSettled: () => invalidate(),
  });
}

export function useShoppingToggle() {
  const qc = useQueryClient();
  const h = useHid();
  return useMutation({
    mutationFn: async (item: ShoppingItem) => {
      try {
        return item.is_purchased ? await shoppingApi.markUnpurchased(item.id) : await shoppingApi.markPurchased(item.id);
      } catch (e) {
        if (e instanceof ApiError && e.isOffline && !item.is_purchased) {
          await enqueue({ type: 'shopping.purchase', itemId: item.id });
          return { ...item, is_purchased: true };
        }
        throw e;
      }
    },
    onMutate: async (item) => {
      const key = qk.shopping(h);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Paginated<ShoppingItem>>(key);
      if (prev) {
        qc.setQueryData(key, { ...prev, results: prev.results.map((i) =>
          (i.id === item.id ? { ...i, is_purchased: !i.is_purchased } : i)) });
      }
      return { prev };
    },
    onError: (_e, _i, ctx) => ctx?.prev && qc.setQueryData(qk.shopping(h), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

// ---------------------------------------------------------------- connectivity + sync

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
    []);
  return online;
}

export function useSyncStatus() {
  const [pending, setPending] = useState(pendingCount());
  const [lastFailures, setFailures] = useState<string[]>([]);
  const online = useOnline();
  const invalidate = useInvalidateInventory();

  useEffect(() => {
    loadQueue().then(() => setPending(pendingCount()));
    return subscribeQueue(setPending);
  }, []);

  useEffect(() => {
    if (online && pendingCount() > 0) {
      flushQueue().then((r) => {
        if (r.failures.length) setFailures(r.failures.map((f) => f.message));
        if (r.synced || r.failures.length) invalidate();
      });
    }
  }, [online, pending, invalidate]);

  return { online, pending, failures: lastFailures, clearFailures: () => setFailures([]) };
}
