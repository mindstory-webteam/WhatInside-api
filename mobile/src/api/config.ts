import Constants from 'expo-constants';

/**
 * Resolve the API base URL.
 *
 * 1. EXPO_PUBLIC_API_URL always wins (inlined at build time by Expo).
 * 2. In development only, fall back to the Metro host's IP on port 8000, which
 *    works for physical devices on the same Wi-Fi and for simulators.
 * 3. Release builds never fall back to localhost: a missing or non-HTTPS URL
 *    is a configuration error — unless EXPO_PUBLIC_ALLOW_HTTP=true was set for a
 *    temporary test build against an HTTP-only server.
 */
export function resolveApiUrl(
  envUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  isDev: boolean = typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  hostUri: string | undefined = Constants.expoConfig?.hostUri,
  allowHttp: boolean = process.env.EXPO_PUBLIC_ALLOW_HTTP === 'true',
): string {
  const trimmed = envUrl?.trim().replace(/\/+$/, '');
  if (trimmed) {
    if (!isDev && !allowHttp && !trimmed.startsWith('https://')) {
      throw new Error('EXPO_PUBLIC_API_URL must use https:// in production builds.');
    }
    return trimmed;
  }
  if (isDev) {
    const host = hostUri?.split(':')[0];
    return `http://${host || 'localhost'}:8000`;
  }
  throw new Error('EXPO_PUBLIC_API_URL is not configured for this build.');
}

export const REQUEST_TIMEOUT_MS = 15000;
export const UPLOAD_TIMEOUT_MS = 45000;
