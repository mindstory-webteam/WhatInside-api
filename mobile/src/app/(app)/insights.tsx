import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useOverview, useWaste } from '@/api/hooks';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { Txt } from '@/components/Txt';
import { formatMonth } from '@/lib/dates';
import { colors, radius, spacing } from '@/theme/tokens';

function Metric({ label, value, tone = colors.primary }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card style={styles.metric} accessibilityLabel={`${label}: ${value}`}>
      <Txt style={[styles.metricValue, { color: tone }]}>{value}</Txt>
      <Txt variant="caption">{label}</Txt>
    </Card>
  );
}

/** Simple accessible bar chart (no chart library needed). */
function MonthlyBars({ data }: { data: { month: string; added: number; consumed: number; discarded: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.added, d.consumed, d.discarded]));
  const series = [
    { key: 'added', color: colors.info },
    { key: 'consumed', color: colors.secondary },
    { key: 'discarded', color: colors.danger },
  ] as const;
  return (
    <View>
      <View style={styles.chart}>
        {data.map((d) => (
          <View key={d.month} style={styles.group}
                accessibilityLabel={`${formatMonth(d.month)}: added ${d.added}, used ${d.consumed}, discarded ${d.discarded}`}>
            <View style={styles.bars}>
              {series.map((s) => (
                <View key={s.key} style={[styles.bar, { height: Math.max(2, (d[s.key] / max) * 110), backgroundColor: s.color }]} />
              ))}
            </View>
            <Txt variant="caption">{formatMonth(d.month)}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Txt variant="caption">{s.key}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Insights() {
  const { t } = useTranslation();
  const overview = useOverview();
  const waste = useWaste();
  const o = overview.data;
  const w = waste.data;

  return (
    <Screen back title={t('insights.title')} refreshing={overview.isRefetching}
            onRefresh={() => {
              overview.refetch();
              waste.refetch();
            }}>
      {overview.isLoading && !o ? <LoadingState /> : !o ? <ErrorState error={overview.error} onRetry={() => overview.refetch()} /> : (
        <>
          <Txt variant="muted">{t('insights.months', { count: o.period_months })}</Txt>
          <View style={styles.grid}>
            <Metric label={t('insights.added')} value={o.total_products_added} />
            <Metric label={t('insights.consumed')} value={o.products_consumed} tone={colors.secondary} />
            <Metric label={t('insights.usedBeforeExpiry')} value={o.products_used_before_expiry} tone={colors.secondary} />
            <Metric label={t('insights.discarded')} value={o.products_discarded} tone={colors.danger} />
            <Metric label={t('insights.expiryWaste')} value={o.expiry_related_waste} tone={colors.warning} />
            <Metric label={t('insights.wasteCost')} value={w?.estimated_waste_cost ? `≈ ${w.estimated_waste_cost}` : '—'}
                    tone={colors.danger} />
          </View>
          {w ? (
            <Txt variant="caption">
              {t('insights.coverage', { priced: w.estimate_coverage.priced_discards, total: w.estimate_coverage.total_discards })}
              {' · '}{t('insights.estimateNote')}
            </Txt>
          ) : null}

          <Txt variant="heading">{t('insights.monthly')}</Txt>
          <Card>{o.monthly_activity.length ? <MonthlyBars data={o.monthly_activity} /> : <Txt variant="muted">{t('insights.none')}</Txt>}</Card>

          <Txt variant="heading">{t('insights.frequent')}</Txt>
          <Card style={{ gap: spacing.sm }}>
            {w?.frequently_discarded.length ? w.frequently_discarded.map((f) => (
              <View key={f.product_name} style={styles.row}>
                <Txt style={{ flex: 1 }}>{f.product_name}</Txt>
                <Txt variant="label">×{f.times}</Txt>
                {f.estimated_cost ? <Txt variant="caption">≈ {f.estimated_cost}</Txt> : null}
              </View>
            )) : <Txt variant="muted">{t('insights.none')}</Txt>}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { flexBasis: '47%', flexGrow: 1, gap: 4 },
  metricValue: { fontSize: 26, fontWeight: '800' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 140 },
  group: { alignItems: 'center', gap: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 112 },
  bar: { width: 8, borderRadius: radius.sm },
  legend: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center', marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
});
