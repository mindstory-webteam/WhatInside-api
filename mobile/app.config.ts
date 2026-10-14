import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with environment-specific values.
 * - EXPO_PUBLIC_API_URL: the backend base URL (see README "API URL configuration").
 * - EXPO_PUBLIC_ALLOW_HTTP=true: TEMPORARY — lets test builds talk to a plain-HTTP API
 *   (e.g. http://168.144.83.52 before a domain + HTTPS exist). Android blocks cleartext
 *   traffic and iOS blocks non-HTTPS by default, so this switch also relaxes those
 *   native settings. Never set it for store builds.
 * - EAS_PROJECT_ID: required for Expo push tokens (eas init prints it).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const allowHttp = process.env.EXPO_PUBLIC_ALLOW_HTTP === 'true';
  const base = config as ExpoConfig;
  return {
    ...base,
    ios: allowHttp
      ? {
          ...base.ios,
          infoPlist: { ...base.ios?.infoPlist, NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } },
        }
      : base.ios,
    plugins: [
      ...(base.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: allowHttp } }],
    ],
    extra: {
      ...config.extra,
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
      eas: { projectId: process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId },
    },
  };
};
