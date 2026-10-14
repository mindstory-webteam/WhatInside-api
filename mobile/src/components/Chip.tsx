import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { Txt } from './Txt';

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Txt variant="caption" style={[styles.text, selected && styles.selectedText]}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontSize: 13, fontWeight: '600', color: colors.text },
  selectedText: { color: colors.textOnPrimary },
});
