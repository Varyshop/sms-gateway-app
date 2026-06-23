# Varyshop SMS Gateway App

Expo (React Native) aplikace pro Android. Slouží jako SMS brána pro Odoo — odesílání, příjem, STOP blacklist, FCM push notifikace.

[English version](README.md)

---

## Předpoklady

- Node.js 18+
- Yarn (`npm install -g yarn`)
- Android Studio (SDK, emulátor nebo fyzický telefon)
- EAS CLI (`npm install -g eas-cli`) — pro cloud buildy
- ADB v PATH (`~/Library/Android/sdk/platform-tools/`)

---

## Build (lokální)

### 1. Instalace závislostí

```bash
cd extra/sms/sms-gateway-app
yarn install
```

### 2. Prebuild nativního projektu

```bash
yarn prebuild --clean
```

> `--clean` smaže a znovu vygeneruje `android/` adresář. Použijte po změně `app.json`, `app.plugin.js` nebo nativních modulů.

### 3. Build release APK

```bash
cd android && ./gradlew assembleRelease && cd ..
```

Výsledný APK: `android/app/build/outputs/apk/release/app-release.apk`

### 4. Kopírování APK do kořene

```bash
cp android/app/build/outputs/apk/release/app-release.apk ./app-release.apk
```

### Celý build jedním příkazem

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

Po dokončení stáhněte APK z odkazu v terminálu nebo z `expo.dev`.

---

## Instalace na telefon

### Přes ADB (doporučeno pro vývoj)

```bash
# Ověření připojeného zařízení
adb devices

# Instalace APK
adb install -r app-release.apk
```

### Manuálně

1. Přeneste `app-release.apk` na telefon (email, cloud, USB)
2. Na telefonu otevřete soubor a povolte instalaci z neznámých zdrojů
3. Po instalaci udělte všechna požadovaná oprávnění (SMS, notifikace, baterie)

### Nastavení SMS limitu (WRITE_SECURE_SETTINGS)

Android standardně omezuje odesílání na ~30 SMS za 30 minut. Pro hromadné odesílání je nutné zvýšit tento limit. Aplikace to umí udělat sama, ale potřebuje speciální oprávnění `WRITE_SECURE_SETTINGS`, které lze udělit jen přes ADB:

```bash
# Připojte telefon přes USB a spusťte:
yarn grant-permission

# Nebo ručně:
adb shell pm grant com.varyshop.smsgatewayapp android.permission.WRITE_SECURE_SETTINGS
```

> Toto oprávnění stačí udělit **jednou** — přežije restart telefonu i reinstalaci aplikace (dokud se nezmění package name).

Po udělení oprávnění nastavte požadovaný limit v aplikaci: **Nastavení > SMS Limit**. Aplikace automaticky zapíše hodnoty do systémových nastavení Androidu (`sms_outgoing_check_max_count` a `sms_outgoing_check_interval_ms`).

Bez tohoto kroku Android po ~30 SMS zobrazí dialog "Aplikace se pokouší odeslat velké množství SMS" a zablokuje další odesílání.

> **Poznámka (Xiaomi/MIUI):** Na některých Xiaomi zařízeních příkaz `pm grant` nefunguje na produkčních buildech bez rootu. V takovém případě snižte v Odoo pole **"SMS per Minute"** na hodnotu 1 (= max 30 SMS za 30 minut, pod systémovým limitem).

### První spuštění

1. **Oprávnění** — povolte SMS, notifikace (Android 13+)
2. **Optimalizace baterie** — povolte dialog pro výjimku z optimalizace
3. **MIUI/Xiaomi** — Nastavení > Aplikace > SMS Gateway > Autostart: zapnout
4. **SMS limit** — připojte telefon přes USB a spusťte `yarn grant-permission` (viz výše)
5. **QR párování** — Nastavení > Naskenovat QR kód (z Odoo gateway telefonu)

---

## GitHub Release

### 1. Commitněte změny

```bash
cd extra/sms/sms-gateway-app
git add -A
git commit -m "feat: popis změn"
```

### 2. Vytvořte release s APK

```bash
gh release create v1.x.x ./app-release.apk \
  --repo Varyshop/sms-gateway-app \
  --title "v1.x.x — Popis verze" \
  --notes "$(cat <<'EOF'
## Změny

- Popis změn 1
- Popis změn 2

## Instalace

Stáhněte `app-release.apk` a nainstalujte na Android zařízení.
EOF
)"
```

### 3. Pushněte kód

```bash
git push origin master
```

### 4. Aktualizujte submodul v hlavním repu

```bash
cd /Volumes/ext-msi/projects/my-projects/varyshop.eu
git add extra/sms
git commit -m "chore: update sms submodule (vX.X.X)"
```

---

## Důležité poznámky

- **APK je v .gitignore** — nikdy ho necommitujte do repa, nahrávejte pouze jako GitHub Release asset
- **`yarn prebuild --clean`** je nutný po každé změně v:
  - `app.json` (oprávnění, plugins)
  - `modules/gateway-service/app.plugin.js` (manifest inject)
  - Nativním Kotlin kódu v `modules/`
- **Signing** — release build používá debug keystore. Pro produkci nastavte vlastní keystore v `android/app/build.gradle`
- **Verze** — zvyšte `version` v `app.json` před každým release

---

## ADB užitečné příkazy

```bash
# Logy aplikace
adb logcat --pid=$(adb shell pidof com.varyshop.smsgatewayapp)

# Filtr na SMS Gateway service
adb logcat --pid=$(adb shell pidof com.varyshop.smsgatewayapp) | grep -i "SmsGateway\|FCM\|Heartbeat\|InboundSms"

# Zvýšení SMS limitu (nutné pro větší objemy)
adb shell settings put global sms_outgoing_check_max_count 10000

# Kontrola battery optimization
adb shell dumpsys deviceidle whitelist | grep varyshop

# Force stop a restart
adb shell am force-stop com.varyshop.smsgatewayapp
adb shell am start -n com.varyshop.smsgatewayapp/.MainActivity
```

---

## Kontakt

V případě dotazů kontaktujte info@varyshop.eu nebo přímo vývojáře info@michalvarys.eu
