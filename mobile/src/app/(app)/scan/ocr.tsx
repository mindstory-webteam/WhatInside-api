import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { cameraPermissionUi, guideCrop } from '@/features/scan/permission';
import { PermissionGate } from '@/features/scan/PermissionGate';
import { todayIn } from '@/lib/dates';
import { draftFromOcr, draftStore } from '@/scan/draft';
import { isOnDeviceOcrAvailable, recognizeLabel, type OcrProgress } from '@/scan/recognize';
import { colors, radius, spacing } from '@/theme/tokens';
import { Icon } from '@/components/Icon';

type Stage = 'camera' | 'preview' | 'processing' | 'error';
const STEPS: OcrProgress[] = ['detecting', 'identifying', 'dates', 'organizing'];
const STEP_LABEL: Record<OcrProgress, string> = { detecting: 'ocr.step1', identifying: 'ocr.step2', dates: 'ocr.step3', organizing: 'ocr.step4' };

export default function OcrScanner() {
  const { t } = useTranslation();
  const { user, household } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('camera');
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [torch, setTorch] = useState(false);
  const [progress, setProgress] = useState<OcrProgress>('detecting');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const permUi = cameraPermissionUi(permission);
  const manual = () => router.replace({ pathname: '/review', params: { source: 'manual' } });

  const capture = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (pic) {
        setPhoto({ uri: pic.uri, width: pic.width, height: pic.height });
        setStage('preview');
      }
    } catch (e) {
      setError(errorMessage(e));
      setStage('error');
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setPhoto({ uri: a.uri, width: a.width, height: a.height });
      setStage('preview');
    }
  };

  const cropToFrame = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.crop(guideCrop(photo.width, photo.height));
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      setPhoto({ uri: saved.uri, width: saved.width, height: saved.height });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const read = async () => {
    if (!photo) return;
    setStage('processing');
    setError(null);
    try {
      const order = user?.date_format === 'MM/DD/YYYY' ? 'mdy' : 'dmy';
      // recognizeLabel resizes/compresses the photo itself before any upload.
      const result = await recognizeLabel(photo, order, setProgress);
      if (!result.lines.length) {
        setError(t('ocr.noText'));
        setStage('error');
        return;
      }
      draftStore.set(draftFromOcr(result, todayIn(household?.timezone)));
      router.replace({ pathname: '/review', params: { source: 'ocr' } });
    } catch (e) {
      setError(errorMessage(e));
      setStage('error');
    }
  };

  if (stage === 'processing') {
    return (
      <SafeAreaView style={styles.dark}>
        <View style={styles.processing}>
          <View style={styles.ring}><ActivityIndicator size="large" color={colors.secondary} /></View>
          <Txt variant="title" style={styles.light}>{t('ocr.reading')}</Txt>
          <Txt variant="muted" style={[styles.light, { textAlign: 'center' }]}>{t('ocr.readingSub')}</Txt>
          <View style={styles.steps}>
            {STEPS.map((s, i) => {
              const done = STEPS.indexOf(progress) > i;
              const active = progress === s;
              return (
                <View key={s} style={styles.step} accessibilityLabel={`${t(STEP_LABEL[s])}${done ? ', done' : ''}`}>
                  <Icon name={done ? 'check-circle' : active ? 'progress-clock' : 'circle-outline'}
                                          size={22} color={done || active ? colors.secondary : colors.border} />
                  <Txt style={styles.light}>{t(STEP_LABEL[s])}</Txt>
                </View>
              );
            })}
          </View>
          <Txt variant="caption" style={styles.light}>{isOnDeviceOcrAvailable() ? t('ocr.onDevice') : t('ocr.onServer')}</Txt>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'error') {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.errorBox}>
          <Icon name="text-box-remove-outline" size={56} color={colors.warning} />
          <Txt variant="title" style={{ textAlign: 'center' }}>{t('ocr.failed')}</Txt>
          <Txt variant="muted" style={{ textAlign: 'center' }}>{error}</Txt>
          {photo ? <Button title={t('common.retry')} icon="refresh" onPress={read} /> : null}
          <Button title={t('ocr.retake')} variant="outline" icon="camera-retake-outline" onPress={() => {
            setPhoto(null);
            setStage('camera');
          }} />
          <Button title={t('ocr.manualInstead')} variant="ghost" onPress={manual} />
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'preview' && photo) {
    return (
      <SafeAreaView style={styles.dark}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => setStage('camera')}>
            <Icon name="chevron-left" size={30} color={colors.textOnPrimary} />
          </Pressable>
          <Txt variant="heading" style={styles.light}>{t('ocr.title')}</Txt>
          <View style={{ width: 30 }} />
        </View>
        <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Captured label" />
        <View style={styles.previewActions}>
          <Button title={t('ocr.usePhoto')} icon="text-recognition" onPress={read} testID="ocr-read" />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button title={t('ocr.crop')} variant="secondary" icon="crop" onPress={cropToFrame} loading={busy}
                    style={{ flex: 1 }} />
            <Button title={t('ocr.retake')} variant="secondary" icon="camera-retake-outline" style={{ flex: 1 }}
                    onPress={() => {
                      setPhoto(null);
                      setStage('camera');
                    }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (permUi !== 'granted') {
    return (
      <SafeAreaView style={styles.page}>
        <PermissionGate state={permUi} onRequest={requestPermission} onUpload={pickFromLibrary} onManual={manual} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.dark}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch}
                  onMountError={(e) => {
                    setError(e.message);
                    setStage('error');
                  }} />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()}>
            <Icon name="close" size={28} color={colors.textOnPrimary} />
          </Pressable>
          <Txt variant="heading" style={styles.light}>{t('ocr.title')}</Txt>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: torch }} accessibilityLabel={t('ocr.flash')}
                     onPress={() => setTorch((v) => !v)}>
            <Icon name={torch ? 'flash' : 'flash-off'} size={26} color={colors.textOnPrimary} />
          </Pressable>
        </View>
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Txt style={[styles.light, styles.hint]}>{t('ocr.hint')}</Txt>
        </View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('ocr.gallery')} style={styles.sideBtn} onPress={pickFromLibrary}>
            <Icon name="image-outline" size={26} color={colors.textOnPrimary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('ocr.capture')} testID="ocr-capture"
                     style={styles.shutter} onPress={capture} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('ocr.manualInstead')} style={styles.sideBtn} onPress={manual}>
            <Icon name="keyboard-outline" size={26} color={colors.textOnPrimary} />
          </Pressable>
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
  frame: { width: '86%', aspectRatio: 1.3, borderWidth: 3, borderColor: colors.secondary, borderRadius: radius.lg },
  hint: { backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: spacing.xl },
  sideBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.textOnPrimary, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.secondary },
  preview: { flex: 1, margin: spacing.lg, borderRadius: radius.lg },
  previewActions: { padding: spacing.lg, gap: spacing.md },
  processing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  ring: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: colors.secondary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  steps: { alignSelf: 'stretch', gap: spacing.md, marginVertical: spacing.xl },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)', paddingBottom: spacing.sm },
  errorBox: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center' },
});
