# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App shows "You appear to be offline" against a local API | Wrong `EXPO_PUBLIC_API_URL`. Emulator → `http://10.0.2.2:8000`; phone → your computer's LAN IP; backend must run on `0.0.0.0:8000`; firewall must allow port 8000. Restart Metro after changing `.env` (`npx expo start -c`). |
| API returns `400 Bad Request` (HTML) for every call from the phone | Host not in `DJANGO_ALLOWED_HOSTS`. Add the LAN IP / `10.0.2.2`. |
| Release app crashes at start with "EXPO_PUBLIC_API_URL must use https://" | Intentional: production builds need an HTTPS API. Set it in `eas.json`. |
| OCR always says "Read on the server" | You're in Expo Go or a build without the ML Kit module. Use a development build. Server OCR still works if `OCR_PROVIDER=tesseract` and `tesseract` is installed. |
| `/scanning/ocr/` returns 503 `ocr_disabled` / `ocr_unavailable` | Server OCR is off or Tesseract isn't installed (`apt install tesseract-ocr`). |
| OCR finds the text but no expiry date | By design when the date has no EXP/Use by/Best before label, is month-only, or is relative ("6 months from MFG"). Choose a detected date on the review screen or enter it; or tick "not sure" to review later. |
| Barcode result says "product database is slow" | Open Food Facts timed out (`BARCODE_PROVIDER_TIMEOUT`, default 5 s). Enter details manually; lookups are cached for a day once they succeed. |
| No reminders on the phone | Notification permission off (Reminders tab shows a banner), item date not confirmed (Needs review), expiry > 30 days away (scheduled later), or OS battery/Focus settings. |
| Push never arrives | Needs a physical device + dev/store build + `EAS_PROJECT_ID` + FCM/APNs credentials, and Celery beat/worker (or the cron command) running. Check `/admin/` → Notification records: `local_only` means no active device token or push not enabled; `failed` shows the provider error. |
| "This item changed on another device" | Optimistic concurrency (409). The app reloads the item; repeat the action. |
| Sync banner shows a failed change | A queued offline action conflicted with newer server data or was invalid; it was dropped instead of overwriting. Re-do it if still needed. |
| `FATAL: role "whatinside" does not exist` on `migrate` | The PostgreSQL user hasn't been created. As the `postgres` superuser run `CREATE ROLE whatinside LOGIN PASSWORD 'whatinside' CREATEDB;` and `CREATE DATABASE whatinside OWNER whatinside;` (see README), or point `DATABASE_URL` in `backend/.env` at an existing user. |
| `createdb: illegal option -- c` on Windows | Command Prompt doesn't treat `#` as a comment, so the rest of the line was passed to `createdb`. Run commands without trailing `# …` notes. |
| `pytest` can't connect to database | Tests need PostgreSQL. Set `DATABASE_URL` to a user with `CREATEDB` (the test DB is created and dropped automatically). |
| `npx expo install` fails behind a proxy | Use `EXPO_OFFLINE=1 npx expo install <pkg>` to resolve versions from the local SDK map. |
| Migrations out of date after pulling | `python manage.py migrate`; check with `python manage.py makemigrations --check`. |
