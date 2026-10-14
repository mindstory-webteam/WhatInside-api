import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, font, radius, spacing, TAP } from '@/theme/tokens';

import { Txt } from './Txt';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  compact?: boolean;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnPrimary, border: colors.primary },
  secondary: { bg: colors.secondarySoft, fg: colors.primary, border: colors.secondarySoft },
  outline: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
};

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, testID, compact }: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={p.fg} /> : null}
          <Txt style={[styles.text, { color: p.fg }]}>{title}</Txt>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  compact: { minHeight: 40, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontWeight: font.semibold, fontSize: font.size.md },
});
