import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { ApiError } from '@/api/client';
import { inventoryApi, shoppingApi } from '@/api/endpoints';
import type { DiscardReason, ID } from '@/api/types';

/**
 * Offline action queue.
 *
 * Only actions that are safe to replay later are queued. Each action carries
 * an Idempotency-Key (its id), so a retry after a lost response is applied
 * once on the server. Quantity actions also carry the batch `version` seen when
 * the user acted; if the batch changed on another device meanwhile, the server
 * returns 409 and the action is dropped and reported instead of overwriting.
 */
export type QueuedAction =
  | { type: 'consume'; batchId: ID; quantity: string; version?: number }
  | { type: 'finish'; batchId: ID; version?: number }
  | { type: 'discard'; batchId: ID; quantity?: string; reason: DiscardReason; version?: number }
  | { type: 'shopping.create'; product_name: string; quantity: string }
  | { type: 'shopping.purchase'; itemId: ID }
  | { type: 'shopping.remove'; itemId: ID };

export interface QueueEntry {
  id: string;
  action: QueuedAction;
  createdAt: string;
  attempts: number;
}

export interface QueueFailure {
  entry: QueueEntry;
  message: string;
  conflict: boolean;
}

const KEY = 'wi.offline-queue.v1';
let entries: QueueEntry[] = [];
let loaded = false;
let flushing: Promise<FlushResult> | null = null;
const listeners = new Set<(n: number) => void>();

const emit = () => listeners.forEach((l) => l(entries.length));
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(entries));

export async function loadQueue(): Promise<QueueEntry[]> {
  if (!loaded) {
    try {
      entries = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    } catch {
      entries = [];
    }
    loaded = true;
    emit();
  }
  return entries;
}

export async function enqueue(action: QueuedAction): Promise<QueueEntry> {
  await loadQueue();
  const entry: QueueEntry = { id: Crypto.randomUUID(), action, createdAt: new Date().toISOString(), attempts: 0 };
  entries = [...entries, entry];
  await persist();
  emit();
  return entry;
}

export const pendingCount = () => entries.length;

export function subscribeQueue(listener: (n: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function execute(entry: QueueEntry): Promise<void> {
  const a = entry.action;
  const key = entry.id;
  switch (a.type) {
    case 'consume':
      await inventoryApi.consume(a.batchId, a.quantity, a.version, key);
      return;
    case 'finish':
      await inventoryApi.finish(a.batchId, a.version, key);
      return;
    case 'discard':
      await inventoryApi.discard(a.batchId, { quantity: a.quantity, reason: a.reason, version: a.version }, key);
      return;
    case 'shopping.create':
      await shoppingApi.create({ product_name: a.product_name, quantity: a.quantity }, key);
      return;
    case 'shopping.purchase':
      await shoppingApi.markPurchased(a.itemId);
      return;
    case 'shopping.remove':
      try {
        await shoppingApi.remove(a.itemId);
      } catch (e) {
        if (!(e instanceof ApiError && e.kind === 'not_found')) throw e; // already gone = success
      }
  }
}

export interface FlushResult {
  synced: number;
  failures: QueueFailure[];
  remaining: number;
}

/** Replay queued actions in order. Stops at the first network error (still offline). */
export function flushQueue(run: (e: QueueEntry) => Promise<void> = execute): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    await loadQueue();
    let synced = 0;
    const failures: QueueFailure[] = [];
    while (entries.length) {
      const entry = entries[0];
      try {
        await run(entry);
        synced += 1;
      } catch (e) {
        if (e instanceof ApiError && (e.isOffline || e.kind === 'server' || e.kind === 'auth')) {
          entry.attempts += 1;
          break; // retry later
        }
        failures.push({
          entry,
          message: e instanceof Error ? e.message : 'Failed',
          conflict: e instanceof ApiError && e.kind === 'conflict',
        });
      }
      entries = entries.slice(1);
    }
    await persist();
    emit();
    return { synced, failures, remaining: entries.length };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function __resetQueueForTests() {
  entries = [];
  loaded = false;
  flushing = null;
  await AsyncStorage.removeItem(KEY);
}
