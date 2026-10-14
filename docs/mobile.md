# Mobile app — development, builds and native setup

The app lives in `mobile/` (Expo SDK 57, Expo Router, TypeScript). Routes are in `src/app/`; everything else (API client, components, features, i18n) is under `src/`.

```
src/app/(auth)/        welcome (splash + onboarding), login, register, forgot/reset password
src/app/household-setup.tsx   create or join a household
src/app/(app)/(tabs)/  Home dashboard · Inventory · Add · Reminders · More
src/app/(app)/         scan/ocr · scan/barcode · review · batch/[id] · batch/edit/[id] · batch/new · shopping · insights · search · settings/*
src/api/               typed client (JWT refresh, timeouts, error normalisation), endpoints, React Query hooks
src/scan/              OCR recognition (ML Kit → server fallback), review drafts
src/offline/queue.ts   persisted offline action queue
src/notifications/     local reminder planning/sync, push registration
```

## Development builds (required for native features)

| Feature | Expo Go | Development / store build |
|---|---|---|
| Camera, barcode scanning, image picker | ✅ | ✅ |
| On-device OCR (Google ML Kit) | ❌ falls back to server OCR (`OCR_PROVIDER=tesseract`) | ✅ |
| Local reminders | ✅ | ✅ |
| Remote push (Expo push service) | ❌ on Android (SDK 53+) | ✅ (physical device + EAS project id) |

### Android

```bash
cd mobile
npm install
npx expo run:android            # needs Android Studio + SDK + an emulator or USB device
# or in the cloud:
npx eas-cli@latest build --profile development --platform android
```

### iOS

```bash
npx expo run:ios                # needs macOS + Xcode; first run installs CocoaPods
# or: npx eas-cli@latest build --profile development --platform ios   (needs an Apple Developer account)
```

Then start Metro with `npx expo start` and open the dev build.

### Release builds

1. `npx eas-cli@latest init` — creates the EAS project; put the printed id in `EAS_PROJECT_ID` (or app config).
2. Set the production URL in `eas.json` → `build.production.env.EXPO_PUBLIC_API_URL` (must be `https://`; the app refuses to start otherwise).
3. `npx eas-cli@latest build --profile production --platform all`
4. `npx eas-cli@latest submit --platform android|ios`

Update `ios.bundleIdentifier` / `android.package` in `app.json` (`app.whatinside.mobile`) to identifiers you own before publishing.

## Connecting to the live test server (http://168.144.83.52)

`mobile/.env` and the `development` / `preview` profiles in `eas.json` already point at the deployed API:

```
EXPO_PUBLIC_API_URL=http://168.144.83.52
EXPO_PUBLIC_ALLOW_HTTP=true
```

`EXPO_PUBLIC_ALLOW_HTTP=true` is a **temporary** switch: Android blocks cleartext HTTP and iOS blocks non-HTTPS by default, so it turns on `usesCleartextTraffic` (Android) and `NSAllowsArbitraryLoads` (iOS) and lets release-mode test builds accept an `http://` URL. Native settings are baked in at build time, so after changing it run `npx expo prebuild --clean` (local builds) or start a new EAS build.

When the API has a domain with HTTPS: set `EXPO_PUBLIC_API_URL=https://api.yourdomain.com`, delete `EXPO_PUBLIC_ALLOW_HTTP`, and rebuild. The `production` profile never allows HTTP.

## API URL configuration

See the table in the README. Notes:
- Android blocks cleartext HTTP in release builds; use HTTPS for anything that isn't a debug build.
- For a physical phone, the computer and phone must be on the same network, the backend must listen on `0.0.0.0:8000`, and the LAN IP must be in `DJANGO_ALLOWED_HOSTS`.

## OCR setup

- **On-device:** `@react-native-ml-kit/text-recognition` (Latin script model, no network needed). It is autolinked in development/production builds; nothing to configure.
- **Server fallback:** the API's `/scanning/ocr/` endpoint with Tesseract. The Docker image installs `tesseract-ocr`; on a bare machine install it with `apt install tesseract-ocr` / `brew install tesseract`. Disable with `OCR_PROVIDER=disabled`.
- Both paths send text to the server, which normalises it (label-aware date detection, ambiguity flags) — client parsing is never trusted.

## Notifications setup

- **Local reminders** need only the OS permission. The app schedules them for confirmed batches expiring in the next 30 days (iOS allows 64 pending local notifications; the app keeps ≤60), using deterministic identifiers so re-syncing never duplicates.
- **Push** (cross-device, server-sent):
  1. `eas init` and set `EAS_PROJECT_ID`.
  2. Android: create a Firebase project, download `google-services.json`, and upload the FCM V1 service-account key with `npx eas-cli@latest credentials` (Expo docs: "FCM credentials").
  3. iOS: `eas credentials` creates the APNs key automatically with your Apple Developer account.
  4. In the app: Reminders → settings → enable "Push notifications". The app registers the Expo push token with `/notifications/register-device/`.
  5. Backend: run Celery beat + worker (or the `send_due_notifications` cron). If you enabled enhanced push security in Expo, set `EXPO_ACCESS_TOKEN`.
- OS limitations the app explains to users: permission can be denied; Android battery optimisation and iOS Focus can delay or silence notifications; Expo Go on Android can't receive remote push.

## Tests

```bash
npx tsc --noEmit      # type check
npm test              # Jest + React Native Testing Library (61 tests)
```

Covered: form validation, product addition payloads, OCR review & correction (ambiguous date choice, "not sure"), camera permission states and fallbacks, inventory filter mapping, shopping/offline queue replay and conflicts, API client errors/timeouts/refresh/session expiry, reminder planning/dedupe/preferences, auth state navigation guard, timezone-safe dates.
