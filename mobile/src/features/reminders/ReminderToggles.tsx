import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import type { NotificationPreferences, ReminderOffset } from '@/api/types';
import { Txt } from '@/components/Txt';
import { colors, spacing } from '@/theme/tokens';

export const OFFSETS: ReminderOffset[] = [7, 3, 1, 0];

/** Toggle one reminder offset on/off, keeping the list sorted and unique (unit-tested). */
export function toggleOffset(current: ReminderOffset[], offset: ReminderOffset): ReminderOffset[] {
  const set = new Set(current);
  if (set.has(offset)) set.delete(offset);
  else set.add(offset);
  return OFFSETS.filter((o) => set.has(o));
}

export function ReminderToggles({ prefs, onChange, disabled }: {
  prefs: NotificationPreferences; onChange: (p: Partial<NotificationPreferences>) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View>
      <Row label={t('reminders.enabled')} value={prefs.enabled} disabled={disabled} testID="reminders-enabled"
           onToggle={() => onChange({ enabled: !prefs.enabled })} strong />
      {OFFSETS.map((o) => (
        <Row key={o} label={t(`reminders.d${o}`)} value={prefs.enabled && prefs.days_before_expiry.includes(o)}
             disabled={disabled || !prefs.enabled} testID={`offset-${o}`}
             onToggle={() => onChange({ days_before_expiry: toggleOffset(prefs.days_before_expiry, o) })} />
      ))}
    </View>
  );
}

function Row({ label, value, onToggle, disabled, strong, testID }: {
  label: string; value: boolean; onToggle: () => void; disabled?: boolean; strong?: boolean; testID?: string;
}) {
  return (
    <Pressable style={styles.row} onPress={disabled ? undefined : onToggle} accessibilityRole="switch"
               accessibilityState={{ checked: value, disabled }} accessibilityLabel={label} testID={testID}>
      <Txt variant={strong ? 'label' : 'body'} style={[{ flex: 1 }, disabled && { color: colors.textMuted }]}>{label}</Txt>
      <Switch value={value} onValueChange={onToggle} disabled={disabled} trackColor={{ true: colors.secondary }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
