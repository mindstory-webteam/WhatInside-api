import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useActivity, useDashboard, useExpiringSoon } from '@/api/hooks';
import type { InventoryEvent, StorageLocation } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/Card';
import { Icon, type IconName } from '@/components/Icon';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { Txt } from '@/components/Txt';
import { timeAgo } from '@/lib/timeAgo';
import { formatQty, STORAGE_ICON } from '@/lib/options';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

const EVENT_ICON: Record<InventoryEvent['event_type'], IconName> = {
  added: 'plus-circle-outline', consumed: 'silverware-fork-knife', discarded: 'delete-outline',
  restocked: 'refresh', adjusted: 'pencil-outline', finished: 'check-circle-outline', deleted: 'close-circle-outline',
};

const EVENT_TONE: Record<InventoryEvent['event_type'], { fg: string; bg: string }> = {
  added: { fg: colors.primary, bg: colors.secondarySoft },
  restocked: { fg: colors.primary, bg: colors.secondarySoft },
  consumed: { fg: colors.info, bg: colors.infoSoft },
  finished: { fg: colors.info, bg: colors.infoSoft },
  adjusted: { fg: colors.textMuted, bg: colors.surfaceMuted },
  discarded: { fg: colors.danger, bg: colors.dangerSoft },
  deleted: { fg: colors.danger, bg: colors.dangerSoft },
};

function IconButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
               style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={22} color={colors.text} />
      {badge ? (
        <View style={styles.badge}><Txt style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Txt></View>
      ) : null}
    </Pressable>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Txt variant="heading">{title}</Txt>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={8} style={styles.sectionLink}>
          <Txt variant="label" style={{ color: colors.secondary }}>{action}</Txt>
          <Icon name="chevron-right" size={16} color={colors.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ label, value, icon, fg, bg, onPress, testID }: {
  label: string; value: number; icon: IconName; fg: string; bg: string; onPress: () => void; testID?: string;
}) {
  return (
    <Card onPress={onPress} style={styles.stat} accessibilityLabel={`${label}: ${value}`} testID={testID}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}><Icon name={icon} size={20} color={fg} /></View>
      <View style={{ flex: 1 }}>
        <Txt style={[styles.statValue, { color: value ? fg : colors.text }]}>{value}</Txt>
        <Txt variant="caption" numberOfLines={1}>{label}</Txt>
      </View>
    </Card>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const { user, household } = useAuth();
  const summary = useDashboard();
  const expiring = useExpiringSoon();
  const activity = useActivity();
  const s = summary.data;
  const firstName = user?.name?.split(' ')[0] ?? '';
  const attention = s ? s.expiring_soon + s.expired : 0;

  const refresh = () => {
    summary.refetch();
    expiring.refetch();
    activity.refetch();
  };
  const openAlerts = () => router.navigate({ pathname: '/reminders', params: { tab: 'alerts', at: String(Date.now()) } });
  const openInventory = (view?: string) =>
    router.navigate({ pathname: '/inventory', params: view ? { view, at: String(Date.now()) } : { view: 'all', at: String(Date.now()) } });

  return (
    <Screen refreshing={summary.isRefetching} onRefresh={refresh}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.avatar} onPress={() => router.push('/settings/profile')} accessibilityRole="button"
                   accessibilityLabel={t('settings.profile')}>
          <Txt style={styles.avatarText}>{(firstName[0] ?? 'W').toUpperCase()}</Txt>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt variant="title" numberOfLines={1}>{t('home.greeting', { name: firstName })}</Txt>
          <View style={styles.household}>
            <Icon name="home-outline" size={14} color={colors.textMuted} />
            <Txt variant="caption" numberOfLines={1}>{household?.name}</Txt>
          </View>
        </View>
        <IconButton icon="magnify" label={t('common.search')} onPress={() => router.push('/search')} />
        <IconButton icon="bell-outline" label={t('home.alerts')} onPress={openAlerts}
                    badge={s?.unread_notifications || undefined} />
      </View>

      {summary.isLoading && !s ? <LoadingState /> : summary.error && !s ? (
        <ErrorState error={summary.error} onRetry={refresh} />
      ) : s ? (
        <>
          {/* Attention hero */}
          <Pressable accessibilityRole="button" onPress={openAlerts} testID="expiring-banner"
                     accessibilityLabel={attention ? t('home.attention', { count: attention }) : t('home.allGood')}
                     style={({ pressed }) => [styles.hero, pressed && { opacity: 0.95 }]}>
            <View style={[styles.blob, styles.blobA]} />
            <View style={[styles.blob, styles.blobB]} />
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Txt style={styles.heroKicker}>{t('home.thisWeek')}</Txt>
                {attention ? (
                  <View style={styles.heroCountRow}>
                    <Txt style={styles.heroNum}>{attention}</Txt>
                    <Txt style={styles.heroText}>{t('home.needAttention', { count: attention })}</Txt>
                  </View>
                ) : (
                  <Txt style={[styles.heroText, { marginTop: 6 }]}>{t('home.allGood')}</Txt>
                )}
              </View>
              <View style={styles.heroIcon}>
                <Icon name={attention ? 'bell-ring-outline' : 'leaf'} size={26}
                      color={attention ? colors.warningStrong : colors.secondarySoft} />
              </View>
            </View>
            <View style={styles.pills}>
              <View style={[styles.pill, s.expired ? styles.pillDanger : null]}>
                <Icon name="alert-octagon-outline" size={14} color={s.expired ? '#FFD5D5' : colors.secondarySoft} />
                <Txt style={styles.pillText}>{t('home.expiredCount', { count: s.expired })}</Txt>
              </View>
              <View style={[styles.pill, s.expiring_soon ? styles.pillWarn : null]}>
                <Icon name="clock-alert-outline" size={14} color={s.expiring_soon ? '#FFE3A8' : colors.secondarySoft} />
                <Txt style={styles.pillText}>{t('home.soonCount', { count: s.expiring_soon })}</Txt>
              </View>
            </View>
            <View style={styles.heroLinkRow}>
              <Txt style={styles.heroLink}>{t('home.viewAlerts')}</Txt>
              <Icon name="chevron-right" size={16} color={colors.textOnPrimary} />
            </View>
          </Pressable>

          {/* Quick add */}
          <SectionHead title={t('home.quickAdd')} />
          <Pressable accessibilityRole="button" testID="quick-ocr" onPress={() => router.push('/scan/ocr')}
                     style={({ pressed }) => [styles.scan, pressed && { opacity: 0.92 }]}>
            <View style={styles.scanIcon}><Icon name="line-scan" size={26} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Txt style={styles.scanTitle}>{t('add.ocr')}</Txt>
              <Txt variant="caption" style={{ color: colors.secondarySoft }}>{t('home.scanSub')}</Txt>
            </View>
            <Icon name="chevron-right" size={22} color={colors.textOnPrimary} />
          </Pressable>
          <View style={styles.row}>
            <Card style={styles.quick} onPress={() => router.push('/scan/barcode')} accessibilityLabel={t('add.barcode')}>
              <View style={styles.quickIcon}><Icon name="barcode-scan" size={22} color={colors.primary} /></View>
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>{t('add.barcode')}</Txt>
            </Card>
            <Card style={styles.quick} onPress={() => router.push({ pathname: '/review', params: { source: 'manual' } })}
                  accessibilityLabel={t('add.manual')}>
              <View style={styles.quickIcon}><Icon name="clipboard-edit-outline" size={22} color={colors.primary} /></View>
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>{t('add.manual')}</Txt>
            </Card>
          </View>

          {/* Storage */}
          <SectionHead title={t('home.myInventory')} action={t('common.seeAll')} onAction={() => openInventory()} />
          <View style={styles.row}>
            {(['refrigerator', 'freezer', 'pantry'] as StorageLocation[]).map((loc) => (
              <Card key={loc} style={styles.storage} accessibilityLabel={`${t(`storage.${loc}`)}: ${s.storage[loc]}`}
                    onPress={() => openInventory(loc)}>
                <View style={styles.storageIcon}>
                  <Icon name={STORAGE_ICON[loc] as IconName} size={22} color={colors.primary} />
                </View>
                <Txt style={styles.storageCount}>{s.storage[loc]}</Txt>
                <Txt variant="caption" numberOfLines={1}>{t(`storage.${loc}`)}</Txt>
              </Card>
            ))}
          </View>

          {/* Stats 2×2 */}
          <View style={styles.grid}>
            <View style={styles.row}>
              <Stat label={t('home.active')} value={s.total_active_batches} icon="package-variant"
                    fg={colors.primary} bg={colors.secondarySoft} onPress={() => openInventory()} />
              <Stat label={t('home.expired')} value={s.expired} icon="alert-octagon-outline"
                    fg={colors.danger} bg={colors.dangerSoft} onPress={() => openInventory('expired')} testID="stat-expired" />
            </View>
            <View style={styles.row}>
              <Stat label={t('home.review')} value={s.review_required} icon="calendar-question"
                    fg={colors.info} bg={colors.infoSoft} onPress={() => openInventory('review')} />
              <Stat label={t('home.shopping')} value={s.shopping_list_count} icon="cart-outline"
                    fg={colors.warning} bg={colors.warningSoft} onPress={() => router.push('/shopping')} />
            </View>
          </View>

          {/* Expiring next 7 days */}
          <SectionHead title={t('home.next7')}
                       action={expiring.data?.results.length ? t('common.seeAll') : undefined}
                       onAction={() => openInventory('expiring_soon')} />
          {expiring.data?.results.length ? expiring.data.results.slice(0, 5).map((b) => (
            <ProductCard key={b.id} batch={b} dateFormat={user?.date_format}
                         onPress={() => router.push(`/batch/${b.id}`)} />
          )) : (
            <Card style={styles.emptyCard}>
              <View style={[styles.statIcon, { backgroundColor: colors.secondarySoft }]}>
                <Icon name="check-circle-outline" size={20} color={colors.primary} />
              </View>
              <Txt variant="muted" style={{ flex: 1 }}>{t('home.allGood')}</Txt>
            </Card>
          )}

          {/* Recent activity */}
          <SectionHead title={t('home.recent')} />
          <Card style={styles.activity}>
            {activity.data?.results.length ? activity.data.results.map((e, i) => {
              const tone = EVENT_TONE[e.event_type];
              return (
                <View key={e.id} style={[styles.event, i > 0 && styles.eventDivider]}>
                  <View style={[styles.eventIcon, { backgroundColor: tone.bg }]}>
                    <Icon name={EVENT_ICON[e.event_type]} size={16} color={tone.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="label" numberOfLines={1}>{e.product_name}</Txt>
                    <Txt variant="caption" numberOfLines={1}>
                      {t(`events.${e.event_type}`, { defaultValue: e.event_type })} · {formatQty(Math.abs(Number(e.quantity_change)))} {e.unit}
                      {e.actor_name ? ` · ${e.actor_name}` : ''}
                    </Txt>
                  </View>
                  <Txt variant="caption">{timeAgo(e.created_at, t)}</Txt>
                </View>
              );
            }) : <Txt variant="muted">{t('home.noActivity')}</Txt>}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.textOnPrimary, fontSize: 20, fontWeight: '700' },
  household: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background,
  },
  badgeText: { color: colors.textOnPrimary, fontSize: 10, lineHeight: 12, fontWeight: '700' },

  hero: {
    backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, overflow: 'hidden',
    ...shadow.card,
  },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: colors.secondary },
  blobA: { width: 180, height: 180, right: -60, top: -70, opacity: 0.25 },
  blobB: { width: 120, height: 120, right: 50, bottom: -80, opacity: 0.15 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroKicker: { color: colors.secondarySoft, fontSize: 13, fontWeight: '500', letterSpacing: 0.4 },
  heroCountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  heroNum: { color: colors.textOnPrimary, fontSize: 44, fontWeight: '800' },
  heroText: { color: colors.textOnPrimary, fontSize: 18, fontWeight: '600', flexShrink: 1 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pillDanger: { backgroundColor: 'rgba(198,40,40,0.55)' },
  pillWarn: { backgroundColor: 'rgba(245,165,36,0.35)' },
  pillText: { color: colors.textOnPrimary, fontSize: 13, fontWeight: '600' },
  heroLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroLink: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  sectionLink: { flexDirection: 'row', alignItems: 'center' },

  scan: {
    backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md, paddingRight: spacing.lg,
    flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 76, ...shadow.card,
  },
  scanIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center',
  },
  scanTitle: { color: colors.textOnPrimary, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.md },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  quickIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center',
  },

  storage: { flex: 1, padding: spacing.md, gap: 2 },
  storageIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  storageCount: { fontSize: 24, fontWeight: '800', color: colors.text },

  grid: { gap: spacing.md },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },

  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activity: { paddingVertical: spacing.sm },
  event: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  eventDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  eventIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
