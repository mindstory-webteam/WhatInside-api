import { UPLOAD_TIMEOUT_MS } from './config';
import { request } from './client';
import type {
  AddToInventoryInput, AnalyticsOverview, AuthResponse, BarcodeResult, Batch, BatchInput, BatchUpdate,
  ConfirmScanInput, DashboardSummary, DeviceRegistration, DiscardReason, Household, ID, InventoryEvent,
  InventoryQuery, Invitation, Member, OtpPurpose, OtpResponse, NotificationPreferences, NotificationRecord, OcrResult, Paginated, Product,
  Role, ShoppingItem, User, WasteAnalytics,
} from './types';

const noHousehold = { household: false } as const;

export const authApi = {
  /** Step 1 of sign-up / reset: text a code to the number. */
  sendOtp: (phone: string, purpose: OtpPurpose) =>
    request<OtpResponse>('/auth/otp/', { method: 'POST', body: { phone, purpose }, auth: false, household: false }),
  /** Step 2 of sign-up: code + profile → account + tokens. */
  register: (data: { phone: string; otp: string; name: string; password: string; preferred_language?: string;
    timezone?: string }) =>
    request<AuthResponse>('/auth/register/', { method: 'POST', body: data, auth: false, household: false }),
  /** Mobile number + password. An email still works for accounts made before mobile sign-up. */
  login: (identifier: string, password: string) =>
    request<AuthResponse>('/auth/login/', {
      method: 'POST', auth: false, household: false,
      body: identifier.includes('@') ? { email: identifier, password } : { phone: identifier, password },
    }),
  logout: (refresh: string) => request<void>('/auth/logout/', { method: 'POST', body: { refresh }, ...noHousehold }),
  me: () => request<User>('/auth/me/', noHousehold),
  updateMe: (data: Partial<User>) => request<User>('/auth/me/', { method: 'PATCH', body: data, ...noHousehold }),
  requestPasswordReset: (phone: string) =>
    request<OtpResponse>('/auth/password-reset/', { method: 'POST', body: { phone }, auth: false, household: false }),
  confirmPasswordReset: (phone: string, otp: string, new_password: string) =>
    request<void>('/auth/password-reset/confirm/', {
      method: 'POST', body: { phone, otp, new_password }, auth: false, household: false,
    }),
  /** Older email accounts: the link/code that arrived by email. */
  confirmPasswordResetEmail: (uid: string, token: string, new_password: string) =>
    request<void>('/auth/password-reset/confirm/', {
      method: 'POST', body: { uid, token, new_password }, auth: false, household: false,
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password/', { method: 'POST', body: { current_password, new_password }, ...noHousehold }),
  deleteAccount: (password: string) =>
    request<void>('/auth/me/', { method: 'DELETE', body: { password }, ...noHousehold }),
};

export const householdApi = {
  list: () => request<Paginated<Household>>('/households/', noHousehold),
  create: (name: string, timezone: string) =>
    request<Household>('/households/', { method: 'POST', body: { name, timezone }, ...noHousehold }),
  update: (id: ID, data: Partial<Pick<Household, 'name' | 'timezone'>>) =>
    request<Household>(`/households/${id}/`, { method: 'PATCH', body: data, ...noHousehold }),
  members: (id: ID) => request<Member[]>(`/households/${id}/members/`, noHousehold),
  setRole: (id: ID, memberId: ID, role: Exclude<Role, 'owner'>) =>
    request<Member>(`/households/${id}/members/${memberId}/`, { method: 'PATCH', body: { role }, ...noHousehold }),
  removeMember: (id: ID, memberId: ID) =>
    request<void>(`/households/${id}/members/${memberId}/`, { method: 'DELETE', ...noHousehold }),
  invitations: (id: ID) => request<Invitation[]>(`/households/${id}/invitations/`, noHousehold),
  invite: (id: ID, data: { email?: string; role: 'admin' | 'member' }) =>
    request<Invitation>(`/households/${id}/invitations/`, { method: 'POST', body: data, ...noHousehold }),
  join: (code: string) => request<Household>('/households/join/', { method: 'POST', body: { code }, ...noHousehold }),
  leave: (id: ID) => request<void>(`/households/${id}/leave/`, { method: 'POST', ...noHousehold }),
};

export const productApi = {
  search: (q: string) => request<Paginated<Product>>('/products/search/', { query: { q, page_size: 20 } }),
  list: (query: Record<string, string | number | undefined> = {}) => request<Paginated<Product>>('/products/', { query }),
  get: (id: ID) => request<Product>(`/products/${id}/`),
  update: (id: ID, data: Partial<Product>) => request<Product>(`/products/${id}/`, { method: 'PATCH', body: data }),
  remove: (id: ID) => request<void>(`/products/${id}/`, { method: 'DELETE' }),
};

export const inventoryApi = {
  list: (query: InventoryQuery = {}) =>
    request<Paginated<Batch>>('/inventory/', { query: query as Record<string, string | number | boolean | string[]> }),
  get: (id: ID) => request<Batch>(`/inventory/${id}/`),
  create: (data: BatchInput, idempotencyKey?: string) =>
    request<Batch>('/inventory/', { method: 'POST', body: data, idempotencyKey }),
  update: (id: ID, data: BatchUpdate) => request<Batch>(`/inventory/${id}/`, { method: 'PATCH', body: data }),
  remove: (id: ID) => request<void>(`/inventory/${id}/`, { method: 'DELETE' }),
  consume: (id: ID, quantity: string, version?: number, idempotencyKey?: string) =>
    request<Batch>(`/inventory/${id}/consume/`, { method: 'POST', body: { quantity, version }, idempotencyKey }),
  finish: (id: ID, version?: number, idempotencyKey?: string) =>
    request<Batch>(`/inventory/${id}/finish/`, { method: 'POST', body: { version }, idempotencyKey }),
  discard: (id: ID, data: { quantity?: string; reason: DiscardReason; note?: string; version?: number },
            idempotencyKey?: string) =>
    request<Batch>(`/inventory/${id}/discard/`, { method: 'POST', body: data, idempotencyKey }),
  restock: (id: ID, quantity: string, idempotencyKey?: string) =>
    request<Batch>(`/inventory/${id}/restock/`, { method: 'POST', body: { quantity }, idempotencyKey }),
  history: (id: ID) => request<Paginated<InventoryEvent>>(`/inventory/${id}/history/`),
  activity: (pageSize = 10) => request<Paginated<InventoryEvent>>('/inventory/activity/', { query: { page_size: pageSize } }),
};

export const scanApi = {
  ocrText: (raw_text: string, date_order?: 'dmy' | 'mdy') =>
    request<OcrResult>('/scanning/ocr/', { method: 'POST', body: { raw_text, date_order } }),
  /** Server-side OCR. The photo travels as base64 in a JSON body (works the same in Expo Go and native builds). */
  ocrImage: (imageBase64: string, date_order?: 'dmy' | 'mdy') =>
    request<OcrResult>('/scanning/ocr/', {
      method: 'POST', body: { image_base64: imageBase64, date_order }, timeoutMs: UPLOAD_TIMEOUT_MS,
    }),
  barcode: (barcode: string) => request<BarcodeResult>('/scanning/barcode/', { method: 'POST', body: { barcode } }),
  confirm: (data: ConfirmScanInput, idempotencyKey?: string) =>
    request<Batch>('/scanning/confirm/', { method: 'POST', body: data, idempotencyKey }),
};

export const shoppingApi = {
  list: () => request<Paginated<ShoppingItem>>('/shopping-list/', { query: { page_size: 100 } }),
  create: (data: Partial<ShoppingItem>, idempotencyKey?: string) =>
    request<ShoppingItem>('/shopping-list/', { method: 'POST', body: data, idempotencyKey }),
  update: (id: ID, data: Partial<ShoppingItem>) =>
    request<ShoppingItem>(`/shopping-list/${id}/`, { method: 'PATCH', body: data }),
  remove: (id: ID) => request<void>(`/shopping-list/${id}/`, { method: 'DELETE' }),
  markPurchased: (id: ID) => request<ShoppingItem>(`/shopping-list/${id}/mark-purchased/`, { method: 'POST' }),
  markUnpurchased: (id: ID) => request<ShoppingItem>(`/shopping-list/${id}/mark-unpurchased/`, { method: 'POST' }),
  addToInventory: (id: ID, data: AddToInventoryInput, idempotencyKey?: string) =>
    request<Batch>(`/shopping-list/${id}/add-to-inventory/`, { method: 'POST', body: data, idempotencyKey }),
  clearPurchased: () => request<void>('/shopping-list/clear-purchased/', { method: 'POST' }),
};

export const dashboardApi = {
  summary: () => request<DashboardSummary>('/dashboard/summary/'),
  expiringSoon: (days = 7) => request<Paginated<Batch>>('/dashboard/expiring-soon/', { query: { days } }),
  expired: () => request<Paginated<Batch>>('/dashboard/expired/'),
  reviewRequired: () => request<Paginated<Batch>>('/dashboard/review-required/'),
  overview: (months = 6) => request<AnalyticsOverview>('/analytics/overview/', { query: { months } }),
  waste: (months = 6) => request<WasteAnalytics>('/analytics/waste/', { query: { months } }),
};

export const notificationApi = {
  history: (upcoming = false) =>
    request<Paginated<NotificationRecord>>('/notifications/', { query: { upcoming: upcoming || undefined }, ...noHousehold }),
  markAllRead: () => request<void>('/notifications/mark-all-read/', { method: 'POST', ...noHousehold }),
  preferences: () => request<NotificationPreferences>('/notifications/preferences/', noHousehold),
  updatePreferences: (data: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>('/notifications/preferences/', { method: 'PATCH', body: data, ...noHousehold }),
  registerDevice: (token: string, platform: 'ios' | 'android' | 'web', device_name: string) =>
    request<DeviceRegistration>('/notifications/register-device/', {
      method: 'POST', body: { token, platform, device_name }, ...noHousehold,
    }),
  removeDevice: (id: ID) => request<void>(`/notifications/devices/${id}/`, { method: 'DELETE', ...noHousehold }),
};
