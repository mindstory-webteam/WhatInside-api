import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { DateFormat } from '@/api/types';
import { MONTH_NAMES, WEEKDAYS, monthGrid, parseTypedDate, quickPicks, shiftMonth } from '@/lib/calendar';
import { formatDate, parseISODate, todayIn } from '@/lib/dates';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { Button } from './Button';
import { Chip } from './Chip';
import { FieldChrome, inputBoxStyle, type FieldChromeProps } from './TextField';
import { Txt } from './Txt';
import { Icon, type IconName } from './Icon';

/**
 * Date field with an in-app calendar sheet. It doesn't use the native date picker,
 * so it looks the same in Expo Go, light and dark mode, Android and iOS. Values are
 * date-only ISO strings ("2027-04-30") — no timezone shifts.
 */
export function DateField({ value, onChange, format = 'DD/MM/YYYY', clearable = true, testID, maximumDate, ...chrome }:
  FieldChromeProps & {
    value: string | null | undefined;
    onChange: (iso: string | null) => void;
    format?: DateFormat;
    clearable?: boolean;
    testID?: string;
    maximumDate?: Date;
  }) {
  const [open, setOpen] = useState(false);
  const max = maximumDate ? todayIn(undefined, maximumDate) : undefined;

  return (
    <FieldChrome {...chrome}>
      <View style={styles.row}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={`${chrome.label}: ${value ? formatDate(value, format) : 'not set'}`}
          style={[...inputBoxStyle(chrome.error, chrome.uncertain), styles.field]}
          onPress={() => setOpen(true)}
        >
          <Txt style={!value ? { color: colors.textMuted } : undefined}>{value ? formatDate(value, format) : format}</Txt>
          <Icon name="calendar-month-outline" size={20} color={colors.primary} />
        </Pressable>
        {clearable && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${chrome.label}`} hitSlop={10}
                     onPress={() => onChange(null)} style={styles.clear}>
            <Icon name="close-circle-outline" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <CalendarSheet title={chrome.label} value={value ?? null} format={format} max={max}
                       onCancel={() => setOpen(false)}
                       onDone={(iso) => {
                         onChange(iso);
                         setOpen(false);
                       }} />
      ) : null}
    </FieldChrome>
  );
}

export function CalendarSheet({ title, value, format, max, onCancel, onDone }: {
  title: string; value: string | null; format: DateFormat; max?: string;
  onCancel: () => void; onDone: (iso: string) => void;
}) {
  const today = todayIn();
  const start = parseISODate(value ?? today)!;
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [selected, setSelected] = useState<string | null>(value);
  const [typed, setTyped] = useState(value ? formatDate(value, format) : '');
  const [typedError, setTypedError] = useState<string | null>(null);
  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
  const allowed = (iso: string) => !max || iso <= max;

  const choose = (iso: string) => {
    if (!allowed(iso)) return;
    setSelected(iso);
    setTyped(formatDate(iso, format));
    setTypedError(null);
    const p = parseISODate(iso)!;
    setView({ y: p.y, m: p.m });
  };

  const applyTyped = (text: string) => {
    setTyped(text);
    const iso = parseTypedDate(text, format);
    if (iso && allowed(iso)) {
      choose(iso);
    } else {
      setTypedError(text.trim().length >= 6 ? (iso ? 'This date is not allowed here' : `Use ${format}`) : null);
    }
  };

  const nav = (delta: number) => setView((v) => shiftMonth(v.y, v.m, delta));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="calendar-sheet">
          <Txt variant="heading">{title}</Txt>

          <TextInput
            value={typed}
            onChangeText={applyTyped}
            placeholder={`Type a date (${format})`}
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            style={[styles.typed, typedError ? { borderColor: colors.danger } : null]}
            accessibilityLabel="Type a date"
            testID="calendar-typed"
          />
          {typedError ? <Txt variant="caption" style={{ color: colors.danger }}>{typedError}</Txt> : null}

          <View style={styles.header}>
            <NavBtn icon="chevron-double-left" label="Previous year" onPress={() => nav(-12)} />
            <NavBtn icon="chevron-left" label="Previous month" onPress={() => nav(-1)} testID="calendar-prev" />
            <Txt variant="heading" style={styles.monthTitle} testID="calendar-month">
              {MONTH_NAMES[view.m - 1]} {view.y}
            </Txt>
            <NavBtn icon="chevron-right" label="Next month" onPress={() => nav(1)} testID="calendar-next" />
            <NavBtn icon="chevron-double-right" label="Next year" onPress={() => nav(12)} />
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((d) => <Txt key={d} variant="caption" style={styles.weekday}>{d}</Txt>)}
          </View>
          <View style={styles.grid}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={`e${i}`} style={styles.cell} />;
              const isSel = iso === selected;
              const isToday = iso === today;
              const ok = allowed(iso);
              return (
                <Pressable key={iso} style={styles.cell} disabled={!ok} onPress={() => choose(iso)}
                           accessibilityRole="button" accessibilityState={{ selected: isSel, disabled: !ok }}
                           accessibilityLabel={formatDate(iso, format)} testID={`day-${iso}`}>
                  <View style={[styles.day, isToday && styles.today, isSel && styles.selected]}>
                    <Txt style={[styles.dayText, !ok && styles.disabled, isSel && styles.selectedText]}>
                      {Number(iso.slice(8))}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.quick}>
            {quickPicks(today).filter((q) => allowed(q.iso)).map((q) => (
              <Chip key={q.label} label={q.label} selected={selected === q.iso} onPress={() => choose(q.iso)} />
            ))}
          </View>

          <Txt variant="muted" style={{ textAlign: 'center' }}>
            {selected ? `Selected: ${formatDate(selected, format)}` : 'Tap a day or type a date'}
          </Txt>
          <View style={styles.actions}>
            <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onCancel} />
            <Button title="Done" style={{ flex: 1 }} disabled={!selected} testID="calendar-done"
                    onPress={() => selected && onDone(selected)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NavBtn({ icon, label, onPress, testID }: {
  icon: IconName; label: string; onPress: () => void; testID?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.nav}
               testID={testID}>
      <Icon name={icon} size={24} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { padding: 4 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg,
    gap: spacing.sm, paddingBottom: spacing.xxl,
  },
  typed: {
    minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md,
    fontSize: 16.5, fontFamily: fonts.regular, color: colors.text, backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  nav: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, textAlign: 'center', color: colors.text },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.textMuted, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1.15, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayText: { color: colors.text, fontSize: 16 },
  today: { borderWidth: 1.5, borderColor: colors.secondary },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectedText: { color: colors.textOnPrimary, fontWeight: '700' },
  disabled: { color: colors.border },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
