# Delivery checklist

Status as of 12 Oct 2026. ✅ = implemented and verified in this environment; ⚠️ = implemented, needs your hardware/credentials to verify.

## Phases

- [x] **1. Inspect & plan** — empty workspace; new monorepo `backend/` + `mobile/` + `deploy/` + `docs/`.
- [x] **2. Backend core** — custom email-login user, households with owner/admin/member roles, invitations, JWT (rotation + blacklist), permissions, household isolation.
- [x] **3. Inventory APIs** — products, multi-batch inventory with events, transactions, row locks, idempotency keys, optimistic `version`, shopping list, dashboard, analytics.
- [x] **4. Scanning** — label-aware OCR normaliser, server Tesseract OCR with upload validation, Open Food Facts barcode provider with GTIN validation, confirm-before-save endpoint.
- [x] **5. Notifications** — preferences (7/3/1/0 days, hour, local/push), device registration, idempotent scheduler, Celery task + cron command, Expo push dispatch.
- [x] **6. Mobile app** — every screen in the brief (splash/onboarding, auth, household setup, dashboard, add, OCR camera/processing/review, barcode, inventory views, batch detail/edit/new batch, shopping, reminders, insights, search, settings/profile/household/family/reminders/privacy/delete account), English + Malayalam.
- [x] **7. Integration & offline** — typed API client, token refresh, React Query with persisted cache, offline action queue, sync banner, local reminder sync.
- [x] **8. Checks** — see below.
- [x] **9. Docs & deployment** — README, API, mobile, deployment, troubleshooting, Docker Compose (dev + prod with Nginx/HTTPS), backup/restore scripts.

## Verification run here

| Check | Result |
|---|---|
| `pytest` on PostgreSQL 16 | ✅ 85 passed (incl. real Tesseract OCR on a generated label image) |
| `scripts/smoke_test.py` against runserver | ✅ register → household → OCR → confirm (+ idempotent replay) → second batch → consume/discard → dashboard → shopping → reminders → account deletion |
| Gunicorn + `config.settings.prod` + `check --deploy` | ✅ |
| OpenAPI schema `spectacular --validate` | ✅ 0 warnings, 0 errors |
| `makemigrations --check` | ✅ no pending changes |
| `tsc --noEmit` | ✅ |
| Jest (61 tests) | ✅ |
| `expo export --platform android` (Metro/Hermes bundle of all routes) | ✅ |
| `docker compose config` (dev + prod) | ✅ |

## Needs your environment

- ⚠️ `docker build` / `docker compose up` — no Docker daemon was available here (files validated with `compose config`; the same commands ran natively).
- ⚠️ Running the app on a device/emulator (camera, ML Kit, notifications are native) — build with `npx expo run:android|ios` or EAS.
- ⚠️ Push notifications — needs `EAS_PROJECT_ID`, FCM V1 key (Android), APNs key (iOS).
- ⚠️ Production: domain, TLS certificate, SMTP credentials, store developer accounts, your own bundle identifiers.
- ⚠️ Malayalam strings cover the main flows; remaining keys fall back to English — have a native speaker review.

## Ideas for later

- Household-level shared purchase price analytics per category; CSV export.
- Server-side scheduled "weekly summary" notifications.
- Product images upload from the review screen (API already accepts `image`).
