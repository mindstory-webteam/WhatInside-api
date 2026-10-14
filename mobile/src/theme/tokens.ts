/** WhatInside design system tokens. */
export const colors = {
  primary: '#1B5E3B', // deep forest green
  primaryDark: '#123F28',
  primaryPressed: '#164E31',
  secondary: '#3FA34D', // fresh leaf green
  secondarySoft: '#DDF2E1',
  background: '#F4FAF5', // very light green
  surface: '#FFFFFF',
  surfaceMuted: '#EEF6F0',
  border: '#DCE8DF',
  text: '#13241A',
  textMuted: '#5B6E62',
  textOnPrimary: '#FFFFFF',
  warning: '#B26A00', // amber text (AA on white)
  warningSoft: '#FFF3D6',
  warningStrong: '#F5A524',
  danger: '#C62828',
  dangerSoft: '#FDE7E7',
  info: '#1F6FB2',
  infoSoft: '#E3F0FB',
  overlay: 'rgba(10, 30, 18, 0.55)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/**
 * Typeface: Anek Malayalam (Ek Type, SIL OFL). One family covers both English and
 * Malayalam, so mixed text like "Milma പാൽ 500 ml" renders in a single consistent style.
 * Custom fonts need one family name per weight — use `fontFor()` instead of fontWeight.
 */
export const fonts = {
  regular: 'AnekMalayalam_400Regular',
  medium: 'AnekMalayalam_500Medium',
  semibold: 'AnekMalayalam_600SemiBold',
  bold: 'AnekMalayalam_700Bold',
  extrabold: 'AnekMalayalam_800ExtraBold',
} as const;

const WEIGHT_TO_FONT: Record<string, string> = {
  '100': fonts.regular, '200': fonts.regular, '300': fonts.regular, '400': fonts.regular, normal: fonts.regular,
  '500': fonts.medium, '600': fonts.semibold, '700': fonts.bold, bold: fonts.bold, '800': fonts.extrabold,
  '900': fonts.extrabold,
};

export const fontFor = (weight?: string | number | null): string => WEIGHT_TO_FONT[String(weight ?? '400')] ?? fonts.regular;

export const font = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  size: { xs: 12.5, sm: 14.5, md: 16.5, lg: 19, xl: 24, xxl: 30, hero: 36 },
};

export const shadow = {
  card: {
    shadowColor: '#0B2A17',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

/** Minimum tap target (WCAG / platform guidelines). */
export const TAP = 48;
