import { tokenStorage } from '@/auth/tokenStorage';

import { REQUEST_TIMEOUT_MS, resolveApiUrl } from './config';
import { householdStore } from './householdStore';
import type { ApiErrorBody, AuthTokens } from './types';

export type ErrorKind = 'network' | 'timeout' | 'auth' | 'forbidden' | 'not_found' | 'validation' | 'conflict'
  | 'rate_limited' | 'server' | 'unknown';

/** Normalised error thrown by every API call. */
export class ApiError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status: number = 0,
    public code: string = kind,
    public details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field → first message, for mapping server validation errors onto forms. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.details && typeof this.details === 'object' && !Array.isArray(this.details)) {
      for (const [k, v] of Object.entries(this.details as Record<string, unknown>)) {
        const first = Array.isArray(v) ? v[0] : v;
        if (typeof first === 'string') out[k] = first;
        else if (first && typeof first === 'object') {
          for (const [k2, v2] of Object.entries(first as Record<string, unknown>)) {
            if (typeof v2 === 'string' || Array.isArray(v2)) out[`${k}.${k2}`] = String(Array.isArray(v2) ? v2[0] : v2);
          }
        }
      }
    }
    return out;
  }

  get isOffline() {
    return this.kind === 'network' || this.kind === 'timeout';
  }
}

const kindForStatus = (status: number): ErrorKind => {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
};

export async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const err = body?.error;
  const fallback = res.status >= 500 ? 'The server had a problem. Please try again.' : `Request failed (${res.status}).`;
  return new ApiError(kindForStatus(res.status), err?.message || fallback, res.status, err?.code || kindForStatus(res.status),
    err?.details ?? null);
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  formData?: FormData;
  auth?: boolean;
  household?: boolean;
  timeoutMs?: number;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

let sessionExpiredHandler: (() => void) | null = null;
export const onSessionExpired = (fn: () => void) => {
  sessionExpiredHandler = fn;
};

let refreshing: Promise<AuthTokens | null> | null = null;

/** Single-flight refresh: concurrent 401s share one refresh request. */
async function refreshTokens(baseUrl: string): Promise<AuthTokens | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const current = await tokenStorage.load();
      if (!current) return null;
      try {
        const res = await fetchWithTimeout(`${baseUrl}/api/v1/auth/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refresh: current.refresh }),
        }, REQUEST_TIMEOUT_MS);
        if (!res.ok) {
          if (res.status === 401 || res.status === 400) {
            await tokenStorage.clear();
            sessionExpiredHandler?.();
          }
          return null;
        }
        const data = (await res.json()) as { access: string; refresh?: string };
        const tokens = { access: data.access, refresh: data.refresh ?? current.refresh };
        await tokenStorage.save(tokens);
        return tokens;
      } catch {
        return null; // offline: keep tokens, let caller surface a network error
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new ApiError('timeout', 'The request took too long. Check your connection and try again.');
    }
    throw new ApiError('network', 'You appear to be offline. Changes will sync when you reconnect.');
  } finally {
    clearTimeout(timer);
  }
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`));
  return parts.length ? `?${parts.join('&')}` : '';
}

let baseUrlCache: string | null = null;
export const getBaseUrl = () => (baseUrlCache ??= resolveApiUrl());
export const __setBaseUrlForTests = (url: string | null) => {
  baseUrlCache = url;
};

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const { method = 'GET', body, query, formData, auth = true, household = true } = opts;
  const url = `${baseUrl}/api/v1${path}${buildQuery(query)}`;

  const send = async (tokens: AuthTokens | null) => {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && tokens) headers.Authorization = `Bearer ${tokens.access}`;
    const hh = householdStore.get();
    if (household && hh) headers['X-Household-ID'] = String(hh);
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    return fetchWithTimeout(url, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  };

  let tokens = auth ? await tokenStorage.load() : null;
  let res = await send(tokens);
  if (res.status === 401 && auth && tokens) {
    tokens = await refreshTokens(baseUrl);
    if (!tokens) throw new ApiError('auth', 'Your session has expired. Please sign in again.', 401, 'session_expired');
    res = await send(tokens);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** User-facing message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
