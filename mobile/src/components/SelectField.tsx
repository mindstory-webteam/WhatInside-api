import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, TAP } from '@/theme/tokens';

import { FieldChrome, inputBoxStyle, type FieldChromeProps } from './TextField';
import { Txt } from './Txt';
import { Icon } from './Icon';

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function SelectField<T extends string>({ value, options, onChange, testID, ...chrome }:
  FieldChromeProps & { value: T | undefined; options: Option<T>[]; onChange: (v: T) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <FieldChrome {...chrome}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${chrome.label}: ${current?.label ?? ''}`}
        onPress={() => setOpen(true)}
        style={[...inputBoxStyle(chrome.error, chrome.uncertain), styles.row]}
      >
        <Txt>{current?.label ?? '—'}</Txt>
        <Icon name="chevron-down" size={22} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Txt variant="heading" style={styles.sheetTitle}>{chrome.label}</Txt>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  style={styles.option}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Txt>{item.label}</Txt>
                  {item.value === value ? <Icon name="check" size={20} color={colors.secondary} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </FieldChrome>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '70%', paddingBottom: spacing.xl,
  },
  sheetTitle: { padding: spacing.lg },
  option: {
    minHeight: TAP, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
});
