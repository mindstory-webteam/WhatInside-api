import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { notificationApi } from '@/api/endpoints';

import { ensureAndroidChannel, notificationPermission } from './local';

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'simulator' | 'permission' | 'expo_go' | 'no_project_id' | 'error'; message?: string };

/**
 * Register this device for server-sent Expo push notifications.
 * Requirements: a physical device, notification permission, a development or
 * production build (Expo Go on Android no longer supports remote push), and
 * an EAS projectId. Failures are reported, never thrown — local reminders keep working.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android') {
    return { ok: false, reason: 'expo_go' };
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'no_project_id' };
  await ensureAndroidChannel();
  if ((await notificationPermission(true)) !== 'granted') return { ok: false, reason: 'permission' };
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await notificationApi.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android',
      Device.deviceName ?? Device.modelName ?? '');
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}
