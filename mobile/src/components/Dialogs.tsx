import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import type { DiscardReason } from '@/api/types';
import { DISCARD_REASONS } from '@/lib/options';
import { colors, radius, spacing } from '@/theme/tokens';

import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { Txt } from './Txt';

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close dialog">
        <Pressable style={styles.sheet} onPress={() => undefined}>{children}</Pressable>
      </Pressable>
    </Modal>
  );
}

export function ConfirmDialog({ visible, title, message, confirmLabel, destructive, loading, onConfirm, onCancel }: {
  visible: boolean; title: string; message?: string; confirmLabel?: string; destructive?: boolean; loading?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onCancel}>
      <Txt variant="heading" accessibilityRole="header">{title}</Txt>
      {message ? <Txt variant="muted">{message}</Txt> : null}
      <View style={styles.actions}>
        <Button title={t('common.cancel')} variant="outline" style={styles.flex} onPress={onCancel} />
        <Button title={confirmLabel ?? t('common.confirm')} variant={destructive ? 'danger' : 'primary'} loading={loading}
                style={styles.flex} onPress={onConfirm} testID="confirm-dialog-ok" />
      </View>
    </Sheet>
  );
}

/** Ask for a quantity (and optionally a discard reason). Validates > 0 and ≤ max. */
export function QuantityDialog({ visible, title, unit, max, defaultValue, withReason, loading, onSubmit, onCancel }: {
  visible: boolean; title: string; unit: string; max?: number; defaultValue?: string; withReason?: boolean;
  loading?: boolean; onSubmit: (quantity: string, reason?: DiscardReason) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue ?? '1');
  const [reason, setReason] = useState<DiscardReason>('expired');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (visible) {
      setValue(defaultValue ?? '1');
      setError(undefined);
    }
  }, [visible, defaultValue]);

  const submit = () => {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return setError(t('validation.positive'));
    if (max !== undefined && n > max) return setError(`≤ ${max} ${unit}`);
    onSubmit(String(n), withReason ? reason : undefined);
  };

  return (
    <Sheet visible={visible} onClose={onCancel}>
      <Txt variant="heading" accessibilityRole="header">{title}</Txt>
      <TextField label={`${t('review.quantity')} (${unit})`} keyboardType="decimal-pad" value={value}
                 onChangeText={setValue} error={error} testID="quantity-input" autoFocus />
      {max !== undefined ? (
        <View style={styles.quick}>
          {[0.25, 0.5, 1].map((f) => (
            <Chip key={f} label={f === 1 ? `All (${max})` : `${f * 100}%`}
                  onPress={() => setValue(String(Math.round(max * f * 1000) / 1000))} />
          ))}
        </View>
      ) : null}
      {withReason ? (
        <>
          <Txt variant="label">{t('detail.reason')}</Txt>
          <View style={styles.quick}>
            {DISCARD_REASONS.map((r) => (
              <Chip key={r} label={t(`reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.actions}>
        <Button title={t('common.cancel')} variant="outline" style={styles.flex} onPress={onCancel} />
        <Button title={t('common.confirm')} loading={loading} style={styles.flex} onPress={submit} testID="quantity-ok" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
