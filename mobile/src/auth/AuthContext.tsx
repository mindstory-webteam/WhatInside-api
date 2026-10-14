import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';

import { onSessionExpired } from '@/api/client';
import { authApi, householdApi } from '@/api/endpoints';
import { householdStore } from '@/api/householdStore';
import type { AuthResponse, Household, User } from '@/api/types';
import { setLanguage } from '@/i18n';
import { toE164 } from '@/lib/phone';
import { cancelAllLocalReminders } from '@/notifications/local';

import { tokenStorage } from './tokenStorage';

export type AuthStatus = 'loading' | 'signedOut' | 'needsHousehold' | 'ready';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  households: Household[];
  household: Household | null;
  sessionExpired: boolean;
}

export type AuthAction =
  | { type: 'signedOut'; expired?: boolean }
  | { type: 'loaded'; user: User; households: Household[]; selectedId: number | null }
  | { type: 'user'; user: User }
  | { type: 'select'; id: number };

export const initialAuthState: AuthState = {
  status: 'loading', user: null, households: [], household: null, sessionExpired: false,
};

/** Pure state machine — unit tested. */
export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'signedOut':
      return { ...initialAuthState, status: 'signedOut', sessionExpired: !!action.expired };
    case 'loaded': {
      const household = action.households.find((h) => h.id === action.selectedId) ?? action.households[0] ?? null;
      return {
        status: household ? 'ready' : 'needsHousehold', user: action.user, households: action.households,
        household, sessionExpired: false,
      };
    }
    case 'user':
      return { ...state, user: action.user };
    case 'select': {
      const household = state.households.find((h) => h.id === action.id);
      return household ? { ...state, household, status: 'ready' } : state;
    }
    default:
      return state;
  }
}

interface AuthContextValue extends AuthState {
  /** ``identifier`` is a mobile number (any format) or, for old accounts, an email. */
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (data: { phone: string; otp: string; name: string; password: string; language: string }) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  selectHousehold: (id: number) => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const queryClient = useQueryClient();

  const reload = useCallback(async () => {
    const tokens = await tokenStorage.load();
    if (!tokens) {
      dispatch({ type: 'signedOut' });
      return;
    }
    try {
      const [user, households] = await Promise.all([authApi.me(), householdApi.list()]);
      let selected = householdStore.get() ?? (await householdStore.load());
      if (!households.results.some((h) => h.id === selected)) selected = households.results[0]?.id ?? null;
      await householdStore.set(selected);
      if (user.preferred_language) await setLanguage(user.preferred_language);
      dispatch({ type: 'loaded', user, households: households.results, selectedId: selected });
    } catch (e) {
      const err = e as { kind?: string };
      if (err.kind === 'auth') dispatch({ type: 'signedOut', expired: true });
      else if (state.user) return; // offline: keep the current session
      else {
        // Offline at cold start with saved tokens: allow cached browsing.
        const selected = await householdStore.load();
        const cached = queryClient.getQueryData<{ user: User; households: Household[] }>(['session']);
        if (cached) dispatch({ type: 'loaded', user: cached.user, households: cached.households, selectedId: selected });
        else dispatch({ type: 'signedOut' });
      }
    }
  }, [queryClient, state.user]);

  useEffect(() => {
    onSessionExpired(() => dispatch({ type: 'signedOut', expired: true }));
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.user) queryClient.setQueryData(['session'], { user: state.user, households: state.households });
  }, [state.user, state.households, queryClient]);

  const afterAuth = useCallback(async (res: AuthResponse) => {
    await tokenStorage.save({ access: res.access, refresh: res.refresh });
    queryClient.clear();
    await reload();
  }, [queryClient, reload]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    signIn: async (identifier, password) => {
      const id = identifier.trim();
      await afterAuth(await authApi.login(id.includes('@') ? id.toLowerCase() : toE164(id), password));
    },
    signUp: async ({ phone, otp, name, password, language }) => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      await afterAuth(await authApi.register({ phone: toE164(phone), otp: otp.trim(), name: name.trim(), password,
        preferred_language: language, timezone }));
    },
    signOut: async () => {
      const tokens = await tokenStorage.load();
      try {
        if (tokens) await authApi.logout(tokens.refresh);
      } catch {
        // offline or already invalid — local sign-out still proceeds
      }
      await tokenStorage.clear();
      await householdStore.set(null);
      await cancelAllLocalReminders().catch(() => undefined);
      queryClient.clear();
      dispatch({ type: 'signedOut' });
    },
    reload,
    selectHousehold: async (id) => {
      await householdStore.set(id);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      dispatch({ type: 'select', id });
    },
    setUser: (user) => dispatch({ type: 'user', user }),
  }), [state, afterAuth, reload, queryClient]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
