import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError, errorMessage } from '@/api/client';
import { scanApi } from '@/api/endpoints';
import { useInvalidateInventory, usePreferences, useUpdatePreferences } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { ReminderToggles } from '@/features/reminders/ReminderToggles';
import { ReviewForm } from '@/features/review/ReviewForm';
import { todayIn } from '@/lib/dates';
import { draftStore, emptyDraft, toConfirmPayload, type DraftSource, type ReviewField } from '@/scan/draft';
import type { ProductForm } from '@/validation/schemas';

/** Review & confirm screen for OCR, barcode and manual entry. Nothing is saved until "Save product". */
export default function Review() {
  const { t } = useTranslation();
  const { household, user } = useAuth();
  const params = useLocalSearchParams<{ source?: DraftSource }>();
  const draft = useMemo(() => {
    const d = draftStore.get();
    return d && d.source === params.source ? d : emptyDraft(todayIn(household?.timezone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const idempotencyKey = useRef(Crypto.randomUUID()); // double-tap safe
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ReviewField, string>>>({});
  const invalidate = useInvalidateInventory();
  const qc = useQueryClient();
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();

  const submit = async (values: ProductForm) => {
    setSubmitting(true);
    setServerError(null);
    setFieldErrors({});
    try {
      const batch = await scanApi.confirm(toConfirmPayload(values, draft.source), idempotencyKey.current);
      draftStore.clear();
      await invalidate();
      qc.setQueryData(['batch', household?.id, batch.id], batch);
      router.replace({ pathname: '/batch/[id]', params: { id: String(batch.id), saved: '1' } });
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'validation') {
        const f = e.fieldErrors();
        const mapped: Partial<Record<ReviewField, string>> = {};
        for (const [k, v] of Object.entries(f)) mapped[k.replace('new_product.', '') as ReviewField] = v;
        setFieldErrors(mapped);
      }
      setServerError(e instanceof ApiError && e.isOffline
        ? 'Saving new products needs a connection. Your form is kept — try again when online.' : errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen back title={t('review.title')}>
      <ReviewForm
        draft={draft}
        dateFormat={user?.date_format}
        submitting={submitting}
        serverError={serverError}
        serverFieldErrors={fieldErrors}
        onSubmit={submit}
        onScanAgain={draft.source === 'manual' ? undefined
          : () => router.replace(draft.source === 'barcode' ? '/scan/barcode' : '/scan/ocr')}
        onCancel={() => {
          draftStore.clear();
          router.back();
        }}
        reminderSlot={prefs.data ? (
          <Card>
            <Txt variant="label">{t('review.reminders')}</Txt>
            <ReminderToggles prefs={prefs.data} onChange={(p) => updatePrefs.mutate(p)} />
          </Card>
        ) : null}
      />
    </Screen>
  );
}
