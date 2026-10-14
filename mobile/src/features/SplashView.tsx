import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Txt } from '@/components/Txt';
import { colors, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';

/** Branded splash shown while the session is restored. */
export function SplashView() {
  const { t } = useTranslation();
  return (
    <View style={styles.root} accessibilityLabel="WhatInside is loading">
      <Logo size={64} wordmark={false} />
      <Txt variant="hero" style={{ fontSize: 40 }}>What<Txt variant="hero" style={{ color: colors.secondary, fontSize: 40 }}>Inside</Txt></Txt>
      <Txt variant="muted" style={styles.center}>{t('app.tagline')}</Txt>
      <View style={styles.art}>
        {(['fridge-outline', 'bottle-tonic-outline', 'cheese', 'carrot', 'food-apple-outline'] as const).map((i) => (
          <Icon key={i} name={i} size={34} color={colors.secondary} />
        ))}
      </View>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  center: { textAlign: 'center' },
  art: { flexDirection: 'row', gap: spacing.md, opacity: 0.85, marginVertical: spacing.xl },
});
