import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { LoadingState } from '@/components/States';
import { Txt } from '@/components/Txt';
import { colors, spacing } from '@/theme/tokens';

import type { CameraPermissionUi } from './permission';
import { Icon } from '@/components/Icon';

export function PermissionGate({ state, onRequest, onUpload, onManual }: {
  state: CameraPermissionUi; onRequest: () => void; onUpload?: () => void; onManual: () => void;
}) {
  const { t } = useTranslation();
  if (state === 'loading') return <LoadingState />;
  return (
    <View style={styles.root} testID="camera-permission">
      <Icon name="camera-off-outline" size={56} color={colors.secondary} />
      <Txt variant="title" style={styles.center}>{t('ocr.permissionTitle')}</Txt>
      <Txt variant="muted" style={styles.center}>
        {state === 'blocked' ? t('ocr.permissionDenied') : t('ocr.permissionBody')}
      </Txt>
      {state === 'ask' ? <Button title={t('ocr.allow')} icon="camera" onPress={onRequest} testID="allow-camera" />
        : <Button title={t('ocr.openSettings')} icon="cog-outline" onPress={() => Linking.openSettings()} />}
      {onUpload ? <Button title={t('ocr.gallery')} variant="outline" icon="image-outline" onPress={onUpload} /> : null}
      <Button title={t('ocr.manualInstead')} variant="ghost" onPress={onManual} testID="manual-fallback" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center', alignItems: 'stretch' },
  center: { textAlign: 'center' },
});
