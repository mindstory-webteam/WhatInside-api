import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import type { Batch, NotificationPreferences } from '@/api/types';
import { ReminderToggles, toggleOffset } from '@/features/reminders/ReminderToggles';
import { planLocalReminders, syncLocalReminders } from '@/notifications/local';

const prefs: NotificationPreferences = { enabled: true, days_before_expiry: [7, 3, 1, 0], delivery_methods: ['local'], reminder_hour: 9 };

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 1, product: { id: 1, name: 'Milk', brand: '', barcode: '', category: 'dairy', default_unit: 'l', image: null, image_url: '' },
  storage_location: 'refrigerator', quantity: '1', initial_quantity: '1', unit: 'l', purchase_date: null, manufacturing_date: null,
  expiry_date: '2026-10-20', best_before_date: null, effective_expiry: '2026-10-20', expiry_confirmed: true, batch_number: '',
  purchase_price: null, unit_price: null, status: 'active', notes: '', version: 1, expiry_status: 'fresh', days_until_expiry: 8,
  needs_review: false, created_at: '', updated_at: '', ...over,
});

const now = new Date(2026, 9, 12, 12, 0); // 12 Oct 2026, noon local

describe('local reminder planning', () => {
  it('plans one reminder per enabled offset with deterministic ids, skipping the past', async () => {
    const plan = planLocalReminders([batch()], prefs, now);
    expect(plan.map((p) => p.identifier)).toEqual([
      'wi-expiry-1-7-2026-10-20', 'wi-expiry-1-3-2026-10-20', 'wi-expiry-1-1-2026-10-20', 'wi-expiry-1-0-2026-10-20',
    ]);
    expect(plan[0].date.getHours()).toBe(9);
    const soon = planLocalReminders([batch({ effective_expiry: '2026-10-14', expiry_date: '2026-10-14' })], prefs, now);
    expect(soon.map((p) => p.identifier)).toEqual(['wi-expiry-1-1-2026-10-14', 'wi-expiry-1-0-2026-10-14']);
  });

  it('ignores unconfirmed, closed and disabled cases', async () => {
    expect(planLocalReminders([batch({ expiry_confirmed: false })], prefs, now)).toEqual([]);
    expect(planLocalReminders([batch({ status: 'finished' })], prefs, now)).toEqual([]);
    expect(planLocalReminders([batch()], { ...prefs, enabled: false }, now)).toEqual([]);
    expect(planLocalReminders([batch()], { ...prefs, delivery_methods: ['push'] }, now)).toEqual([]);
  });

  it('does not duplicate already-scheduled reminders and cancels stale ones', async () => {
    jest.useFakeTimers({ now });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'wi-expiry-1-7-2026-10-20' }, { identifier: 'wi-expiry-1-7-2026-10-18' }, { identifier: 'other-app-thing' },
    ]);
    const r = await syncLocalReminders([batch()], prefs);
    expect(r).toEqual({ scheduled: 3, cancelled: 1, permitted: true });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('wi-expiry-1-7-2026-10-18');
    jest.useRealTimers();
  });

  it('skips scheduling when permission is not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: false });
    expect(await syncLocalReminders([batch()], prefs)).toMatchObject({ permitted: false });
  });
});

describe('reminder preferences', () => {
  it('toggles offsets in canonical order', async () => {
    expect(toggleOffset([7, 1], 3)).toEqual([7, 3, 1]);
    expect(toggleOffset([7, 3, 1, 0], 7)).toEqual([3, 1, 0]);
  });

  it('renders toggles and reports changes', async () => {
    const onChange = jest.fn();
    await render(<ReminderToggles prefs={{ ...prefs, days_before_expiry: [7, 1] }} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('offset-3'));
    expect(onChange).toHaveBeenCalledWith({ days_before_expiry: [7, 3, 1] });
    await fireEvent.press(screen.getByTestId('reminders-enabled'));
    expect(onChange).toHaveBeenCalledWith({ enabled: false });
  });
});
