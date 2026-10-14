import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/api/client';
import { inventoryApi, productApi } from '@/api/endpoints';
import { useInvalidateInventory } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { ReviewForm } from '@/features/review/ReviewForm';
import { todayIn } from '@/lib/dates';
import { draftForNewBatch, toBatchUpdate } from '@/scan/draft';
import type { ProductForm } from '@/validation/schemas';

/** Add another batch (new purchase with its own dates) to an existing product. */
export default function NewBatch() {
  const { t } = useTranslation();
  const { household, user } = useAuth();
  const { product: productId } = useLocalSearchParams<{ product: string }>();
  const product = useQuery({ queryKey: ['product', Number(productId)], queryFn: () => productApi.get(Number(productId)) });
  const draft = useMemo(() => (product.data ? draftForNewBatch(product.data, todayIn(household?.timezone)) : null),
    [product.data, household?.timezone]);
  const key = useRef(Crypto.randomUUID());
  const invalidate = useInvalidateInventory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return <Screen back title={t('detail.addBatch')}>{product.error ? <ErrorState error={product.error} /> : <LoadingState />}</Screen>;
  }

  const submit = async (v: ProductForm) => {
    setBusy(true);
    setError(null);
    try {
      const { version: _v, ...fields } = toBatchUpdate(v, 0);
      const created = await inventoryApi.create({ ...fields, product: Number(productId),
        storage_location: v.storage_location as never, quantity: fields.quantity! }, key.current);
      await invalidate();
      router.replace({ pathname: '/batch/[id]', params: { id: String(created.id), saved: '1' } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('detail.addBatch')}>
      <ReviewForm draft={draft} dateFormat={user?.date_format} submitting={busy} serverError={error} onSubmit={submit}
                  onCancel={() => router.back()} />
    </Screen>
  );
}
