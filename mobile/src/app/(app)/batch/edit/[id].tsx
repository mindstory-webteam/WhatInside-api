import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError, errorMessage } from '@/api/client';
import { inventoryApi, productApi } from '@/api/endpoints';
import { useBatch, useInvalidateInventory } from '@/api/hooks';
import type { Category, Unit } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { ReviewForm } from '@/features/review/ReviewForm';
import { draftFromBatch, toBatchUpdate } from '@/scan/draft';
import type { ProductForm } from '@/validation/schemas';

export default function EditBatch() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const batch = useBatch(Number(id));
  const invalidate = useInvalidateInventory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useMemo(() => (batch.data ? draftFromBatch(batch.data) : null), [batch.data?.id]); // eslint-disable-line

  if (!draft) {
    return <Screen back title={t('common.edit')}>{batch.error ? <ErrorState error={batch.error} /> : <LoadingState />}</Screen>;
  }
  const b = batch.data!;

  const submit = async (v: ProductForm) => {
    setBusy(true);
    setError(null);
    try {
      const productChanges = {
        ...(v.name !== b.product.name ? { name: v.name } : {}),
        ...(v.brand !== b.product.brand ? { brand: v.brand } : {}),
        ...(v.category !== b.product.category ? { category: v.category as Category } : {}),
        ...(v.barcode !== b.product.barcode ? { barcode: v.barcode } : {}),
        ...(v.unit !== b.product.default_unit ? { default_unit: v.unit as Unit } : {}),
      };
      if (Object.keys(productChanges).length) await productApi.update(b.product.id, productChanges);
      await inventoryApi.update(b.id, toBatchUpdate(v, b.version));
      await invalidate();
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'conflict') {
        await batch.refetch();
        setError(t('detail.conflict'));
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('common.edit')}>
      <ReviewForm draft={draft} dateFormat={user?.date_format} submitting={busy} serverError={error} onSubmit={submit}
                  onCancel={() => router.back()} />
    </Screen>
  );
}
