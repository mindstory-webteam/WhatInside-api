import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { colors, spacing } from '@/theme/tokens';

import { Button } from './Button';
import { Txt } from './Txt';
import { Icon, type IconName } from './Icon';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Txt variant="muted">{label ?? t('common.loading')}</Txt>
    </View>
  );
}

export function EmptyState({ icon = 'basket-outline', title, body, action }: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}><Icon name={icon} size={40} color={colors.secondary} /></View>
      <Txt variant="heading" style={styles.text}>{title}</Txt>
      {body ? <Txt variant="muted" style={styles.text}>{body}</Txt> : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const offline = error instanceof ApiError && error.isOffline;
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.iconWrap, { backgroundColor: offline ? colors.warningSoft : colors.dangerSoft }]}>
        <Icon name={offline ? 'cloud-off-outline' : 'alert-circle-outline'} size={40}
                                color={offline ? colors.warning : colors.danger} />
      </View>
      <Txt variant="heading" style={styles.text}>{offline ? t('common.offline') : t('common.somethingWrong')}</Txt>
      <Txt variant="muted" style={styles.text}>{errorMessage(error)}</Txt>
      {onRetry ? <Button title={t('common.retry')} icon="refresh" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.inline} accessibilityRole="alert">
      <Icon name="alert-circle-outline" size={18} color={colors.danger} />
      <Txt variant="muted" style={{ color: colors.danger, flex: 1 }}>{message}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, minHeight: 240 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.secondarySoft, alignItems: 'center',
    justifyContent: 'center',
  },
  text: { textAlign: 'center' },
  inline: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.dangerSoft, borderRadius: 10,
    padding: spacing.md,
  },
});
