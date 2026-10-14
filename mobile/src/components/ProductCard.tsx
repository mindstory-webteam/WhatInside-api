import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import type { Batch, DateFormat } from '@/api/types';
import { formatDate } from '@/lib/dates';
import { CATEGORY_ICON, formatQty, STORAGE_ICON } from '@/lib/options';
import { colors, radius, spacing } from '@/theme/tokens';

import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { Txt } from './Txt';
import { Icon } from './Icon';

export function ProductThumb({ batch, size = 56 }: { batch: Pick<Batch, 'product'>; size?: number }) {
  const uri = batch.product.image || batch.product.image_url;
  if (uri) return <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.thumb, styles.placeholder, { width: size, height: size }]}>
      <Icon name={CATEGORY_ICON[batch.product.category] as never} size={size * 0.5} color={colors.secondary} />
    </View>
  );
}

export function ProductCard({ batch, onPress, dateFormat }: { batch: Batch; onPress?: () => void; dateFormat?: DateFormat }) {
  const { t } = useTranslation();
  const title = batch.product.brand ? `${batch.product.name} · ${batch.product.brand}` : batch.product.name;
  return (
    <Card onPress={onPress} style={styles.card} testID={`batch-${batch.id}`}
          accessibilityLabel={`${title}, ${formatQty(batch.quantity)} ${batch.unit}, ${t(`storage.${batch.storage_location}`)}`}>
      <ProductThumb batch={batch} />
      <View style={styles.body}>
        <Txt variant="label" numberOfLines={1} style={styles.name}>{batch.product.name}</Txt>
        {batch.product.brand ? <Txt variant="caption" numberOfLines={1}>{batch.product.brand}</Txt> : null}
        <View style={styles.meta}>
          <Txt variant="caption">{formatQty(batch.quantity)} {batch.unit}</Txt>
          <Txt variant="caption">·</Txt>
          <Icon name={STORAGE_ICON[batch.storage_location] as never} size={13} color={colors.textMuted} />
          <Txt variant="caption">{t(`storage.${batch.storage_location}`)}</Txt>
        </View>
        <View style={styles.meta}>
          <StatusBadge status={batch.expiry_status} days={batch.days_until_expiry} batchStatus={batch.status} />
          {batch.expiry_confirmed && batch.effective_expiry ? (
            <Txt variant="caption">{formatDate(batch.effective_expiry, dateFormat)}</Txt>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-right" size={22} color={colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  thumb: { borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
