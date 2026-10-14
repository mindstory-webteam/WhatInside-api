import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { colors, font, fontFor } from '@/theme/tokens';

type Variant = 'hero' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'muted';

/**
 * App text. Any `fontWeight` in the style is turned into the matching Anek font file,
 * because Android ignores fontWeight for custom fonts (and iOS would fake-bold them).
 */
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const flat = StyleSheet.flatten([styles.base, styles[variant], style]) as TextStyle;
  const own = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontWeight, ...clean } = flat;
  // A bigger fontSize set on one Txt must not inherit the variant's smaller lineHeight —
  // otherwise tall glyphs (big numbers, Malayalam) get clipped.
  if (own.fontSize && !own.lineHeight) clean.lineHeight = Math.ceil(own.fontSize * 1.3);
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[clean, { fontFamily: clean.fontFamily ?? fontFor(fontWeight) }]} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text, fontSize: font.size.md },
  hero: { fontSize: font.size.hero, lineHeight: 42, fontWeight: font.extrabold, color: colors.primary, letterSpacing: -0.4 },
  title: { fontSize: font.size.xl, lineHeight: 30, fontWeight: font.bold, letterSpacing: -0.2 },
  heading: { fontSize: font.size.lg, lineHeight: 25, fontWeight: font.semibold },
  body: { fontSize: font.size.md, lineHeight: 23 },
  label: { fontSize: font.size.sm, lineHeight: 20, fontWeight: font.semibold, color: colors.text },
  caption: { fontSize: font.size.xs, lineHeight: 17, color: colors.textMuted },
  muted: { fontSize: font.size.sm, color: colors.textMuted, lineHeight: 20 },
});
