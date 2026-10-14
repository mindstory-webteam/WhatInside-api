import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { BatchStatus, ExpiryStatus } from '@/api/types';
import { colors, radius } from '@/theme/tokens';

import { Txt } from './Txt';
import { Icon, type IconName } from './Icon';

const STYLE: Record<ExpiryStatus, { bg: string; fg: string; icon: IconName }> = {
  fresh: { bg: colors.secondarySoft, fg: colors.primary, icon: 'check-circle-outline' },
  expiring_soon: { bg: colors.warningSoft, fg: colors.warning, icon: 'clock-alert-outline' },
  expired: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-octagon-outline' },
  unknown: { bg: colors.infoSoft, fg: colors.info, icon: 'calendar-question' },
};

export function expiryLabel(t: TFunction, status: ExpiryStatus, days: number | null): string {
  if (status === 'unknown' || days === null) return t('status.unknown');
  if (days === 0) return t('status.expiresToday');
  if (days < 0) return t('status.expiredAgo', { count: -days });
  return t('status.expiresIn', { count: days });
}

const CLOSED = { bg: colors.surfaceMuted, fg: colors.textMuted };

/** Expiry badge. Finished/discarded batches show that state instead of a countdown. */
export function StatusBadge({ status, days, batchStatus = 'active' }:
  { status: ExpiryStatus; days: number | null; batchStatus?: BatchStatus }) {
  const { t } = useTranslation();
  const closed = batchStatus !== 'active';
  const s = closed
    ? { ...CLOSED, icon: batchStatus === 'finished' ? ('check-all' as const) : ('delete-outline' as const) }
    : STYLE[status];
  const label = closed ? t(`status.${batchStatus}`) : expiryLabel(t, status, days);
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]} accessibilityLabel={label} testID="status-badge">
      <Icon name={s.icon} size={14} color={s.fg} />
      <Txt variant="caption" style={{ color: s.fg, fontWeight: '600' }}>{label}</Txt>
    </View>
  );
}

export const statusColor = (s: ExpiryStatus) => STYLE[s].fg;

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
