import {
  AnekMalayalam_400Regular, AnekMalayalam_500Medium, AnekMalayalam_600SemiBold, AnekMalayalam_700Bold,
  AnekMalayalam_800ExtraBold, useFonts,
} from '@expo-google-fonts/anek-malayalam';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { router, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { SplashView } from '@/features/SplashView';
import { loadSavedLanguage } from '@/i18n';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000, // keep cached data for offline viewing
      retry: (count, error) => !(error instanceof ApiError && ['auth', 'forbidden', 'not_found', 'validation']
        .includes(error.kind)) && count < 2,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'always' },
  },
});

// Only non-sensitive server data is persisted (tokens live in SecureStore).
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'wi.query-cache.v1' });

function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const batchId = response.notification.request.content.data?.batchId;
      if (batchId) router.push(`/batch/${batchId}`);
    });
    return () => sub.remove();
  }, []);

  if (status === 'loading') return <SplashView />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsHousehold'}>
        <Stack.Screen name="household-setup" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'ready'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // Anek Malayalam covers English + Malayalam. If loading fails we carry on with system fonts.
  const [fontsLoaded, fontError] = useFonts({
    AnekMalayalam_400Regular, AnekMalayalam_500Medium, AnekMalayalam_600SemiBold, AnekMalayalam_700Bold,
    AnekMalayalam_800ExtraBold,
  });
  useEffect(() => {
    loadSavedLanguage().finally(() => setReady(true));
  }, []);
  if (!ready || (!fontsLoaded && !fontError)) return null; // native splash stays up meanwhile
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 7 * 24 * 60 * 60 * 1000,
          dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
        }}
      >
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
