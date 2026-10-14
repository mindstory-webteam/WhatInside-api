import React, { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius, spacing, TAP } from '@/theme/tokens';

import { Txt } from './Txt';
import { Icon } from './Icon';

export interface FieldChromeProps {
  label: string;
  error?: string;
  hint?: string;
  uncertain?: boolean;
  required?: boolean;
  confirmed?: boolean;
}

/** Label + error/hint wrapper shared by every input. Uncertain fields are amber. */
export function FieldChrome({ label, error, hint, uncertain, required, children }:
  FieldChromeProps & { children: React.ReactNode }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Txt variant="label">{label}{required ? ' *' : ''}</Txt>
        {uncertain ? (
          <View style={styles.flag} accessibilityLabel="Needs checking">
            <Icon name="alert-circle-outline" size={14} color={colors.warning} />
            <Txt variant="caption" style={{ color: colors.warning }}>Check</Txt>
          </View>
        ) : null}
      </View>
      {children}
      {error ? <Txt variant="caption" style={styles.error} accessibilityLiveRegion="polite">{error}</Txt>
        : hint ? <Txt variant="caption" style={uncertain ? { color: colors.warning } : undefined}>{hint}</Txt> : null}
    </View>
  );
}

export const inputBoxStyle = (error?: string, uncertain?: boolean) => [
  styles.input,
  uncertain && styles.uncertain,
  error && styles.errorBorder,
];

export const TextField = forwardRef<TextInput, TextInputProps & FieldChromeProps>(function TextField(
  { label, error, hint, uncertain, required, style, ...rest }, ref) {
  return (
    <FieldChrome label={label} error={error} hint={hint} uncertain={uncertain} required={required}>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        maxFontSizeMultiplier={1.6}
        {...rest}
        style={[...inputBoxStyle(error, uncertain), styles.inputFont, style]}
      />
    </FieldChrome>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  input: {
    minHeight: TAP, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, fontSize: 16, color: colors.text,
  },
  inputFont: { fontFamily: fonts.regular, fontSize: 16.5 },
  uncertain: { borderColor: colors.warningStrong, backgroundColor: colors.warningSoft },
  errorBorder: { borderColor: colors.danger },
  error: { color: colors.danger },
});
