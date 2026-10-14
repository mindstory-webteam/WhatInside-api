import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Txt } from '@/components/Txt';
import { FridgeArt, ReminderArt, ScanArt } from '@/features/auth/Illustrations';
import { colors, radius, spacing } from '@/theme/tokens';

const SLIDES: { key: 's1' | 's2' | 's3'; Art: typeof FridgeArt; icon: IconName }[] = [
  { key: 's1', Art: FridgeArt, icon: 'fridge-outline' },
  { key: 's2', Art: ScanArt, icon: 'line-scan' },
  { key: 's3', Art: ReminderArt, icon: 'bell-ring-outline' },
];

/** Welcome + three-step onboarding. */
export default function Welcome() {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const { sessionExpired } = useAuth();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const last = index === SLIDES.length - 1;
  const artSize = Math.min(width - spacing.lg * 4, height * 0.36, 320);

  const goTo = (i: number) => {
    list.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Logo size={34} />
        {!last ? (
          <Pressable onPress={() => goTo(SLIDES.length - 1)} hitSlop={10} accessibilityRole="button" style={styles.skip}>
            <Txt variant="label" style={{ color: colors.primary }}>{t('onboarding.skip')}</Txt>
          </Pressable>
        ) : <View />}
      </View>
      {sessionExpired ? (
        <View style={styles.expired}>
          <Icon name="information-outline" size={18} color={colors.warning} />
          <Txt variant="muted" style={{ color: colors.warning, flex: 1 }}>{t('auth.sessionExpired')}</Txt>
        </View>
      ) : null}
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.artPanel}>
              <item.Art size={artSize} />
            </View>
            <View style={styles.kicker}>
              <Icon name={item.icon} size={14} color={colors.primary} />
              <Txt style={styles.kickerText}>{t(`onboarding.${item.key}Kicker`)}</Txt>
            </View>
            <Txt style={styles.title} accessibilityRole="header">{t(`onboarding.${item.key}Title`)}</Txt>
            <Txt variant="muted" style={styles.body}>{t(`onboarding.${item.key}Body`)}</Txt>
          </View>
        )}
      />
      <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((s, i) => (
          <Pressable key={s.key} onPress={() => goTo(i)} hitSlop={6}>
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        {last ? (
          <Button title={t('onboarding.getStarted')} icon="arrow-right" onPress={() => router.push('/register')}
                  testID="get-started" />
        ) : (
          <Button title={t('onboarding.next')} icon="arrow-right" onPress={() => goTo(index + 1)} testID="onboarding-next" />
        )}
        <Button title={t('onboarding.haveAccount')} variant="outline" onPress={() => router.push('/login')}
                testID="have-account" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm, paddingBottom: spacing.sm },
  skip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.secondarySoft },
  expired: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginHorizontal: spacing.lg, padding: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.warningSoft },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  artPanel: {
    width: '100%', borderRadius: radius.xl * 1.5, backgroundColor: colors.surface, alignItems: 'center',
    justifyContent: 'center', paddingVertical: spacing.lg, marginBottom: spacing.lg,
    shadowColor: '#0B2A17', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: radius.pill, backgroundColor: colors.secondarySoft },
  kickerText: { color: colors.primary, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.3, marginTop: 4 },
  body: { textAlign: 'center', maxWidth: 320, fontSize: 15.5, lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 26, backgroundColor: colors.primary },
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
});
