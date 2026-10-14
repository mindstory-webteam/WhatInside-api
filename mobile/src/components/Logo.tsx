import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { BrandMark } from './BrandMark';
import { Txt } from './Txt';

/** App mark in a rounded tile, plus the two-tone wordmark. ``light`` is for dark backgrounds. */
export function Logo({ size = 40, wordmark = true, light = false }: { size?: number; wordmark?: boolean; light?: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel="WhatInside">
      <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 },
        light && { backgroundColor: colors.surface }]}>
        <BrandMark size={size * 0.74} fg={light ? colors.primary : '#FFFFFF'} check={light ? '#FFFFFF' : colors.primary} />
      </View>
      {wordmark ? (
        <Txt style={{ fontSize: size * 0.55, fontWeight: '800', color: light ? colors.textOnPrimary : colors.primary }}>
          What<Txt style={{ fontSize: size * 0.55, fontWeight: '800', color: light ? '#9BE08A' : colors.secondary }}>Inside</Txt>
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
