import { Stack } from 'expo-router';

import { useReminderSync } from '@/notifications/useReminderSync';
import { colors } from '@/theme/tokens';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  useReminderSync();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scan/ocr" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="scan/barcode" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
