import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, errorMessage } from '@/api/client';
import { scanApi } from '@/api/endpoints';
import type { BarcodeResult } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Txt } from '@/components/Txt';
import { cameraPermissionUi } from '@/features/scan/permission';
import { PermissionGate } from '@/features/scan/PermissionGate';
import { todayIn } from '@/lib/dates';
import { draftFromBarcode, draftStore } from '@/scan/draft';
import { colors, radius, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';

export default function BarcodeScanner() {
  const { t } = useTranslation();
  const { household } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false); // onBarcodeScanned fires repeatedly; handle the first only
  const permUi = cameraPermissionUi(permission);
  const manual = () => router.replace({ pathname: '/review', params: { source: 'manual' } });

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    setLooking(true);
    setError(null);
    try {
      setResult(await scanApi.barcode(data.trim()));
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'invalid_barcode' ? t('barcode.invalid') : errorMessage(e));
    } finally {
      setLooking(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    locked.current = false;
  };

  const proceed = () => {
    if (!result) return;
    draftStore.set(draftFromBarcode(result, todayIn(household?.timezone)));
    router.replace({ pathname: '/review', params: { source: 'barcode' } });
  };

  if (permUi !== 'granted') {
    return (
      <SafeAreaView style={styles.page}>
        <PermissionGate state={permUi} onRequest={requestPermission} onManual={manual} />
      </SafeAreaView>
    );
  }

  const statusText = result && !result.found
    ? (result.status === 'provider_timeout' || result.status === 'provider_unavailable' ? t('barcode.timeout') : t('barcode.notFound'))
    : null;

  return (
    <View style={styles.dark}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        onBarcodeScanned={result || looking || error ? undefined : onScan}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()}>
            <Icon name="close" size={28} color={colors.textOnPrimary} />
          </Pressable>
          <Txt variant="heading" style={styles.light}>{t('barcode.title')}</Txt>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: torch }} accessibilityLabel="Torch"
                     onPress={() => setTorch((v) => !v)}>
            <Icon name={torch ? 'flash' : 'flash-off'} size={26} color={colors.textOnPrimary} />
          </Pressable>
        </View>
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Txt style={[styles.light, styles.hint]}>{t('barcode.hint')}</Txt>
        </View>
        <View style={styles.bottom}>
          {looking ? (
            <Card style={styles.sheet}><ActivityIndicator color={colors.primary} /><Txt>{t('barcode.looking')}</Txt></Card>
          ) : error ? (
            <Card style={styles.sheet}>
              <Txt style={{ color: colors.danger }}>{error}</Txt>
              <Button title={t('barcode.scanAgain')} onPress={reset} />
              <Button title={t('barcode.enterManually')} variant="ghost" onPress={manual} />
            </Card>
          ) : result ? (
            <Card style={styles.sheet} testID="barcode-result">
              {result.found ? (
                <Txt variant="heading">{t('barcode.found', { name: [result.product.brand, result.product.name].filter(Boolean).join(' ') })}</Txt>
              ) : <Txt>{statusText}</Txt>}
              <Txt variant="caption">{result.product.barcode}</Txt>
              <View style={styles.note}>
                <Icon name="calendar-alert" size={18} color={colors.warning} />
                <Txt variant="muted" style={{ flex: 1 }}>{t('barcode.noExpiry')}</Txt>
              </View>
              <Button title={t('common.continue')} onPress={proceed} testID="barcode-continue" />
              <Button title={t('barcode.scanAgain')} variant="ghost" onPress={reset} />
            </Card>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  dark: { flex: 1, backgroundColor: colors.primaryDark },
  light: { color: colors.textOnPrimary },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  frameWrap: { alignItems: 'center', gap: spacing.md },
  frame: { width: '80%', height: 160, borderWidth: 3, borderColor: colors.secondary, borderRadius: radius.lg },
  hint: { backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  bottom: { padding: spacing.lg, minHeight: 120 },
  sheet: { gap: spacing.md },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.warningSoft, padding: spacing.sm, borderRadius: radius.sm },
});
