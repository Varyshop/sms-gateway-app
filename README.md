# Varyshop SMS Gateway App

Expo (React Native) aplikace pro Android. Slouzi jako SMS brana pro Odoo — odesilani, prijem, STOP blacklist, FCM push notifikace.

---

## Predpoklady

- Node.js 18+
- Yarn (`npm install -g yarn`)
- Android Studio (SDK, emulator nebo fyzicky telefon)
- EAS CLI (`npm install -g eas-cli`) — pro cloud buildy
- ADB v PATH (`~/Library/Android/sdk/platform-tools/`)

---

## Build (lokalni)

### 1. Instalace zavislosti

```bash
cd extra/sms/sms-gateway-app
yarn install
```

### 2. Prebuild nativniho projektu

```bash
yarn prebuild --clean
```

> `--clean` smaze a znovu vygeneruje `android/` adresar. Pouzijte po zmene `app.json`, `app.plugin.js` nebo nativnich modulu.

### 3. Build release APK

```bash
cd android && ./gradlew assembleRelease && cd ..
```

Vysledny APK: `android/app/build/outputs/apk/release/app-release.apk`

### 4. Kopirovani APK do korene

```bash
cp android/app/build/outputs/apk/release/app-release.apk ./app-release.apk
```

### Cely build jednim prikazem

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

Po dokonceni stahnete APK z odkazu v terminalu nebo z `expo.dev`.

---

## Instalace na telefon

### Pres ADB (doporuceno pro vyvoj)

```bash
# Overeni pripojeneho zarizeni
adb devices

# Instalace APK
adb install -r app-release.apk
```

### Manualne

1. Preneste `app-release.apk` na telefon (email, cloud, USB)
2. Na telefonu otevrete soubor a povolte instalaci z neznamych zdroju
3. Po instalaci udelete vsechna pozadovana opravneni (SMS, notifikace, baterie)

### Nastaveni SMS limitu (WRITE_SECURE_SETTINGS)

Android standardne omezuje odeslani na ~30 SMS za 30 minut. Pro hromadne odesilani je nutne zvysit tento limit. Aplikace to umi udelat sama, ale potrebuje specialni opravneni `WRITE_SECURE_SETTINGS`, ktere lze udelit jen pres ADB:

```bash
# Pripojte telefon pres USB a spustte:
yarn grant-permission

# Nebo rucne:
adb shell pm grant com.varyshop.smsgatewayapp android.permission.WRITE_SECURE_SETTINGS
```

> Toto opravneni staci udelit **jednou** — prezije restart telefonu i reinstalaci aplikace (dokud se nezmeni package name).

Po udeleni opravneni nastavte pozadovany limit v aplikaci: **Nastaveni > SMS Limit**. Aplikace automaticky zapise hodnoty do systemovych nastaveni Androidu (`sms_outgoing_check_max_count` a `sms_outgoing_check_interval_ms`).

Bez tohoto kroku Android po ~30 SMS zobrazi dialog "Aplikace se pokusi odeslat velke mnozstvi SMS" a zablokuje dalsi odesilani.

### Prvni spusteni

1. **Opravneni** — povolte SMS, notifikace (Android 13+)
2. **Optimalizace baterie** — povolte dialog pro vyjimku z optimalizace
3. **MIUI/Xiaomi** — Nastaveni > Aplikace > SMS Gateway > Autostart: zapnout
4. **SMS limit** — pripojte telefon pres USB a spustte `yarn grant-permission` (viz vyse)
5. **QR parovani** — Nastaveni > Naskenovat QR kod (z Odoo gateway telefonu)

---

## Github Release

### 1. Commitnete zmeny

```bash
cd extra/sms/sms-gateway-app
git add -A
git commit -m "feat: popis zmen"
```

### 2. Vytvorte release s APK

```bash
gh release create v1.x.x ./app-release.apk \
  --repo Varyshop/sms-gateway-app \
  --title "v1.x.x — Popis verze" \
  --notes "$(cat <<'EOF'
## Zmeny

- Popis zmen 1
- Popis zmen 2

## Instalace

Stahnete `app-release.apk` a nainstalujte na Android zarizeni.
EOF
)"
```

### 3. Pushnete kod

```bash
git push origin master
```

### 4. Aktualizujte submodul v hlavnim repu

```bash
cd /Volumes/ext-msi/projects/my-projects/varyshop.eu
git add extra/sms
git commit -m "chore: update sms submodule (vX.X.X)"
```

---

## Dulezite poznamky

- **APK je v .gitignore** — nikdy ho necommitujte do repa, nahravejte pouze jako GitHub Release asset
- **`yarn prebuild --clean`** je nutny po kazde zmene v:
  - `app.json` (opravneni, plugins)
  - `modules/gateway-service/app.plugin.js` (manifest inject)
  - Nativnim Kotlin kodu v `modules/`
- **Signing** — release build pouziva debug keystore. Pro produkci nastavte vlastni keystore v `android/app/build.gradle`
- **Verze** — zvyste `version` v `app.json` pred kazdym release

---

## ADB uzitecne prikazy

```bash
# Logy aplikace
adb logcat --pid=$(adb shell pidof com.varyshop.smsgatewayapp)

# Filtr na SMS Gateway service
adb logcat --pid=$(adb shell pidof com.varyshop.smsgatewayapp) | grep -i "SmsGateway\|FCM\|Heartbeat\|InboundSms"

# Zvyseni SMS limitu (nutne pro vetsi objemy)
adb shell settings put global sms_outgoing_check_max_count 10000

# Kontrola battery optimization
adb shell dumpsys deviceidle whitelist | grep varyshop

# Force stop a restart
adb shell am force-stop com.varyshop.smsgatewayapp
adb shell am start -n com.varyshop.smsgatewayapp/.MainActivity
```

---

## Kontakt

V pripade dotazu kontaktujte info@varyshop.eu nebo primo vyvojare info@michalvarys.eu
