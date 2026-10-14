import { router } from 'expo-router';
import React from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, TAP } from '@/theme/tokens';

import { SyncBanner } from './SyncBanner';
import { Txt } from './Txt';
import { Icon } from './Icon';

export function Screen({ children, scroll = true, title, back, right, refreshing, onRefresh, contentStyle, edges,
  background = colors.background, banner = true }: {
  children: React.ReactNode;
  scroll?: boolean;
  title?: string;
  back?: boolean;
  right?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  background?: string;
  banner?: boolean;
}) {
  const header = title || back ? (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}
                   onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Icon name="chevron-left" size={28} color={colors.text} />
        </Pressable>
      ) : <View style={styles.back} />}
      <Txt variant="heading" style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Txt>
      <View style={styles.right}>{right}</View>
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={edges ?? ['top', 'left', 'right']}>
      {header}
      {banner ? <SyncBanner /> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh}
                                                          tintColor={colors.primary} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, minHeight: 52 },
  back: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  right: { minWidth: TAP, alignItems: 'flex-end', paddingRight: spacing.sm },
});
