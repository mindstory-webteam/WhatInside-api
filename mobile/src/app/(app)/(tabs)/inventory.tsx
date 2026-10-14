import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { inventoryApi } from '@/api/endpoints';
import type { Category } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { buildInventoryQuery, parseView, VIEWS, type InventoryView, type SortKey } from '@/features/inventory/query';
import { useDebounced } from '@/lib/useDebounced';
import { CATEGORIES } from '@/lib/options';
import { colors, fonts, radius, spacing, TAP } from '@/theme/tokens';
import { Icon } from '@/components/Icon';

export default function Inventory() {
  const { t } = useTranslation();
  const { household, user } = useAuth();
  const params = useLocalSearchParams<{ view?: string; at?: string }>();
  const [view, setView] = useState<InventoryView>(parseView(params.view));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | 'any'>('any');
  const [sort, setSort] = useState<SortKey>('expiry');
  const debounced = useDebounced(search, 300);

  // `at` changes on every tap from Home, so the same shortcut works twice in a row.
  useEffect(() => {
    if (params.view) setView(parseView(params.view));
  }, [params.view, params.at]);

  const query = useMemo(() => buildInventoryQuery({ view, search: debounced, category, sort }),
    [view, debounced, category, sort]);

  const list = useInfiniteQuery({
    queryKey: ['inventory', household?.id, query, 'infinite'],
    queryFn: ({ pageParam }) => inventoryApi.list({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    enabled: !!household,
  });
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];
  const viewLabel = (v: InventoryView) => t(v === 'expiring_soon' ? 'inventory.expiringSoon' : `inventory.${v}`);

  return (
    <Screen scroll={false} title={t('inventory.title')}>
      <View style={styles.searchRow}>
        <Icon name="magnify" size={20} color={colors.textMuted} />
        <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder={t('inventory.searchPlaceholder')}
                   placeholderTextColor={colors.textMuted} accessibilityLabel={t('common.search')} testID="inventory-search"
                   returnKeyType="search" />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {VIEWS.map((v) => (
            <Chip key={v} label={viewLabel(v)} selected={view === v} onPress={() => setView(v)} testID={`view-${v}`} />
          ))}
        </ScrollView>
      </View>
      <View style={styles.filters}>
        <View style={{ flex: 1 }}>
          <SelectField label={t('inventory.category')} value={category}
                       options={[{ value: 'any' as const, label: t('inventory.anyCategory') },
                         ...CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))]}
                       onChange={(v) => setCategory(v as Category | 'any')} />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField label={t('inventory.sort')} value={sort}
                       options={[{ value: 'expiry' as SortKey, label: t('inventory.sortExpiry') },
                         { value: 'name' as SortKey, label: t('inventory.sortName') },
                         { value: 'recent' as SortKey, label: t('inventory.sortRecent') }]}
                       onChange={setSort} />
        </View>
      </View>
      {list.isLoading ? <LoadingState /> : list.error && !items.length ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ProductCard batch={item} dateFormat={user?.date_format} onPress={() => router.push(`/batch/${item.id}`)} />
          )}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => list.refetch()}
          ListFooterComponent={list.isFetchingNextPage ? <LoadingState /> : null}
          ListEmptyComponent={
            <EmptyState title={t('inventory.empty')} body={t('inventory.emptyBody')}
                        action={<Button title={t('add.title')} icon="plus" onPress={() => router.push('/add')} />} />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minHeight: TAP,
  },
  search: { flex: 1, fontSize: 16.5, fontFamily: fonts.regular, color: colors.text },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  filters: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md, paddingBottom: 120 },
});
