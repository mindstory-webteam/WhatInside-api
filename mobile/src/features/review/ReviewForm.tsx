import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Image, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { DateCandidate, DateFormat } from '@/api/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { DateField } from '@/components/DateField';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { formatDate } from '@/lib/dates';
import { CATEGORIES, STORAGE, STORAGE_ICON, UNITS } from '@/lib/options';
import { candidateChoices, type ReviewDraft, type ReviewField } from '@/scan/draft';
import { colors, radius, spacing } from '@/theme/tokens';
import { productFormSchema, type ProductForm, type ProductFormInput } from '@/validation/schemas';
import { Icon } from '@/components/Icon';

export interface ReviewFormProps {
  draft: ReviewDraft;
  dateFormat?: DateFormat;
  submitting?: boolean;
  serverError?: string | null;
  serverFieldErrors?: Partial<Record<ReviewField, string>>;
  onSubmit: (values: ProductForm) => void;
  onScanAgain?: () => void;
  onCancel: () => void;
  reminderSlot?: React.ReactNode;
}

const TARGET_LABEL = {
  expiry_date: 'review.asExpiry', best_before_date: 'review.asBestBefore', manufacturing_date: 'review.asMfg',
} as const;

const LABEL_KIND: Record<DateCandidate['label'], string> = {
  manufacturing: 'MFG', packed: 'PKD', expiry: 'EXP', use_by: 'USE BY', best_before: 'BEST BEFORE', unknown: '?',
};

export function ReviewForm({ draft, dateFormat, submitting, serverError, serverFieldErrors, onSubmit, onScanAgain,
  onCancel, reminderSlot }: ReviewFormProps) {
  const { t } = useTranslation();
  const [showRaw, setShowRaw] = useState(false);
  const [touched, setTouched] = useState<Set<ReviewField>>(new Set());
  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<ProductFormInput, unknown, ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: draft.values,
  });

  const [triedSave, setTriedSave] = useState(false);
  /** Human-readable reasons Save is blocked, shown next to the button (fields may be scrolled off-screen). */
  const FIELD_LABEL: Partial<Record<ReviewField, string>> = {
    name: 'review.productName', brand: 'review.brand', barcode: 'review.barcode', quantity: 'review.quantity',
    unit: 'review.unit', category: 'review.category', expiry_date: 'review.expiryDate', best_before_date: 'review.bestBefore',
    manufacturing_date: 'review.mfgDate', purchase_date: 'review.purchaseDate', batch_number: 'review.batchNumber',
    purchase_price: 'review.price', storage_location: 'review.storage',
  };
  const blockers = triedSave
    ? Object.entries(errors as Record<string, { message?: string } | undefined>)
      .filter(([, e]) => e?.message)
      .map(([k, e]) => `${t(FIELD_LABEL[k as ReviewField] ?? k)}: ${t(e!.message!)}`)
    : [];

  const markTouched = (f: ReviewField) => setTouched((s) => new Set(s).add(f));
  /** A field stays highlighted until the user edits/confirms it. */
  const isUncertain = (f: ReviewField) => draft.uncertain.includes(f) && !touched.has(f);
  const err = (f: ReviewField) => {
    const m = (errors as Record<string, { message?: string } | undefined>)[f]?.message ?? serverFieldErrors?.[f];
    return m ? t(m) : undefined;
  };
  const note = (f: ReviewField) => (isUncertain(f) ? draft.notes[f] || t('review.uncertain') : undefined);

  const candidates = draft.ocr?.date_candidates.filter((c) => candidateChoices(c).length) ?? [];
  const storage = watch('storage_location');

  const assign = (target: 'expiry_date' | 'manufacturing_date' | 'best_before_date', iso: string) => {
    setValue(target, iso, { shouldValidate: true });
    if (target !== 'manufacturing_date') setValue('expiry_unsure', false);
    markTouched(target);
  };

  const text = (name: 'name' | 'brand' | 'barcode' | 'batch_number' | 'quantity' | 'purchase_price', label: string,
    extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller control={control} name={name} render={({ field }) => (
      <TextField label={label} value={String(field.value ?? '')} testID={`field-${name}`}
                 onChangeText={(v) => {
                   field.onChange(v);
                   markTouched(name);
                 }}
                 onBlur={field.onBlur} error={err(name)} uncertain={isUncertain(name)} hint={note(name)} {...extra} />
    )} />
  );

  const date = (name: 'manufacturing_date' | 'expiry_date' | 'best_before_date' | 'purchase_date', label: string) => (
    <Controller control={control} name={name} render={({ field }) => (
      <DateField label={label} value={field.value as string | null} format={dateFormat} testID={`field-${name}`}
                 onChange={(v) => {
                   field.onChange(v);
                   markTouched(name);
                 }}
                 error={err(name)} uncertain={isUncertain(name)} hint={note(name)}
                 maximumDate={name === 'manufacturing_date' || name === 'purchase_date' ? new Date() : undefined} />
    )} />
  );

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.headRow}>
        {draft.values.image_url ? <Image source={{ uri: draft.values.image_url }} style={styles.image} /> : (
          <View style={[styles.image, styles.imagePh]}><Icon name="package-variant" size={30} color={colors.secondary} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Txt variant="heading" numberOfLines={2}>{watch('name') || t('review.title')}</Txt>
          <Txt variant="muted">{t('review.subtitle')}</Txt>
        </View>
      </View>

      {draft.ocr?.warnings.map((w) => (
        <View key={w} style={styles.warning} accessibilityRole="alert">
          <Icon name="alert-outline" size={18} color={colors.warning} />
          <Txt variant="muted" style={{ flex: 1, color: colors.warning }}>{w}</Txt>
        </View>
      ))}
      {draft.barcodeNote ? (
        <View style={styles.warning}>
          <Icon name="calendar-alert" size={18} color={colors.warning} />
          <Txt variant="muted" style={{ flex: 1, color: colors.warning }}>{draft.barcodeNote}</Txt>
        </View>
      ) : null}

      {candidates.length ? (
        <Card style={{ gap: spacing.sm }} testID="date-candidates">
          <Txt variant="label">{t('review.datesFound')}</Txt>
          {candidates.map((c, i) => {
            const choices = candidateChoices(c);
            if (!choices.length) return null;
            return (
              <View key={`${c.raw}-${i}`} style={styles.candidate}>
                <Txt variant="caption">
                  {LABEL_KIND[c.label]} · “{c.raw}” {c.note ? `— ${c.note}` : ''}
                </Txt>
                <View style={styles.chips}>
                  {choices.map((ch) => (
                    <Chip key={`${ch.target}-${ch.iso}`} testID={`use-${ch.target}-${ch.iso}`}
                          selected={watch(ch.target) === ch.iso}
                          label={`${t(TARGET_LABEL[ch.target])}: ${formatDate(ch.iso, dateFormat)}${
                            ch.monthEdge ? ` (${t(ch.monthEdge === 'end' ? 'review.endOfMonth' : 'review.startOfMonth')})` : ''}`}
                          onPress={() => assign(ch.target, ch.iso)} />
                  ))}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        {text('name', t('review.productName'), { autoCapitalize: 'words' })}
        {text('brand', t('review.brand'))}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>{text('quantity', t('review.quantity'), { keyboardType: 'decimal-pad' })}</View>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="unit" render={({ field }) => (
              <SelectField label={t('review.unit')} value={field.value} uncertain={isUncertain('unit')}
                           options={UNITS.map((u) => ({ value: u, label: u }))}
                           onChange={(v) => {
                             field.onChange(v);
                             markTouched('unit');
                           }} />
            )} />
          </View>
        </View>
        <Controller control={control} name="category" render={({ field }) => (
          <SelectField label={t('review.category')} value={field.value}
                       options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))} onChange={field.onChange} />
        )} />
        {text('barcode', t('review.barcode'), { keyboardType: 'number-pad' })}
      </Card>

      <Card>
        {date('expiry_date', t('review.expiryDate'))}
        {date('best_before_date', t('review.bestBefore'))}
        {date('manufacturing_date', t('review.mfgDate'))}
        <Controller control={control} name="expiry_unsure" render={({ field }) => (
          <Pressable style={styles.switchRow} accessibilityRole="switch" accessibilityState={{ checked: !!field.value }}
                     onPress={() => field.onChange(!field.value)} testID="expiry-unsure">
            <View style={{ flex: 1 }}>
              <Txt variant="label">{t('review.dateUnsure')}</Txt>
              <Txt variant="caption">{t('review.dateUnsureHelp')}</Txt>
            </View>
            <Switch value={!!field.value} onValueChange={field.onChange} trackColor={{ true: colors.secondary }} />
          </Pressable>
        )} />
        {date('purchase_date', t('review.purchaseDate'))}
        {text('batch_number', t('review.batchNumber'), { autoCapitalize: 'characters' })}
        {text('purchase_price', `${t('review.price')} (${t('common.optional')})`, { keyboardType: 'decimal-pad' })}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Txt variant="label">{t('review.storage')}</Txt>
        {STORAGE.map((loc) => (
          <Pressable key={loc} accessibilityRole="radio" accessibilityState={{ selected: storage === loc }}
                     style={[styles.storage, storage === loc && styles.storageOn]} testID={`storage-${loc}`}
                     onPress={() => setValue('storage_location', loc)}>
            <Icon name={STORAGE_ICON[loc] as never} size={24} color={colors.primary} />
            <Txt style={{ flex: 1 }}>{t(`storage.${loc}`)}</Txt>
            {storage === loc ? <Icon name="check-circle" size={22} color={colors.secondary} /> : null}
          </Pressable>
        ))}
      </Card>

      {reminderSlot}

      {draft.ocr?.raw_text ? (
        <Card>
          <Pressable accessibilityRole="button" onPress={() => setShowRaw((v) => !v)} style={styles.switchRow}>
            <Txt variant="label" style={{ flex: 1 }}>{t('ocr.rawText')}</Txt>
            <Icon name={showRaw ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
          </Pressable>
          {showRaw ? <Txt variant="muted" selectable style={styles.raw}>{draft.ocr.raw_text}</Txt> : null}
        </Card>
      ) : null}

      {blockers.length || serverError ? (
        <View style={styles.blocker} accessibilityRole="alert" testID="save-blockers">
          <Icon name="alert-circle-outline" size={20} color={colors.danger} />
          <View style={{ flex: 1, gap: 2 }}>
            {serverError ? <Txt variant="muted" style={styles.blockerText}>{serverError}</Txt> : null}
            {blockers.map((b) => <Txt key={b} variant="muted" style={styles.blockerText}>• {b}</Txt>)}
          </View>
        </View>
      ) : null}

      <View style={styles.row}>
        <Button title={t('review.save')} icon="content-save-outline" style={{ flex: 1 }} loading={submitting}
                onPress={handleSubmit(onSubmit, () => setTriedSave(true))} testID="review-save" />
        {onScanAgain ? <Button title={t('review.scanAgain')} variant="outline" style={{ flex: 1 }} onPress={onScanAgain} /> : null}
      </View>
      <Button title={t('common.cancel')} variant="ghost" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  image: { width: 64, height: 64, borderRadius: radius.md },
  imagePh: { backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  warning: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warningSoft, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  candidate: { gap: 6, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, marginBottom: spacing.sm },
  storage: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minHeight: 56 },
  storageOn: { borderColor: colors.secondary, backgroundColor: colors.secondarySoft },
  raw: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: spacing.sm },
  blocker: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md },
  blockerText: { color: colors.danger },
});
