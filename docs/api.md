# WhatInside API (v1)

Base path: `/api/v1/`. Interactive docs: `/api/docs/` (Swagger UI). Machine-readable schema: [`openapi.yaml`](openapi.yaml) (regenerate with `python manage.py spectacular --file ../docs/openapi.yaml`).

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <access JWT>`. Access tokens last 15 min; refresh tokens 30 days, rotated on every refresh, old ones blacklisted. |
| Household | Send `X-Household-ID: <id>` (or `?household=<id>`). If omitted, the caller's first household is used. Non-members get 404. |
| Pagination | `?page=N&page_size=M` (max 100). Responses: `{count, next, previous, results}`. |
| Errors | Always `{"error": {"code", "message", "details"}}`. `details` holds field errors for 400s. No tracebacks are ever returned. |
| Idempotency | `Idempotency-Key: <uuid>` on POST create/consume/finish/discard/restock, `/scanning/confirm/`, `/shopping-list/{id}/add-to-inventory/`. Replays return the original response with header `Idempotent-Replayed: true`. |
| Concurrency | Include `version` (from the batch) in PATCH / quantity actions. A stale version returns **409 conflict**. |
| Dates | `YYYY-MM-DD`, date-only, never timezone-shifted. Timestamps are ISO-8601 UTC. |
| Rate limits | auth 20/min, password reset 5/hour, scanning 30/min (configurable). |

## Endpoints

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register/` | `{email, name, password, preferred_language?, timezone?}` → `{access, refresh, user}` |
| POST | `/auth/login/` | `{email, password}` → `{access, refresh, user}` |
| POST | `/auth/token/refresh/` | `{refresh}` → `{access, refresh}` (rotated) |
| POST | `/auth/logout/` | `{refresh}` → 205; blacklists it |
| POST | `/auth/logout-all/` | revoke every refresh token |
| POST | `/auth/password-reset/` | `{email}` → 202 always (no account enumeration) |
| POST | `/auth/password-reset/confirm/` | `{uid, token, new_password}`; signs out all devices |
| POST | `/auth/change-password/` | `{current_password, new_password}` |
| GET/PATCH | `/auth/me/` | profile: name, preferred_language, timezone, date_format, unit_system |
| DELETE | `/auth/me/` | `{password}` — deletes account; shared households are transferred, solo households deleted |

### Households
| Method | Path | Role |
|---|---|---|
| GET/POST | `/households/` | any / creator becomes owner |
| GET/PATCH/DELETE | `/households/{id}/` | member / admin / owner |
| GET | `/households/{id}/members/` | member |
| PATCH/DELETE | `/households/{id}/members/{member_id}/` | owner (role) / admin (remove members), owner (remove admins) |
| POST | `/households/{id}/members/{member_id}/make-owner/` | owner |
| GET/POST | `/households/{id}/invitations/` | admin — returns a shareable `code` (7-day expiry, single use, optional email lock) |
| DELETE | `/households/{id}/invitations/{invitation_id}/` | admin |
| POST | `/households/join/` | `{code}` |
| POST | `/households/{id}/leave/` | non-owners |

### Products
`GET/POST /products/`, `GET/PATCH/DELETE /products/{id}/`, `GET /products/search/?q=` (includes `active_quantity`, `active_batch_count`). Filters: `category`, `barcode`, `search`, `ordering`. Multipart upload of `image` (≤5 MB) supported.

### Inventory batches
| Method | Path | Body |
|---|---|---|
| GET | `/inventory/` | filters: `storage_location`, `status` (default active), `category`, `product`, `expiry_status` (fresh / expiring_soon / expired / unknown), `needs_review`, `expiry_from`, `expiry_to`, `search`, `ordering` (`product_name`, `effective_expiry`, `-created_at`) |
| POST | `/inventory/` | `{product | new_product{name, brand, barcode, category, default_unit}, quantity, unit, storage_location, purchase_date, manufacturing_date, expiry_date, best_before_date, expiry_confirmed, batch_number, purchase_price, notes}` |
| GET/PATCH/DELETE | `/inventory/{id}/` | PATCH accepts the same fields + `version`. Changing a date without `expiry_confirmed: true` re-flags it for review. |
| POST | `/inventory/{id}/consume/` | `{quantity, note?, version?}` |
| POST | `/inventory/{id}/finish/` | `{version?}` — uses up the rest |
| POST | `/inventory/{id}/discard/` | `{quantity? (default all), reason: expired|spoiled|damaged|not_needed|other, note?, version?}` |
| POST | `/inventory/{id}/restock/` | `{quantity}` — same batch, same dates |
| GET | `/inventory/{id}/history/` | events for one batch |
| GET | `/inventory/activity/` | recent household events |

Each batch response includes `expiry_status`, `days_until_expiry`, `needs_review`, `effective_expiry` (expiry or best-before), `unit_price`, `version`.

### Scanning
| Method | Path | Notes |
|---|---|---|
| POST | `/scanning/ocr/` | JSON `{raw_text, date_order?: dmy|mdy}` (on-device ML Kit text) **or** multipart `image` (JPEG/PNG/WebP ≤ 8 MB, server Tesseract). Returns `fields` (value, confidence, uncertain, note), `date_candidates`, `warnings`, `raw_text`. Never saves anything. Images are processed in memory and not stored. |
| POST | `/scanning/barcode/` | `{barcode}` (GTIN check digit validated). Household product first, then Open Food Facts (configurable). `status`: found / not_found / provider_timeout / provider_unavailable / provider_disabled. Never returns an expiry date. |
| POST | `/scanning/confirm/` | Same body as POST `/inventory/` plus `confirmed: true` and `source`. Without `confirmed: true` → 400. |

### Shopping list
`GET/POST /shopping-list/`, `PATCH/DELETE /shopping-list/{id}/`, `POST /shopping-list/{id}/mark-purchased/` (idempotent), `POST /shopping-list/{id}/mark-unpurchased/`, `POST /shopping-list/clear-purchased/`, `POST /shopping-list/{id}/add-to-inventory/` `{storage_location, quantity?, expiry_date? | best_before_date? | expiry_unknown: true, purchase_price?, category?}` — an expiry decision is required. Items include `in_inventory` when the same product is already at home.

### Dashboard & analytics
`GET /dashboard/summary/` (counts by status and storage, shopping count, unread reminders, household-local `today`), `GET /dashboard/expiring-soon/?days=7`, `GET /dashboard/expired/`, `GET /dashboard/review-required/`, `GET /analytics/overview/?months=6` (added/consumed/discarded/used-before-expiry, monthly activity in household time), `GET /analytics/waste/?months=6` (estimated waste cost with coverage, by reason, frequently discarded). Money values are **estimates** from entered purchase prices.

### Notifications
`GET /notifications/` (history; `?upcoming=true` for scheduled), `POST /notifications/mark-all-read/`, `GET/PATCH /notifications/preferences/` `{enabled, days_before_expiry: [7,3,1,0], delivery_methods: ["local","push"], reminder_hour}`, `POST /notifications/register-device/` `{token: "ExponentPushToken[...]", platform, device_name}`, `GET /notifications/devices/`, `DELETE /notifications/devices/{id}/`.

Delivery statuses: `pending`, `sent` (push accepted by Expo), `local_only` (user relies on on-device reminders / no device registered), `failed`, `cancelled` (batch changed/closed or preference turned off).
