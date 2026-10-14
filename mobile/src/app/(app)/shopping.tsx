import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { productApi, shoppingApi } from '@/api/endpoints';
import { useInvalidateInventory, useShopping, useShoppingToggle } from '@/api/hooks';
import type { ShoppingItem, StorageLocation } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { DateField } from '@/components/DateField';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/States';
import { TextField } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { enqueue } from '@/offline/queue';
import { useDebounced } from '@/lib/useDebounced';
import { formatQty, STORAGE } from '@/lib/options';
import { colors, radius, spacing, TAP } from '@/theme/tokens';
import { shoppingItemSchema } from '@/validation/schemas';
import { Icon } from '@/components/Icon';

function ToInventorySheet({ item, onClose }: { item: ShoppingItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const invalidate = useInvalidateInventory();
  const [storage, setStorage] = useState<StorageLocation>('refrigerator');
  const [expiry, setExpiry] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => Crypto.randomUUID());

  const save = async () => {
    if (!item) return;
    if (!expiry && !unknown) return setError(t('review.expiryRequired'));
    setBusy(true);
    setError(null);
    try {
      await shoppingApi.addToInventory(item.id, { storage_location: storage, expiry_date: expiry, expiry_unknown: unknown }, key);
      await invalidate();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Txt variant="heading">{t('shopping.toInventory')}: {item?.product_name}</Txt>
          <Txt variant="label">{t('review.storage')}</Txt>
          <View style={styles.chips}>
            {STORAGE.map((s) => <Chip key={s} label={t(`storage.${s}`)} selected={storage === s} onPress={() => setStorage(s)} />)}
          </View>
          <DateField label={t('shopping.expiryQuestion')} value={expiry} format={user?.date_format}
                     onChange={(v) => {
                       setExpiry(v);
                       if (v) setUnknown(false);
                     }} uncertain={!expiry && !unknown} />
          <Chip label={t('shopping.unknownDate')} selected={unknown} onPress={() => {
            setUnknown(!unknown);
            if (!unknown) setExpiry(null);
          }} />
          <InlineError message={error} />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button title={t('common.cancel')} variant="outline" style={{ flex: 1 }} onPress={onClose} />
            <Button title={t('common.save')} style={{ flex: 1 }} loading={busy} onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function Shopping() {
  const { t } = useTranslation();
  const list = useShopping();
  const toggle = useShoppingToggle();
  const invalidate = useInvalidateInventory();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [convert, setConvert] = useState<ShoppingItem | null>(null);
  const q = useDebounced(name, 250);
  const suggestions = useQuery({ queryKey: ['product-search', q], queryFn: () => productApi.search(q), enabled: q.trim().length >= 2 });

  const add = async (productName = name, productId?: number) => {
    const parsed = shoppingItemSchema.safeParse({ product_name: productName, quantity: qty });
    if (!parsed.success) return setError(t(parsed.error.issues[0].message));
    setAdding(true);
    setError(null);
    try {
      await shoppingApi.create({ product_name: parsed.data.product_name, quantity: parsed.data.quantity, product: productId ?? null });
    } catch (e) {
      if (e instanceof ApiError && e.isOffline) await enqueue({ type: 'shopping.create', product_name: parsed.data.product_name, quantity: parsed.data.quantity });
      else setError(errorMessage(e));
    } finally {
      setAdding(false);
    }
    setName('');
    setQty('1');
    invalidate();
  };

  const remove = async (item: ShoppingItem) => {
    try {
      await shoppingApi.remove(item.id);
    } catch (e) {
      if (e instanceof ApiError && e.isOffline) await enqueue({ type: 'shopping.remove', itemId: item.id });
      else setError(errorMessage(e));
    }
    invalidate();
  };

  const items = list.data?.results ?? [];
  const open = items.filter((i) => !i.is_purchased);
  const done = items.filter((i) => i.is_purchased);

  const renderItem = (item: ShoppingItem) => (
    <Card key={item.id} style={styles.item} testID={`shopping-${item.id}`}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.is_purchased }}
                 accessibilityLabel={item.product_name} style={styles.check} onPress={() => toggle.mutate(item)}>
        <Icon name={item.is_purchased ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                                size={28} color={item.is_purchased ? colors.secondary : colors.textMuted} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Txt style={item.is_purchased ? styles.struck : undefined}>{item.product_name}</Txt>
        <Txt variant="caption">{formatQty(item.quantity)} {item.unit}</Txt>
        {item.in_inventory ? (
          <Txt variant="caption" style={{ color: colors.info }}>
            {t('shopping.inStock', { quantity: formatQty(item.in_inventory.quantity), unit: item.in_inventory.unit })}
          </Txt>
        ) : null}
      </View>
      {item.is_purchased && !item.added_to_inventory ? (
        <Button title={t('shopping.toInventory')} compact variant="secondary" onPress={() => setConvert(item)} />
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${item.product_name}`}
                 style={styles.check} onPress={() => remove(item)}>
        <Icon name="close" size={20} color={colors.textMuted} />
      </Pressable>
    </Card>
  );

  return (
    <Screen back title={t('shopping.title')} refreshing={list.isRefetching} onRefresh={() => list.refetch()}>
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.addRow}>
          <View style={{ flex: 3 }}>
            <TextField label={t('shopping.add')} placeholder={t('shopping.placeholder')} value={name} onChangeText={setName}
                       testID="shopping-name" onSubmitEditing={() => add()} returnKeyType="done" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('review.quantity')} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          </View>
        </View>
        {suggestions.data?.results.length ? (
          <View style={styles.chips}>
            {suggestions.data.results.slice(0, 5).map((p) => (
              <Chip key={p.id} label={`${p.name}${Number(p.active_quantity) > 0 ? ` · ${formatQty(p.active_quantity)} ${p.default_unit}` : ''}`}
                    onPress={() => add(p.name, p.id)} />
            ))}
          </View>
        ) : null}
        <InlineError message={error} />
        <Button title={t('shopping.add')} icon="plus" loading={adding} onPress={() => add()} testID="shopping-add" />
      </Card>

      {list.isLoading && !list.data ? <LoadingState /> : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="cart-outline" title={t('shopping.empty')} body={t('shopping.emptyBody')} />
      ) : (
        <>
          {open.map(renderItem)}
          {done.length ? (
            <>
              <View style={styles.doneHead}>
                <Txt variant="label">{t('shopping.purchased')} ({done.length})</Txt>
                <Button title={t('shopping.clearPurchased')} variant="ghost" compact onPress={async () => {
                  await shoppingApi.clearPurchased().catch((e) => setError(errorMessage(e)));
                  invalidate();
                }} />
              </View>
              {done.map(renderItem)}
            </>
          ) : null}
        </>
      )}
      <ToInventorySheet item={convert} onClose={() => setConvert(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  check: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  doneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
});
