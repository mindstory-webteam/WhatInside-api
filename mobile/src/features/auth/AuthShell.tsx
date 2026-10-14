import { router } from 'expo-router';
import type React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Txt } from '@/components/Txt';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Shared layout for sign-in, sign-up and reset: a deep-green header with the brand,
 * a title and a short line, and a white sheet that holds the form.
 */
export function AuthShell({ title, subtitle, icon, children, footer, onBack, step }: {
  title: string; subtitle?: string; icon?: IconName; children: React.ReactNode; footer?: React.ReactNode;
  onBack?: () => void; step?: { current: number; total: number };
}) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/welcome')));
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={[styles.blob, styles.blobA]} />
        <View style={[styles.blob, styles.blobB]} />
        <View style={styles.topRow}>
          <Pressable onPress={back} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="chevron-left" size={26} color={colors.textOnPrimary} />
          </Pressable>
          <Logo size={30} light />
          <View style={styles.back} />
        </View>
        <View style={styles.heading}>
          {icon ? <View style={styles.iconTile}><Icon name={icon} size={26} color={colors.primary} /></View> : null}
          <Txt style={styles.title} accessibilityRole="header">{title}</Txt>
          {subtitle ? <Txt style={styles.subtitle}>{subtitle}</Txt> : null}
          {step ? (
            <View style={styles.steps} accessibilityLabel={`Step ${step.current} of ${step.total}`}>
              {Array.from({ length: step.total }).map((_, i) => (
                <View key={i} style={[styles.stepDot, i < step.current && styles.stepOn]} />
              ))}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** "New here? Create an account" style line with a tappable part. */
export function AuthSwitch({ text, action, onPress, testID }: {
  text: string; action: string; onPress: () => void; testID?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={styles.switch} testID={testID}>
      <Txt variant="muted">{text} </Txt>
      <Txt variant="label" style={{ color: colors.primary }}>{action}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  header: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 18, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: colors.secondary },
  blobA: { width: 220, height: 220, right: -80, top: -90, opacity: 0.22 },
  blobB: { width: 140, height: 140, left: -60, bottom: -50, opacity: 0.14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)' },
  heading: { marginTop: spacing.xl, gap: 6 },
  iconTile: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: colors.secondarySoft, alignItems: 'center',
    justifyContent: 'center', marginBottom: spacing.sm,
  },
  title: { color: colors.textOnPrimary, fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: '#D3EBD9', fontSize: 15.5, lineHeight: 22 },
  steps: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  stepDot: { width: 26, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  stepOn: { backgroundColor: '#9BE08A' },
  sheet: {
    flex: 1, backgroundColor: colors.background, borderTopLeftRadius: radius.xl + 6, borderTopRightRadius: radius.xl + 6,
    marginTop: -22,
  },
  sheetContent: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  footer: { marginTop: spacing.md, alignItems: 'center' },
  switch: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', paddingVertical: spacing.sm },
});
