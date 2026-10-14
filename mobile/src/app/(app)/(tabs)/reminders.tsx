import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { notificationApi } from '@/api/endpoints';
import { useInventory, useNotificationHistory } from '@/api/hooks';
import type { Batch, DateFormat, NotificationRecord } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Txt } from '@/components/Txt';
import { notificationPermission } from '@/notifications/local';
import { colors, spacing } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/Icon';

type Tab = 'alerts' | 'history' | 'upcoming';
const parseTab = (v?: string): Tab => (v === 'history' || v === 'upcoming' ? v : 'alerts');

function AlertSection({ title, tone, icon, items, dateFormat, hint }: {
  title: string; tone: string; icon: IconName; items: Batch[]; dateFormat?: DateFormat; hint?: string;
}) {
  if (!items.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={tone} />
        <Txt variant="heading" style={{ color: tone, flex: 1 }}>{title}</Txt>
        <View style={[styles.count, { backgroundColor: tone }]}><Txt style={styles.countText}>{items.length}</Txt></View>
      </View>
      {hint ? <Txt variant="caption">{hint}</Txt> : null}
      {items.map((b) => (
        <ProductCard key={b.id} batch={b} dateFormat={dateFormat} onPress={() => router.push(`/batch/${b.id}`)} />
      ))}
    </View>
  );
}

export default function Reminders() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; at?: string }>();
  const [tab, setTab] = useState<Tab>(parseTab(params.tab));
  useEffect(() => {
    if (params.tab) setTab(parseTab(params.tab));
  }, [params.tab, params.at]);
  const list = useNotificationHistory(tab === 'upcoming');
  const expired = useInventory({ expiry_status: 'expired', ordering: 'effective_expiry', page_size: 50 });
  const soon = useInventory({ expiry_status: 'expiring_soon', ordering: 'effective_expiry', page_size: 50 });
  const alertsLoading = (expired.isLoading && !expired.data) || (soon.isLoading && !soon.data);
  const alertCount = (expired.data?.count ?? 0) + (soon.data?.count ?? 0);
  const refetch = () => (tab === 'alerts' ? Promise.all([expired.refetch(), soon.refetch()]) : list.refetch());
  const [permission, setPermission] = useState<string>('granted');

  useFocusEffect(useCallback(() => {
    notificationPermission(false).then(setPermission).catch(() => undefined);
    notificationApi.markAllRead().catch(() => undefined);
  }, []));

  const statusLabel = (s: NotificationRecord['status']) =>
    t(`reminders.status_${s}`, { defaultValue: s });

  return (
    <Screen title={t('reminders.title')}
            refreshing={tab === 'alerts' ? expired.isRefetching || soon.isRefetching : list.isRefetching}
            onRefresh={refetch}
            right={(
              <Pressable accessibilityRole="button" accessibilityLabel={t('reminders.settings')} hitSlop={10}
                         onPress={() => router.push('/settings/reminders')}>
                <Icon name="cog-outline" size={24} color={colors.text} />
              </Pressable>
            )}>
      {permission !== 'granted' ? (
        <Card style={styles.warn}>
          <Icon name="bell-off-outline" size={22} color={colors.warning} />
          <Txt variant="muted" style={{ flex: 1 }}>{t('reminders.permissionOff')}</Txt>
          <Button title={t('ocr.allow')} compact onPress={async () => setPermission(await notificationPermission(true))} />
        </Card>
      ) : null}
      <View style={styles.tabs}>
        <Chip label={alertCount ? `${t('reminders.alerts')} · ${alertCount}` : t('reminders.alerts')}
              selected={tab === 'alerts'} onPress={() => setTab('alerts')} testID="tab-alerts" />
        <Chip label={t('reminders.history')} selected={tab === 'history'} onPress={() => setTab('history')} />
        <Chip label={t('reminders.upcoming')} selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
      </View>
      {tab === 'alerts' ? (
        alertsLoading ? <LoadingState /> : expired.error && soon.error && !expired.data ? (
          <ErrorState error={expired.error} onRetry={refetch} />
        ) : !alertCount ? (
          <EmptyState icon="check-circle-outline" title={t('reminders.noAlerts')} body={t('reminders.noAlertsBody')} />
        ) : (
          <>
            <AlertSection title={t('home.expired')} tone={colors.danger} icon="alert-octagon-outline"
                          items={expired.data?.results ?? []} dateFormat={user?.date_format} hint={t('reminders.expiredHint')} />
            <AlertSection title={t('home.expiringSoon')} tone={colors.warning} icon="clock-alert-outline"
                          items={soon.data?.results ?? []} dateFormat={user?.date_format} />
          </>
        )
      ) : list.isLoading && !list.data ? <LoadingState /> : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.results.length ? (
        <EmptyState icon="bell-outline" title={t(tab === 'upcoming' ? 'reminders.emptyUpcoming' : 'reminders.empty')}
                    body={t(tab === 'upcoming' ? 'reminders.emptyUpcomingBody' : 'reminders.emptyBody')} />
      ) : list.data.results.map((n) => (
        <Card key={n.id} onPress={n.batch ? () => router.push(`/batch/${n.batch}`) : undefined} style={styles.item}>
          <View style={[styles.itemIcon, { backgroundColor: n.days_before <= 1 ? colors.dangerSoft : colors.warningSoft }]}>
            <Icon name={n.days_before === 0 ? 'alert-circle-outline' : 'bell-ring-outline'} size={20}
                  color={n.days_before <= 1 ? colors.danger : colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="label">{n.title}</Txt>
            <Txt variant="muted">{n.body}</Txt>
            <Txt variant="caption">{new Date(n.sent_at ?? n.scheduled_for).toLocaleString()} · {statusLabel(n.status)}</Txt>
          </View>
        </Card>
      ))}
      <Txt variant="caption">{t('reminders.deliveryNote')}</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  itemIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  count: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.warningSoft },
});
