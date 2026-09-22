# Shahin Travels Android app (APK + Play Store)

One app for **both customers and drivers**. It loads `https://shahintravels.app`
inside a native Android shell and adds native ride alerts for drivers.

- Package name (permanent): `com.shahintravels.app`
- Target/compile SDK: 36 (Play Store compliant), min SDK 24
- Outputs: `.apk` (direct download) and `.aab` (Google Play upload)

## What the native layer adds

- `RideAlertActivity` — call-style full-screen alert that turns the screen on
  over the lock screen, rings and vibrates, with ACCEPT / DECLINE.
- `ShahinFirebaseMessagingService` — receives ride pushes even when the app is
  closed and fires the full-screen alert.
- The native Firebase token is handed to the web app and saved as a
  `notification_devices` row with `device_type = 'android'`.

## One-time setup before the first build

1. **Firebase Android app**
   In the existing `shahin-travels` Firebase project add an Android app with the
   package name `com.shahintravels.app`, download `google-services.json`, and
   store it as a GitHub secret named `GOOGLE_SERVICES_JSON`
   (base64: `base64 -w0 google-services.json`).

2. **Signing key** (same key must be used for every future update)

   ```bash
   keytool -genkey -v -keystore shahin-release.keystore \
     -alias shahin -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 shahin-release.keystore   # paste into ANDROID_KEYSTORE_BASE64
   ```

   GitHub secrets to add:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

## Building

GitHub → **Actions** → *Build Shahin Travels App* → **Run workflow**, enter the
version name (e.g. `1.0.0`) and version code (increase by 1 every Play Store
upload). The workflow publishes a GitHub Release containing:

- `ShahinTravels-v<version>.apk` — direct download link for the website
- `ShahinTravels-v<version>.aab` — upload this to Google Play Console

## Putting it on the website

Admin → Business settings → **Android app**:

- *APK download link* — paste the `.apk` URL from the GitHub Release
- *Google Play link* — paste once the app is live on Play (button switches automatically)
- *App version* — shown on the download page

Public download page: `https://shahintravels.app/download`
