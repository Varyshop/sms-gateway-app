const {
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");

/**
 * Expo config plugin for the GatewayService module.
 *
 * Ensures that `expo prebuild` preserves:
 * - Extra permissions (FOREGROUND_SERVICE, WAKE_LOCK, BOOT_COMPLETED, etc.)
 * - <service> declaration for SmsGatewayService
 * - <receiver> declarations for SmsBroadcastReceiver and BootReceiver
 */
function withGatewayService(config) {
  // --- Add permissions via app.json-safe approach ---
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
    "android.permission.SCHEDULE_EXACT_ALARM",
    "android.permission.USE_EXACT_ALARM",
    "android.permission.WAKE_LOCK",
    "android.permission.RECEIVE_BOOT_COMPLETED",
    "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  ]);

  // --- Modify AndroidManifest.xml to add service + receivers ---
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    const PKG = "expo.modules.gatewayservice";

    // Helper: check if a component already exists (by short or full name)
    const hasComponent = (tag, className) => {
      const items = application[tag] || [];
      const fullName = `${PKG}.${className}`;
      return items.some(
        (item) =>
          item.$?.["android:name"] === fullName ||
          item.$?.["android:name"] === className ||
          item.$?.["android:name"] === `.${className}`
      );
    };

    // --- Add SmsGatewayService ---
    if (!hasComponent("service", "SmsGatewayService")) {
      if (!application.service) application.service = [];
      application.service.push({
        $: {
          "android:name": `${PKG}.SmsGatewayService`,
          "android:enabled": "true",
          "android:exported": "false",
          "android:foregroundServiceType": "specialUse",
        },
      });
    }

    // --- Add SmsBroadcastReceiver ---
    if (!hasComponent("receiver", "SmsBroadcastReceiver")) {
      if (!application.receiver) application.receiver = [];
      application.receiver.push({
        $: {
          "android:name": `${PKG}.SmsBroadcastReceiver`,
          "android:enabled": "true",
          "android:exported": "true",
          "android:permission": "android.permission.BROADCAST_SMS",
        },
        "intent-filter": [
          {
            $: { "android:priority": "999" },
            action: [
              {
                $: {
                  "android:name": "android.provider.Telephony.SMS_RECEIVED",
                },
              },
            ],
          },
        ],
      });
    }

    // --- Add FcmMessageHandler ---
    if (!hasComponent("service", "FcmMessageHandler")) {
      if (!application.service) application.service = [];
      application.service.push({
        $: {
          "android:name": `${PKG}.FcmMessageHandler`,
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "com.google.firebase.MESSAGING_EVENT",
                },
              },
            ],
          },
        ],
      });
    }

    // --- Add BootReceiver ---
    if (!hasComponent("receiver", "BootReceiver")) {
      if (!application.receiver) application.receiver = [];
      application.receiver.push({
        $: {
          "android:name": `${PKG}.BootReceiver`,
          "android:enabled": "true",
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.intent.action.BOOT_COMPLETED",
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });

  return config;
}

module.exports = withGatewayService;
