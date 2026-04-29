import { requireNativeModule, Platform } from "expo-modules-core";

interface ApkInstallerModule {
  installApk(filePath: string): Promise<boolean>;
}

const ApkInstaller: ApkInstallerModule | null =
  Platform.OS === "android" ? requireNativeModule("ApkInstaller") : null;

export async function installApk(filePath: string): Promise<boolean> {
  if (!ApkInstaller) {
    throw new Error("APK installer is only available on Android");
  }
  return ApkInstaller.installApk(filePath);
}

export default { installApk };
