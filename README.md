# Varyshop SMS Gateway App

Expo (React Native) Android application. Works as an SMS gateway for Odoo — sending, receiving, STOP blacklist, FCM push notifications.

[Czech version (Česká verze)](README.cs.md)

---

## Prerequisites

- Node.js 18+
- Yarn (`npm install -g yarn`)
- Android Studio (SDK, emulator or physical device)
- EAS CLI (`npm install -g eas-cli`) — for cloud builds
- ADB in PATH (`~/Library/Android/sdk/platform-tools/`)

---

## Build (local)

### 1. Install dependencies

```bash
cd extra/sms/sms-gateway-app
yarn install
```

### 2. Prebuild native project

```bash
yarn prebuild --clean
```

> `--clean` deletes and regenerates the `android/` directory. Use after changing `app.json`, `app.plugin.js`, or native modules.

### 3. Build release APK

```bash
cd android && ./gradlew assembleRelease && cd ..
```

Output APK: `android/app/build/outputs/apk/release/app-release.apk`

### 4. Copy APK to project root

```bash
cp android/app/build/outputs/apk/release/app-release.apk ./app-release.apk
```

### Full build in one command

```bash
yarn install && yarn prebuild --clean && cd android && ./gradlew assembleRelease && cd .. && cp android/app/build/outputs/apk/release/app-release.apk ./app-release.apk
```

---

## Build (EAS Cloud)

```bash
# Release APK (sideloading)
eas build --profile production-apk --platform android

# Release AAB (Google Play)
eas build --profile production --platform android
```

After completion, download the APK from the link in the terminal or from `expo.dev`.

---

## Install on device

### Via ADB (recommended for development)

```bash
# Verify connected device
adb devices

# Install APK
adb install -r app-release.apk
```

### Manually

1. Transfer `app-release.apk` to the phone (email, cloud, USB)
2. Open the file on the phone and allow installation from unknown sources
3. After installation, grant all requested permissions (SMS, notifications, battery)

### SMS limit setting (WRITE_SECURE_SETTINGS)

Android limits sending to ~30 SMS per 30 minutes by default. For bulk sending, this limit needs to be raised. The app can do this automatically, but it requires the special `WRITE_SECURE_SETTINGS` permission, which can only be granted via ADB:

```bash
# Connect the phone via USB and run:
yarn grant-permission

# Or manually:
adb shell pm grant com.varyshop.smsgatewayapp android.permission.WRITE_SECURE_SETTINGS
```

> This permission only needs to be granted **once** — it survives phone restarts and app reinstalls (as long as the package name doesn't change).

After granting the permission, set the desired limit in the app: **Settings > SMS Limit**. The app will automatically write the values to Android system settings (`sms_outgoing_check_max_count` and `sms_outgoing_check_interval_ms`).

Without this step, Android will show a dialog "App is trying to send a large number of SMS" after ~30 SMS and block further sending.

> **Note (Xiaomi/MIUI):** On some Xiaomi devices, the `pm grant` command does not work on production builds without root. In that case, lower the **"SMS per Minute"** field in Odoo to 1 (= max 30 SMS per 30 minutes, under the system limit).

### First launch

1. **Permissions** — allow SMS, notifications (Android 13+)
2. **Battery optimization** — allow the exemption dialog
3. **MIUI/Xiaomi** — Settings > Apps > SMS Gateway > Autostart: enable
4. **SMS limit** — connect the phone via USB and run `yarn grant-permission` (see above)
5. **QR pairing** — Settings > Scan QR code (from Odoo gateway phone record)

---

## GitHub Release

### 1. Commit changes

```bash
cd extra/sms/sms-gateway-app
git add -A
git commit -m "feat: description of changes"
```

### 2. Create release with APK

```bash
gh release create v1.x.x ./app-release.apk \
  --repo Varyshop/sms-gateway-app \
  --title "v1.x.x — Version description" \
  --notes "$(cat <<'EOF'
## Changes

- Change 1
- Change 2

## Installation

Download `app-release.apk` and install on an Android device.
EOF
)"
```

### 3. Push code

```bash
git push origin master
```

### 4. Update submodule in main repo

```bash
cd /Volumes/ext-msi/projects/my-projects/varyshop.eu
git add extra/sms
git commit -m "chore: update sms submodule (vX.X.X)"
```

---

## Important notes

- **APK is in .gitignore** — never commit it to the repo, upload only as a GitHub Release asset
- **`yarn prebuild --clean`** is required after any change in:
  - `app.json` (permissions, plugins)
  - `modules/gateway-service/app.plugin.js` (manifest inject)
  - Native Kotlin code in `modules/`
- **Signing** — release build uses debug keystore. For production, set up your own keystore in `android/app/build.gradle`
- **Version** — bump `version` in `app.json` before each release

---

## Useful ADB commands

```bash
# App logs
adb logcat --pid=$(adb shell pidof com.varyshop.smsgatewayapp)

# Filter SMS Gateway service logs
adb logcat --pid=$(adb shell pidof com.varyshop.smsgatewayapp) | grep -i "SmsGateway\|FCM\|Heartbeat\|InboundSms"

# Increase SMS limit (needed for higher volumes)
adb shell settings put global sms_outgoing_check_max_count 10000

# Check battery optimization
adb shell dumpsys deviceidle whitelist | grep varyshop

# Force stop and restart
adb shell am force-stop com.varyshop.smsgatewayapp
adb shell am start -n com.varyshop.smsgatewayapp/.MainActivity
```

---

## Contact

For questions contact info@varyshop.eu or the developer directly at info@michalvarys.eu
