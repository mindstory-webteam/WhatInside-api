# WhatInside

**Know what's inside. Never waste again.**

WhatInside tracks what's in your refrigerator, freezer and pantry, reads product names and expiry dates from labels (OCR), looks up barcodes, reminds the whole household before things expire, and shows how much is used vs. wasted.

| Part | Stack |
|---|---|
| `backend/` | Python 3.13 · Django 5.1 · Django REST Framework · PostgreSQL 16 · Simple JWT · drf-spectacular · Celery + Redis · Gunicorn · optional Tesseract OCR |
| `mobile/` | Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · TanStack Query · React Hook Form + Zod · SecureStore · Expo Camera · Google ML Kit text recognition · Expo Notifications · i18next (English, Malayalam) |
| `deploy/` | Nginx (HTTPS, Let's Encrypt), production Compose env, backup/restore scripts |
| `docs/` | [API](docs/api.md) · [OpenAPI schema](docs/openapi.yaml) · [Mobile builds](docs/mobile.md) · [Deployment](docs/deployment.md) · [Troubleshooting](docs/troubleshooting.md) |

---

## Quick start (local development)

### 1. Backend — with Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

API on http://localhost:8000, Swagger UI on http://localhost:8000/api/docs/, health on `/health/`.
Create an admin user: `docker compose exec api python manage.py createsuperuser`.

### 1b. Backend — without Docker

Requirements: Python 3.12+, PostgreSQL 14+, (optional) Redis and `tesseract-ocr`.

First create the database user and database once, connecting as the PostgreSQL superuser (`postgres`, with the password you chose when installing PostgreSQL):

```bash
psql -U postgres -c "CREATE ROLE whatinside LOGIN PASSWORD 'whatinside' CREATEDB;"
psql -U postgres -c "CREATE DATABASE whatinside OWNER whatinside;"
```

On Windows, if `psql` isn't found, use its full path, e.g. `"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "..."` (change `16` to your version). These match the default `DATABASE_URL` in `.env.example`; if you pick a different password, update `DATABASE_URL` too.

macOS / Linux:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Windows (Command Prompt):

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Binding to `0.0.0.0` lets a phone on the same Wi-Fi reach the API.

Reminder dispatch (push notifications) runs via Celery beat, or with cron instead of Celery:

```bash
celery -A config worker -l info & celery -A config beat -l info
# or, every 5 minutes from cron:
python manage.py send_due_notifications
```

### 2. Mobile app

Requirements: Node 20+ (22 recommended), Android Studio and/or Xcode for native builds.

```bash
cd mobile
npm install
cp .env.example .env            # set EXPO_PUBLIC_API_URL (see below)
npx expo run:android            # or: npx expo run:ios   (development build)
```

The app uses native modules (ML Kit OCR, camera, secure store), so use a **development build** (`expo run:*` or `eas build --profile development`). Expo Go can open the app for most screens, but on-device OCR falls back to server OCR there and Android remote push is unavailable — see [docs/mobile.md](docs/mobile.md).

**API URL by device** (`EXPO_PUBLIC_API_URL`):

| Where the app runs | Value |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical phone (same Wi-Fi) | `http://<your-computer-LAN-IP>:8000`, e.g. `http://192.168.1.20:8000` |
| Production | `https://api.your-domain.com` (HTTPS required; release builds refuse anything else) |

If it's unset in development, the app uses the Metro host's IP on port 8000 automatically. Add the host/IP to `DJANGO_ALLOWED_HOSTS` in `backend/.env`.

### 3. Run the checks

```bash
# Backend (needs PostgreSQL; uses a throwaway test database)
cd backend && pytest                                  # 85 tests
python scripts/smoke_test.py http://localhost:8000    # end-to-end API flow, cleans up after itself

# Mobile
cd mobile && npx tsc --noEmit && npm test             # type check + 61 tests
```

---

## How it works

### Data model

```
User ─┬─ HouseholdMembership (owner | admin | member) ─── Household (timezone)
      │                                                     │
      │   Product (per household; unique barcode, unique name+brand, case-insensitive)
      │     └── InventoryBatch (one purchase: own quantity, MFG/expiry/best-before, batch no., price, status, version)
      │            └── InventoryEvent (append-only: added/consumed/discarded/restocked/adjusted/finished/deleted)
      ├─ NotificationPreference (7/3/1/0-day offsets, hour, local/push)
      ├─ DeviceToken (Expo push tokens)
      └─ NotificationRecord (one per batch × user × offset × expiry date — unique idempotency key)
ShoppingListItem (per household, optional linked product, converts into a batch)
```

### Rules the system enforces

- **Household isolation** — every query is filtered by the caller's active membership (`X-Household-ID` header). Guessing another household's IDs returns 404.
- **Roles** — members manage inventory and shopping; admins also edit the household and invite/remove members; the owner also changes roles, transfers ownership and deletes the household.
- **Batches keep their own dates** — a second milk purchase is a new batch; restocking adds quantity to the same batch.
- **Quantity changes are atomic** — row lock + validation + event in one transaction; quantity can't go negative (DB check constraint).
- **Repeat-safe** — create/consume/finish/discard/restock/confirm accept an `Idempotency-Key`; a replay returns the stored response. Edits accept `version`; stale edits get **409** instead of overwriting.
- **OCR never guesses** — dates are classified by their label (MFG/MFD/DOM/PKD vs EXP/Use by vs Best before). Unlabelled dates are never treated as expiry; day/month ambiguity, month-only dates and "best before N months" are flagged, not filled. Nothing is saved until the user confirms on the review screen; unconfirmed dates leave the batch in **Needs review**.
- **Barcodes never supply expiry dates** — the user always adds the package's own date.
- **Timezones** — expiry fields are date-only (no shifts). "Today", expiring-soon and reminder times use the household's timezone; timestamps are stored in UTC.
- **No duplicate reminders** — server records have a unique key per batch/user/offset/expiry date; local notifications use the same deterministic identifiers and are reconciled (cancel stale, add missing) whenever data changes.

### Offline behaviour

The app persists the query cache (inventory, shopping list, dashboard) in AsyncStorage so it can be browsed offline. Consume / finish / discard and shopping-list add/check/remove are queued while offline and replayed on reconnect with idempotency keys; conflicts (409) are dropped and reported in the sync banner rather than overwriting newer server data. Creating products from scans requires a connection (server-side normalisation). JWTs live only in SecureStore.

---

## Project status

See [PROGRESS.md](PROGRESS.md) for the phase checklist, what was verified, and what needs your own credentials or hardware.
