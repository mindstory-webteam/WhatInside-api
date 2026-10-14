import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { usePreferences, useUpdatePreferences } from '@/api/hooks';
import type { NotificationPreferences } from '@/api/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/States';
import { Txt } from '@/components/Txt';
import { ReminderToggles } from '@/features/reminders/ReminderToggles';
import { notificationPermission } from '@/notifications/local';
import { registerForPush } from '@/notifications/push';
import { colors, spacing } from '@/theme/tokens';

const PUSH_REASON: Record<string, string> = {
  simulator: 'Push notifications need a physical device.',
  expo_go: 'Push notifications need a development or store build (not Expo Go). Local reminders still work.',
  no_project_id: 'Push is not configured for this build (missing EAS project id).',
  permission: 'Notification permission was not granted.',
};

export default function ReminderSettings() {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const [permission, setPermission] = useState<string>('granted');
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    notificationPermission(false).then(setPermission).catch(() => undefined);
  }, []);

  if (prefs.isLoading) return <Screen back title={t('reminders.settings')}><LoadingState /></Screen>;
  if (!prefs.data) return <Screen back title={t('reminders.settings')}><ErrorState error={prefs.error} onRetry={() => prefs.refetch()} /></Screen>;
  const p = prefs.data;
  const change = (patch: Partial<NotificationPreferences>) => update.mutate(patch);

  const toggleMethod = async (m: 'local' | 'push') => {
    const has = p.delivery_methods.includes(m);
    const next = has ? p.delivery_methods.filter((x) => x !== m) : [...p.delivery_methods, m];
    if (!next.length) return;
    if (m === 'push' && !has) {
      const r = await registerForPush();
      if (!r.ok) {
        setPushMsg(PUSH_REASON[r.reason] ?? r.message ?? 'Push registration failed.');
        return;
      }
      setPushMsg(null);
    }
    change({ delivery_methods: next });
  };

  return (
    <Screen back title={t('reminders.settings')}>
      {permission !== 'granted' ? (
        <Card style={{ gap: spacing.sm, backgroundColor: colors.warningSoft }}>
          <Txt variant="muted">{t('reminders.permissionOff')}</Txt>
          <Button title={t('ocr.allow')} compact onPress={async () => setPermission(await notificationPermission(true))} />
        </Card>
      ) : null}
      <InlineError message={update.error ? errorMessage(update.error) : pushMsg} />
      <Card><ReminderToggles prefs={p} onChange={change} /></Card>
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="label">{t('reminders.time')}</Txt>
        <View style={styles.chips}>
          {[7, 8, 9, 10, 12, 18, 20].map((h) => (
            <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} selected={p.reminder_hour === h}
                  onPress={() => change({ reminder_hour: h })} />
          ))}
        </View>
      </Card>
      <Card>
        {(['local', 'push'] as const).map((m) => (
          <Pressable key={m} style={styles.row} accessibilityRole="switch"
                     accessibilityState={{ checked: p.delivery_methods.includes(m) }} onPress={() => toggleMethod(m)}>
            <Txt style={{ flex: 1 }}>{t(`reminders.${m}`)}</Txt>
            <Switch value={p.delivery_methods.includes(m)} onValueChange={() => toggleMethod(m)} trackColor={{ true: colors.secondary }} />
          </Pressable>
        ))}
      </Card>
      <Txt variant="caption">{t('reminders.deliveryNote')}</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
});
