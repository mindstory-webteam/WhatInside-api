import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { inventoryApi, notificationApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { addDays, todayIn } from '@/lib/dates';

import { syncLocalReminders } from './local';
import { registerForPush } from './push';

/**
 * Keeps this phone's scheduled local reminders in line with server data
 * (on launch, when inventory changes, and when the app returns to foreground),
 * and registers for push if the user chose push delivery.
 */
export function useReminderSync() {
  const { household } = useAuth();
  const prefs = useQuery({ queryKey: qk.preferences, queryFn: notificationApi.preferences });
  const today = todayIn(household?.timezone);
  const upcoming = useQuery({
    queryKey: ['reminder-batches', household?.id, today],
    queryFn: () => inventoryApi.list({ status: 'active', needs_review: false, expiry_from: today,
      expiry_to: addDays(today, 30), ordering: 'effective_expiry', page_size: 100 }),
    enabled: !!household,
  });
  const pushTried = useRef(false);

  useEffect(() => {
    if (prefs.data && upcoming.data) {
      syncLocalReminders(upcoming.data.results, prefs.data).catch(() => undefined);
    }
  }, [prefs.data, upcoming.data]);

  useEffect(() => {
    if (prefs.data?.delivery_methods.includes('push') && !pushTried.current) {
      pushTried.current = true;
      registerForPush().catch(() => undefined);
    }
  }, [prefs.data]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') upcoming.refetch();
    });
    return () => sub.remove();
  }, [upcoming]);
}
