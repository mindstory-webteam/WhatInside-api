import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { formatPhone } from '@/lib/phone';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { colors, spacing } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/Icon';

type Item = { icon: IconName; label: string; href?: Href; onPress?: () => void; danger?: boolean };

export default function More() {
  const { t } = useTranslation();
  const { user, household, signOut } = useAuth();
  const groups: Item[][] = [
    [
      { icon: 'cart-outline', label: t('shopping.title'), href: '/shopping' },
      { icon: 'chart-box-outline', label: t('insights.title'), href: '/insights' },
      { icon: 'magnify', label: t('common.search'), href: '/search' },
    ],
    [
      { icon: 'account-circle-outline', label: t('settings.profile'), href: '/settings/profile' },
      { icon: 'home-outline', label: t('settings.household'), href: '/settings/household' },
      { icon: 'account-group-outline', label: t('settings.family'), href: '/settings/family' },
      { icon: 'bell-cog-outline', label: t('settings.reminders'), href: '/settings/reminders' },
      { icon: 'shield-lock-outline', label: t('settings.privacy'), href: '/settings/privacy' },
    ],
    [
      { icon: 'logout', label: t('auth.logout'), onPress: signOut },
      { icon: 'account-remove-outline', label: t('settings.deleteAccount'), href: '/settings/delete-account', danger: true },
    ],
  ];
  return (
    <Screen title={t('tabs.more')}>
      <Card style={styles.profile}>
        <View style={styles.avatar}><Txt style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Txt></View>
        <View>
          <Txt variant="heading">{user?.name}</Txt>
          <Txt variant="muted">{formatPhone(user?.phone) || user?.email}</Txt>
          <Txt variant="caption">{household?.name} · {t(`settings.role_${household?.my_role ?? 'member'}`)}</Txt>
        </View>
      </Card>
      {groups.map((g, i) => (
        <Card key={i} style={{ paddingVertical: 0 }}>
          {g.map((item) => (
            <Pressable key={item.label} accessibilityRole="button" style={styles.row}
                       onPress={item.onPress ?? (() => item.href && router.push(item.href))}>
              <Icon name={item.icon} size={24} color={item.danger ? colors.danger : colors.primary} />
              <Txt style={[{ flex: 1 }, item.danger && { color: colors.danger }]}>{item.label}</Txt>
              <Icon name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.textOnPrimary, fontSize: 24, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
