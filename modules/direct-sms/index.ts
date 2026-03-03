import { requireNativeModule, Platform } from "expo-modules-core";

export interface SmsCheckSettings {
  maxCount: number;
  intervalMs: number;
}

interface DirectSmsModule {
  hasPermission(): Promise<boolean>;
  sendSms(
    phoneNumber: string,
    message: string,
  ): Promise<{ success: boolean; message: string }>;
  getSmsCheckSettings(): Promise<SmsCheckSettings>;
  setSmsCheckSettings(
    maxCount: number,
    intervalMs: number,
  ): Promise<{ success: boolean; maxCount: number; intervalMs: number }>;
}

// Only available on Android
const DirectSms: DirectSmsModule | null =
  Platform.OS === "android" ? requireNativeModule("DirectSms") : null;

/**
 * Check if SEND_SMS permission is granted
 * @returns true if permission is granted, false otherwise (always false on iOS)
 */
export async function hasPermission(): Promise<boolean> {
  if (!DirectSms) {
    return false;
  }
  return DirectSms.hasPermission();
}

/**
 * Send SMS directly without opening SMS app (Android only)
 * @param phoneNumber - The recipient phone number
 * @param message - The SMS message to send
 * @returns Promise with success status
 * @throws Error if permission not granted or sending fails
 */
export async function sendSms(
  phoneNumber: string,
  message: string,
): Promise<{ success: boolean; message: string }> {
  if (!DirectSms) {
    throw new Error("Direct SMS is only available on Android");
  }
  return DirectSms.sendSms(phoneNumber, message);
}

/**
 * Check if direct SMS sending is available (Android only with permission)
 */
export async function isAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }
  return hasPermission();
}

/**
 * Read current Android SMS outgoing check settings
 * @returns Current maxCount and intervalMs values
 */
export async function getSmsCheckSettings(): Promise<SmsCheckSettings> {
  if (!DirectSms) {
    return { maxCount: 300, intervalMs: 1800000 };
  }
  return DirectSms.getSmsCheckSettings();
}

/**
 * Set Android SMS outgoing check settings to prevent abuse detection alert.
 * Requires WRITE_SECURE_SETTINGS permission granted via ADB:
 *   adb shell pm grant <package> android.permission.WRITE_SECURE_SETTINGS
 *
 * @param maxCount - Max SMS allowed in the check interval (e.g. 1000)
 * @param intervalMs - Check interval in milliseconds (e.g. 60000 = 1 min)
 */
export async function setSmsCheckSettings(
  maxCount: number,
  intervalMs: number,
): Promise<{ success: boolean; maxCount: number; intervalMs: number }> {
  if (!DirectSms) {
    throw new Error("SMS check settings are only available on Android");
  }
  return DirectSms.setSmsCheckSettings(maxCount, intervalMs);
}

export default {
  hasPermission,
  sendSms,
  isAvailable,
  getSmsCheckSettings,
  setSmsCheckSettings,
};
