import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Batch, NotificationPreferences } from '@/api/types';
import { addDays, parseISODate } from '@/lib/dates';

export const CHANNEL_ID = 'expiry-reminders';
const PREFIX = 'wi-expiry-';
const MAX_SCHEDULED = 60; // iOS keeps at most 64 pending local notifications per app

export interface PlannedReminder {
  identifier: string;
  date: Date;
  title: string;
  body: string;
  batchId: number;
}

/**
 * Plan local reminders for confirmed, active batches. The identifier is
 * deterministic (batch + offset + expiry date), so re-planning never produces
 * duplicates and a changed date produces a new identifier (old one cancelled).
 */
export function planLocalReminders(batches: Batch[], prefs: NotificationPreferences, now: Date = new Date()):
  PlannedReminder[] {
  if (!prefs.enabled || !prefs.delivery_methods.includes('local')) return [];
  const plans: PlannedReminder[] = [];
  for (const b of batches) {
    const expiry = b.effective_expiry;
    if (b.status !== 'active' || !b.expiry_confirmed || !expiry || Number(b.quantity) <= 0) continue;
    for (const days of prefs.days_before_expiry) {
      const p = parseISODate(addDays(expiry, -days));
      if (!p) continue;
      // Device-local wall-clock time on the reminder day.
      const date = new Date(p.y, p.m - 1, p.d, prefs.reminder_hour, 0, 0);
      if (date.getTime() <= now.getTime()) continue;
      const name = b.product.name;
      plans.push({
        identifier: `${PREFIX}${b.id}-${days}-${expiry}`,
        date,
        batchId: b.id,
        title: days === 0 ? `${name} expires today` : days === 1 ? `${name} expires tomorrow`
          : `${name} is about to expire`,
        body: days === 0 ? `Use or check your ${name} today.` : `Your ${name} will expire in ${days} days.`,
      });
    }
  }
  plans.sort((a, b) => a.date.getTime() - b.date.getTime());
  const seen = new Set<string>();
  return plans.filter((p) => (seen.has(p.identifier) ? false : (seen.add(p.identifier), true))).slice(0, MAX_SCHEDULED);
}

export async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Expiry reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function notificationPermission(request = false): Promise<'granted' | 'denied' | 'undetermined'> {
  const current = await Notifications.getPermissionsAsync();
  const ok = (r: Notifications.NotificationPermissionsStatus) =>
    r.granted || r.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (ok(current)) return 'granted';
  if (!request || !current.canAskAgain) return current.canAskAgain ? 'undetermined' : 'denied';
  await ensureAndroidChannel(); // Android 13+: channel must exist before the prompt shows
  const next = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  return ok(next) ? 'granted' : 'denied';
}

/** Reconcile the OS schedule with the plan: cancel stale, add missing. */
export async function syncLocalReminders(batches: Batch[], prefs: NotificationPreferences) {
  if ((await notificationPermission(false)) !== 'granted') return { scheduled: 0, cancelled: 0, permitted: false };
  await ensureAndroidChannel();
  const plan = planLocalReminders(batches, prefs);
  const wanted = new Map(plan.map((p) => [p.identifier, p]));
  const existing = (await Notifications.getAllScheduledNotificationsAsync())
    .filter((n) => n.identifier.startsWith(PREFIX));
  let cancelled = 0;
  for (const n of existing) {
    if (!wanted.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      cancelled += 1;
    } else {
      wanted.delete(n.identifier); // already scheduled — don't duplicate
    }
  }
  for (const p of wanted.values()) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.identifier,
      content: { title: p.title, body: p.body, data: { batchId: p.batchId }, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.date, channelId: CHANNEL_ID },
    });
  }
  return { scheduled: wanted.size, cancelled, permitted: true };
}

export async function cancelAllLocalReminders() {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.identifier.startsWith(PREFIX))
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}
