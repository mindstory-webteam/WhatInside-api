import { __setBaseUrlForTests, ApiError, onSessionExpired, request } from '@/api/client';
import { resolveApiUrl } from '@/api/config';
import { householdStore } from '@/api/householdStore';
import { tokenStorage } from '@/auth/tokenStorage';

const fail = (p: Promise<unknown>): Promise<ApiError> => p.then(() => { throw new Error('expected failure'); }, (e) => e as ApiError);

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

describe('API client', () => {
  const fetchMock = jest.fn();
  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    __setBaseUrlForTests('https://api.test');
    await tokenStorage.save({ access: 'a1', refresh: 'r1' });
    await householdStore.set(7);
  });

  it('sends auth, household and idempotency headers', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: 1 }));
    await request('/inventory/', { query: { search: 'milk tea', page: 2 }, idempotencyKey: 'k1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/api/v1/inventory/?search=milk%20tea&page=2');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer a1', 'X-Household-ID': '7', 'Idempotency-Key': 'k1' });
  });

  it('normalises server validation errors', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: { code: 'validation_error', message: 'quantity: bad',
      details: { quantity: ['Must be greater than zero.'], new_product: { name: ['Required'] } } } }));
    const err: ApiError = await fail(request('/x/'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('validation');
    expect(err.fieldErrors()).toEqual({ quantity: 'Must be greater than zero.', 'new_product.name': 'Required' });
  });

  it('maps statuses to kinds and hides server internals', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('html'); } });
    const err: ApiError = await fail(request('/x/'));
    expect(err.kind).toBe('server');
    expect(err.message).toMatch(/server had a problem/);
    fetchMock.mockResolvedValueOnce(json(409, { error: { code: 'conflict', message: 'changed', details: null } }));
    expect((await fail(request('/x/'))).kind).toBe('conflict');
  });

  it('reports network failures as offline errors', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const err: ApiError = await fail(request('/x/'));
    expect(err.kind).toBe('network');
    expect(err.isOffline).toBe(true);
  });

  it('times out slow requests', async () => {
    fetchMock.mockImplementationOnce((_u, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const err: ApiError = await fail(request('/x/', { timeoutMs: 10 }));
    expect(err.kind).toBe('timeout');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'token_not_valid', message: 'expired', details: null } }))
      .mockResolvedValueOnce(json(200, { access: 'a2', refresh: 'r2' }))
      .mockResolvedValueOnce(json(200, { id: 1 }));
    await expect(request('/me/')).resolves.toEqual({ id: 1 });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/api/v1/auth/token/refresh/');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer a2');
    expect(await tokenStorage.load()).toEqual({ access: 'a2', refresh: 'r2' });
  });

  it('signals session expiry when the refresh token is rejected', async () => {
    const expired = jest.fn();
    onSessionExpired(expired);
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(401, { error: { code: 'token_not_valid', message: 'blacklisted', details: null } }));
    const err: ApiError = await fail(request('/me/'));
    expect(err.code).toBe('session_expired');
    expect(expired).toHaveBeenCalled();
    expect(await tokenStorage.load()).toBeNull();
  });
});

describe('API URL resolution', () => {
  it('requires https in production and never falls back to localhost', () => {
    expect(() => resolveApiUrl('http://api.example.com', false, undefined, false)).toThrow(/https/);
    expect(() => resolveApiUrl(undefined, false)).toThrow(/not configured/);
    expect(resolveApiUrl('https://api.example.com/', false)).toBe('https://api.example.com');
  });

  it('allows an HTTP server only when explicitly enabled for test builds', () => {
    expect(resolveApiUrl('http://168.144.83.52/', false, undefined, true)).toBe('http://168.144.83.52');
  });

  it('derives the dev machine LAN address in development', () => {
    expect(resolveApiUrl(undefined, true, '192.168.1.20:8081')).toBe('http://192.168.1.20:8000');
    expect(resolveApiUrl('http://10.0.2.2:8000', true)).toBe('http://10.0.2.2:8000');
  });
});
