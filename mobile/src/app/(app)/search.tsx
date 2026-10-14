import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useInventory } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useDebounced } from '@/lib/useDebounced';

export default function Search() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);
  const results = useInventory({ search: term || undefined, ordering: 'effective_expiry', page_size: 50 });
  return (
    <Screen back title={t('common.search')}>
      <TextField label={t('common.search')} placeholder={t('inventory.searchPlaceholder')} value={q} onChangeText={setQ}
                 autoFocus returnKeyType="search" />
      {results.isLoading ? <LoadingState /> : results.error && !results.data ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : results.data?.results.length ? results.data.results.map((b) => (
        <ProductCard key={b.id} batch={b} dateFormat={user?.date_format} onPress={() => router.push(`/batch/${b.id}`)} />
      )) : <EmptyState icon="magnify" title={t('inventory.empty')} />}
    </Screen>
  );
}
