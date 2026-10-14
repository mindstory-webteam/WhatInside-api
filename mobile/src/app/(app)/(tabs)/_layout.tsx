import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { type ColorValue, Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, shadow } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/Icon';

const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) =>
  <Icon name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11.5, fontFamily: fonts.semibold },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home-variant') }} />
      <Tabs.Screen name="inventory" options={{ title: t('tabs.inventory'), tabBarIcon: icon('fridge-outline') }} />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarButton: () => (
            <View style={styles.addWrap}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('add.title')} testID="tab-add"
                         style={styles.add} onPress={() => router.push('/add')}>
                <Icon name="plus" size={30} color={colors.textOnPrimary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="reminders" options={{ title: t('tabs.reminders'), tabBarIcon: icon('bell-outline') }} />
      <Tabs.Screen name="more" options={{ title: t('tabs.more'), tabBarIcon: icon('dots-grid') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: 'center' },
  add: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.secondary, alignItems: 'center',
    justifyContent: 'center', marginTop: -18, borderWidth: 4, borderColor: colors.surface, ...shadow.card,
  },
});
