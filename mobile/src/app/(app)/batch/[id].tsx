import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ApiError, errorMessage } from '@/api/client';
import { inventoryApi } from '@/api/endpoints';
import { useBatch, useBatchAction, useBatchHistory, useInvalidateInventory, type BatchAction } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog, QuantityDialog } from '@/components/Dialogs';
import { ProductThumb } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineError, LoadingState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Txt } from '@/components/Txt';
import { formatDate } from '@/lib/dates';
import { formatQty } from '@/lib/options';
import { colors, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';

type Dialog = null | 'consume' | 'discard' | 'restock' | 'delete' | 'finish';

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="muted">{label}</Txt>
      <Txt variant="label" style={tone ? { color: tone } : undefined}>{value}</Txt>
    </View>
  );
}

export default function BatchDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const batchId = Number(id);
  const batch = useBatch(batchId);
  const history = useBatchHistory(batchId);
  const action = useBatchAction(batch.data);
  const invalidate = useInvalidateInventory();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fmt = user?.date_format;

  const run = (a: BatchAction) => {
    setError(null);
    action.mutate(a, {
      onSuccess: (r) => {
        setDialog(null);
        setMessage(r.queued ? t('common.pendingSync', { count: 1 }) : null);
      },
      onError: (e) => {
        setDialog(null);
        if (e instanceof ApiError && e.kind === 'conflict') {
          batch.refetch();
          setError(t('detail.conflict'));
        } else setError(errorMessage(e));
      },
    });
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await inventoryApi.remove(batchId);
      await invalidate();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setDialog(null);
    } finally {
      setDeleting(false);
    }
  };

  if (batch.isLoading && !batch.data) return <Screen back title={t('detail.title')}><LoadingState /></Screen>;
  if (!batch.data) return <Screen back title={t('detail.title')}><ErrorState error={batch.error} onRetry={() => batch.refetch()} /></Screen>;

  const b = batch.data;
  const active = b.status === 'active';
  const expiryTone = b.expiry_status === 'expired' ? colors.danger : b.expiry_status === 'expiring_soon' ? colors.warning : undefined;

  return (
    <Screen back title={t('detail.title')} refreshing={batch.isRefetching} onRefresh={() => batch.refetch()}
            right={<Button title={t('common.edit')} variant="ghost" compact onPress={() => router.push(`/batch/edit/${b.id}`)} />}>
      <Card style={styles.head}>
        <ProductThumb batch={b} size={84} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="title" numberOfLines={2}>{b.product.name}</Txt>
          {b.product.brand ? <Txt variant="muted">{b.product.brand}</Txt> : null}
          <Txt variant="label">{formatQty(b.quantity)} {b.unit}</Txt>
          <StatusBadge status={b.expiry_status} days={b.days_until_expiry} batchStatus={b.status} />
        </View>
      </Card>
      {saved === '1' && active ? (
        <Card style={styles.saved} testID="saved-banner">
          <View style={styles.savedHead}>
            <Icon name="check-circle" size={22} color={colors.primary} />
            <Txt variant="label" style={{ flex: 1, color: colors.primary }}>{t('detail.savedNote')}</Txt>
          </View>
          <View style={styles.savedActions}>
            <Button title={t('tabs.inventory')} icon="format-list-bulleted" variant="outline" compact style={{ flex: 1 }}
                    onPress={() => router.navigate('/inventory')} />
            <Button title={t('detail.addAnother')} icon="plus" compact style={{ flex: 1 }}
                    onPress={() => router.navigate('/add')} />
          </View>
        </Card>
      ) : null}
      {message ? <Txt variant="muted" style={{ color: colors.info }}>{message}</Txt> : null}
      <InlineError message={error} />
      {!active ? (
        <Card style={styles.closed} testID="closed-note">
          <Icon name="information-outline" size={22} color={colors.textMuted} />
          <Txt style={{ flex: 1 }}>{t('detail.closedNote')}</Txt>
        </Card>
      ) : null}
      {b.needs_review && active ? (
        <Card style={styles.review}>
          <Icon name="calendar-question" size={22} color={colors.info} />
          <Txt style={{ flex: 1 }}>{t('status.unknown')}</Txt>
          <Button title={t('detail.confirmDate')} compact onPress={() => router.push(`/batch/edit/${b.id}`)} />
        </Card>
      ) : null}

      <Card>
        <Row label={t('review.category')} value={t(`categories.${b.product.category}`)} />
        <Row label={t('review.storage')} value={t(`storage.${b.storage_location}`)} />
        <Row label={t('review.mfgDate')} value={formatDate(b.manufacturing_date, fmt)} />
        <Row label={t('review.expiryDate')} value={formatDate(b.expiry_date, fmt)} tone={expiryTone} />
        {b.best_before_date ? <Row label={t('review.bestBefore')} value={formatDate(b.best_before_date, fmt)} /> : null}
        <Row label={t('review.batchNumber')} value={b.batch_number || '—'} />
        <Row label={t('review.purchaseDate')} value={formatDate(b.purchase_date, fmt)} />
        {b.purchase_price ? <Row label={t('review.price')} value={b.purchase_price} /> : null}
        <Row label={t('detail.quantityLeft')} value={`${formatQty(b.quantity)} / ${formatQty(b.initial_quantity)} ${b.unit}`} />
      </Card>

      {active ? (
        <View style={styles.actions}>
          <Button title={t('detail.consume')} icon="silverware-fork-knife" style={styles.action}
                  onPress={() => setDialog('consume')} testID="action-consume" />
          <Button title={t('detail.finish')} icon="check-circle-outline" variant="secondary" style={styles.action}
                  onPress={() => setDialog('finish')} testID="action-finish" />
          <Button title={t('detail.discard')} icon="delete-outline" variant="danger" style={styles.action}
                  onPress={() => setDialog('discard')} testID="action-discard" />
          <Button title={t('detail.restock')} icon="plus" variant="outline" style={styles.action}
                  onPress={() => setDialog('restock')} />
        </View>
      ) : (
        <Button title={t('detail.restock')} icon="refresh" variant="outline" onPress={() => setDialog('restock')} />
      )}
      <Button title={t('detail.addBatch')} icon="plus-box-multiple-outline" variant="ghost"
              onPress={() => router.push({ pathname: '/batch/new', params: { product: String(b.product.id) } })} />

      <Txt variant="heading">{t('detail.history')}</Txt>
      <Card style={{ gap: spacing.sm }}>
        {history.data?.results.map((e) => (
          <View key={e.id} style={styles.row}>
            <Txt variant="muted" style={{ flex: 1 }}>{e.event_type}{e.reason ? ` (${t(`reasons.${e.reason}`)})` : ''}
              {e.actor_name ? ` · ${e.actor_name}` : ''}</Txt>
            <Txt variant="label">{Number(e.quantity_change) > 0 ? '+' : ''}{formatQty(e.quantity_change)} {e.unit}</Txt>
          </View>
        )) ?? <LoadingState />}
      </Card>
      <Button title={t('common.delete')} icon="trash-can-outline" variant="danger" onPress={() => setDialog('delete')} />

      <QuantityDialog visible={dialog === 'consume'} title={t('detail.consumeTitle')} unit={b.unit} max={Number(b.quantity)}
                      loading={action.isPending} onCancel={() => setDialog(null)}
                      onSubmit={(q) => run({ kind: 'consume', quantity: q })} />
      <QuantityDialog visible={dialog === 'discard'} title={t('detail.discardTitle')} unit={b.unit} max={Number(b.quantity)}
                      defaultValue={formatQty(b.quantity)} withReason loading={action.isPending} onCancel={() => setDialog(null)}
                      onSubmit={(q, reason) => run({ kind: 'discard', quantity: q, reason: reason ?? 'other' })} />
      <QuantityDialog visible={dialog === 'restock'} title={t('detail.restockTitle')} unit={b.unit}
                      loading={action.isPending} onCancel={() => setDialog(null)}
                      onSubmit={(q) => run({ kind: 'restock', quantity: q })} />
      <ConfirmDialog visible={dialog === 'finish'} title={t('detail.finishTitle')} message={t('detail.finishBody')}
                     confirmLabel={t('detail.finish')} loading={action.isPending}
                     onCancel={() => setDialog(null)} onConfirm={() => run({ kind: 'finish' })} />
      <ConfirmDialog visible={dialog === 'delete'} title={t('common.delete')} message={t('detail.confirmDelete')} destructive
                     loading={deleting} onCancel={() => setDialog(null)} onConfirm={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  saved: { gap: spacing.sm, backgroundColor: colors.secondarySoft },
  savedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  savedActions: { flexDirection: 'row', gap: spacing.sm },
  closed: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.background },
  review: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.infoSoft },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36, gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: { flexBasis: '47%', flexGrow: 1 },
});
