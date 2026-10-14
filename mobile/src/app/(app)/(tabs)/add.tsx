import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { colors, radius, spacing } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/Icon';

function Option({ icon, title, sub, body, onPress, recommended, testID }: {
  icon: IconName; title: string; sub?: string; body: string;
  onPress: () => void; recommended?: string; testID?: string;
}) {
  return (
    <Card onPress={onPress} testID={testID} accessibilityLabel={title}
          style={[styles.option, recommended ? styles.primary : null]}>
      <View style={[styles.icon, recommended ? { backgroundColor: colors.surface } : null]}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {recommended ? <View style={styles.badge}><Txt variant="caption" style={styles.badgeText}>{recommended}</Txt></View> : null}
        <Txt variant="heading">{title}</Txt>
        {sub ? <Txt variant="label" style={{ color: colors.textMuted }}>{sub}</Txt> : null}
        <Txt variant="muted">{body}</Txt>
      </View>
    </Card>
  );
}

export default function AddProduct() {
  const { t } = useTranslation();
  return (
    <Screen title={t('add.title')}>
      <Option icon="line-scan" title={t('add.ocr')} sub={t('add.ocrSub')} body={t('add.ocrBody')}
              recommended={t('add.recommended')} onPress={() => router.push('/scan/ocr')} testID="add-ocr" />
      <Option icon="barcode-scan" title={t('add.barcode')} body={t('add.barcodeBody')}
              onPress={() => router.push('/scan/barcode')} testID="add-barcode" />
      <Option icon="clipboard-edit-outline" title={t('add.manual')} body={t('add.manualBody')}
              onPress={() => router.push({ pathname: '/review', params: { source: 'manual' } })} testID="add-manual" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center', minHeight: 110 },
  primary: { backgroundColor: colors.secondarySoft, borderWidth: 1.5, borderColor: colors.secondary },
  icon: { width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-end', backgroundColor: colors.secondary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: colors.textOnPrimary, fontWeight: '700' },
});
