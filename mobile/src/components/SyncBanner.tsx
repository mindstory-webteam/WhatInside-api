import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSyncStatus } from '@/api/hooks';
import { colors, spacing } from '@/theme/tokens';

import { Txt } from './Txt';
import { Icon } from './Icon';

/** Shows offline state, unsynced change count and sync conflicts. */
export function SyncBanner() {
  const { t } = useTranslation();
  const { online, pending, failures, clearFailures } = useSyncStatus();
  if (failures.length) {
    return (
      <Pressable onPress={clearFailures} accessibilityRole="alert" style={[styles.bar, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="sync-alert" size={16} color={colors.danger} />
        <Txt variant="caption" style={{ color: colors.danger, flex: 1 }}>{failures[0]}</Txt>
        <Icon name="close" size={16} color={colors.danger} />
      </Pressable>
    );
  }
  if (online && pending === 0) return null;
  return (
    <View accessibilityRole="alert" style={[styles.bar, { backgroundColor: online ? colors.infoSoft : colors.warningSoft }]}>
      <Icon name={online ? 'sync' : 'cloud-off-outline'} size={16}
                              color={online ? colors.info : colors.warning} />
      <Txt variant="caption" style={{ color: online ? colors.info : colors.warning }}>
        {!online ? t('common.offline') : ''}{!online && pending ? ' · ' : ''}
        {pending ? t('common.pendingSync', { count: pending }) : ''}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 6 },
});
