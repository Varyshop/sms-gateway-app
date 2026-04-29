const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

function withApkInstaller(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.REQUEST_INSTALL_PACKAGES",
  ]);

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return config;

    const providerName = "expo.modules.apkinstaller.ApkInstallerFileProvider";
    const providers = application.provider || [];
    const exists = providers.some(
      (p) => p.$?.["android:name"] === providerName
    );

    if (!exists) {
      if (!application.provider) application.provider = [];
      application.provider.push({
        $: {
          "android:name": providerName,
          "android:authorities": "${applicationId}.apkinstaller",
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.support.FILE_PROVIDER_PATHS",
              "android:resource": "@xml/apk_paths",
            },
          },
        ],
      });
    }

    return config;
  });

  return config;
}

module.exports = withApkInstaller;
