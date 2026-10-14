import * as SecureStore from 'expo-secure-store';

import type { AuthTokens } from '@/api/types';

/** JWTs live only in the OS keychain/keystore (SecureStore), never in AsyncStorage. */
const ACCESS = 'wi.access';
const REFRESH = 'wi.refresh';

let memory: AuthTokens | null = null;

export const tokenStorage = {
  async load(): Promise<AuthTokens | null> {
    if (memory) return memory;
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(ACCESS),
      SecureStore.getItemAsync(REFRESH),
    ]);
    memory = access && refresh ? { access, refresh } : null;
    return memory;
  },
  async save(tokens: AuthTokens): Promise<void> {
    memory = tokens;
    await Promise.all([
      SecureStore.setItemAsync(ACCESS, tokens.access),
      SecureStore.setItemAsync(REFRESH, tokens.refresh),
    ]);
  },
  async clear(): Promise<void> {
    memory = null;
    await Promise.all([SecureStore.deleteItemAsync(ACCESS), SecureStore.deleteItemAsync(REFRESH)]);
  },
  peek(): AuthTokens | null {
    return memory;
  },
};
