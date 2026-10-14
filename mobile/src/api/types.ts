/** Typed request/response interfaces matching the Django REST API (/api/v1). */

export type ID = number;
export type ISODate = string; // YYYY-MM-DD, timezone-free
export type ISODateTime = string;

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}

export type Language = 'en' | 'ml';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface User {
  id: ID;
  phone: string | null;
  email: string | null;
  name: string;
  preferred_language: Language;
  timezone: string;
  date_format: DateFormat;
  unit_system: 'metric' | 'imperial';
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export type OtpPurpose = 'register' | 'reset';

export interface OtpResponse {
  sent_to: string;
  resend_in: number;
  expires_in: number;
  /** Only present while the server's testing switch is on. */
  dev_code?: string;
}

export type Role = 'owner' | 'admin' | 'member';

export interface Household {
  id: ID;
  name: string;
  owner: ID;
  timezone: string;
  created_at: ISODateTime;
  my_role: Role | null;
  member_count: number;
}

export interface Member {
  id: ID;
  user: ID;
  name: string;
  email: string | null;
  phone?: string | null;
  role: Role;
  status: string;
  joined_at: ISODateTime;
}

export interface Invitation {
  id: ID;
  email: string;
  role: 'admin' | 'member';
  code: string;
  expires_at: ISODateTime;
  created_at: ISODateTime;
}

export type Category =
  | 'dairy' | 'meat_seafood' | 'produce' | 'bakery' | 'beverages' | 'frozen' | 'grains' | 'snacks'
  | 'condiments' | 'household' | 'personal_care' | 'medicine' | 'other';

export type Unit = 'pcs' | 'g' | 'kg' | 'ml' | 'l' | 'pack' | 'dozen' | 'bottle' | 'can' | 'oz' | 'lb';

export type StorageLocation = 'refrigerator' | 'freezer' | 'pantry' | 'other';
export type BatchStatus = 'active' | 'finished' | 'discarded';
export type ExpiryStatus = 'fresh' | 'expiring_soon' | 'expired' | 'unknown';
export type DiscardReason = 'expired' | 'spoiled' | 'damaged' | 'not_needed' | 'other';

export interface ProductSummary {
  id: ID;
  name: string;
  brand: string;
  barcode: string;
  category: Category;
  default_unit: Unit;
  image: string | null;
  image_url: string;
}

export interface Product extends ProductSummary {
  household: ID;
  active_quantity?: string;
  active_batch_count?: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Batch {
  id: ID;
  product: ProductSummary;
  storage_location: StorageLocation;
  quantity: string; // decimals are strings to avoid float drift
  initial_quantity: string;
  unit: Unit;
  purchase_date: ISODate | null;
  manufacturing_date: ISODate | null;
  expiry_date: ISODate | null;
  best_before_date: ISODate | null;
  effective_expiry: ISODate | null;
  expiry_confirmed: boolean;
  batch_number: string;
  purchase_price: string | null;
  unit_price: string | null;
  status: BatchStatus;
  notes: string;
  version: number;
  expiry_status: ExpiryStatus;
  days_until_expiry: number | null;
  needs_review: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface NewProductInput {
  name: string;
  brand?: string;
  barcode?: string;
  category?: Category;
  default_unit?: Unit;
  image_url?: string;
}

export interface BatchInput {
  product?: ID;
  new_product?: NewProductInput;
  storage_location: StorageLocation;
  quantity: string | number;
  unit?: Unit;
  purchase_date?: ISODate | null;
  manufacturing_date?: ISODate | null;
  expiry_date?: ISODate | null;
  best_before_date?: ISODate | null;
  expiry_confirmed?: boolean;
  batch_number?: string;
  purchase_price?: string | number | null;
  notes?: string;
}

export type BatchUpdate = Partial<Omit<BatchInput, 'new_product'>> & { version?: number };

export interface InventoryEvent {
  id: ID;
  batch: ID | null;
  product: ID | null;
  product_name: string;
  event_type: 'added' | 'consumed' | 'discarded' | 'restocked' | 'adjusted' | 'finished' | 'deleted';
  quantity_change: string;
  unit: Unit;
  reason: string;
  note: string;
  price: string | null;
  before_expiry: boolean | null;
  actor: ID | null;
  actor_name: string | null;
  created_at: ISODateTime;
}

export interface InventoryQuery {
  storage_location?: StorageLocation;
  status?: BatchStatus | BatchStatus[];
  category?: Category;
  expiry_status?: ExpiryStatus;
  needs_review?: boolean;
  search?: string;
  ordering?: string;
  expiry_from?: ISODate;
  expiry_to?: ISODate;
  product?: ID;
  page?: number;
  page_size?: number;
}

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface OcrField<T = string | number | null> {
  value: T;
  confidence: Confidence;
  source: string;
  note: string;
  uncertain: boolean;
}

export interface DateCandidate {
  raw: string;
  line: number;
  label: 'manufacturing' | 'packed' | 'expiry' | 'use_by' | 'best_before' | 'unknown';
  value: ISODate | null;
  precision: 'day' | 'month' | 'relative';
  ambiguous: boolean;
  alternatives: string[];
  note: string;
  label_source?: 'same_line' | 'adjacent_line' | 'none';
}

export interface OcrResult {
  raw_text: string;
  lines: string[];
  fields: {
    name: OcrField<string | null>;
    brand: OcrField<string | null>;
    quantity: OcrField<number | null>;
    unit: OcrField<string | null>;
    manufacturing_date: OcrField<ISODate | null>;
    expiry_date: OcrField<ISODate | null>;
    best_before_date: OcrField<ISODate | null>;
    batch_number: OcrField<string | null>;
  };
  date_candidates: DateCandidate[];
  warnings: string[];
  requires_review: true;
  ocr_source: 'device' | 'server';
}

export interface BarcodeResult {
  found: boolean;
  status: 'found' | 'not_found' | 'provider_timeout' | 'provider_unavailable' | 'provider_disabled';
  source: 'household' | 'provider';
  product: {
    name: string;
    brand: string;
    barcode: string;
    category: Category;
    quantity: number | null;
    unit: Unit | null;
    image_url: string;
  };
  existing_product: Product | null;
  note: string;
}

export interface ConfirmScanInput extends BatchInput {
  confirmed: true;
  source: 'ocr' | 'barcode' | 'manual';
}

export interface ShoppingItem {
  id: ID;
  product_name: string;
  product: ID | null;
  quantity: string;
  unit: Unit;
  note: string;
  is_purchased: boolean;
  purchased_at: ISODateTime | null;
  added_to_inventory: ID | null;
  in_inventory: { quantity: string; unit: Unit; batches: number } | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AddToInventoryInput {
  storage_location: StorageLocation;
  quantity?: string;
  expiry_date?: ISODate | null;
  best_before_date?: ISODate | null;
  expiry_unknown?: boolean;
  purchase_price?: string | null;
  category?: Category;
}

export interface DashboardSummary {
  household: { id: ID; name: string; timezone: string };
  today: ISODate;
  expiring_soon_days: number;
  total_active_batches: number;
  expiring_soon: number;
  expired: number;
  review_required: number;
  storage: Record<StorageLocation, number>;
  shopping_list_count: number;
  unread_notifications: number;
}

export interface AnalyticsOverview {
  period_months: number;
  total_products_added: number;
  products_consumed: number;
  products_discarded: number;
  expiry_related_waste: number;
  products_used_before_expiry: number;
  recorded_value_used: string | null;
  active_batches: number;
  monthly_activity: { month: string; added: number; consumed: number; discarded: number }[];
  notes: Record<string, string>;
}

export interface WasteAnalytics {
  period_months: number;
  discard_count: number;
  estimated_waste_cost: string | null;
  estimate_coverage: { priced_discards: number; total_discards: number };
  by_reason: Record<string, number>;
  frequently_discarded: { product_name: string; times: number; estimated_cost: string | null }[];
  disclaimer: string;
}

export type ReminderOffset = 7 | 3 | 1 | 0;

export interface NotificationPreferences {
  enabled: boolean;
  days_before_expiry: ReminderOffset[];
  delivery_methods: ('local' | 'push')[];
  reminder_hour: number;
  updated_at?: ISODateTime;
}

export interface NotificationRecord {
  id: ID;
  household: ID;
  batch: ID | null;
  notification_type: string;
  days_before: number;
  expiry_date: ISODate;
  scheduled_for: ISODateTime;
  status: 'pending' | 'sent' | 'local_only' | 'failed' | 'cancelled' | 'skipped';
  title: string;
  body: string;
  sent_at: ISODateTime | null;
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface DeviceRegistration {
  id: ID;
  token: string;
  platform: 'ios' | 'android' | 'web';
  device_name: string;
  is_active: boolean;
}
