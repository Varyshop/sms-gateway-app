import { requireNativeModule, Platform } from 'expo-modules-core';

export interface SimCardInfo {
  subscriptionId: number;
  slotIndex: number;
  phoneNumber: string | null;
  carrierName: string | null;
  displayName: string | null;
}

interface SimManagerModuleType {
  hasPhonePermission(): Promise<boolean>;
  getActiveSimCards(): Promise<SimCardInfo[]>;
  getSimBySubscriptionId(subscriptionId: number): Promise<SimCardInfo | null>;
}

// Only available on Android
const SimManagerNative: SimManagerModuleType | null =
  Platform.OS === 'android' ? requireNativeModule('SimManager') : null;

/**
 * Check if phone state permissions are granted
 * @returns true if permissions are granted, false otherwise (always false on iOS)
 */
export async function hasPhonePermission(): Promise<boolean> {
  if (!SimManagerNative) {
    return false;
  }
  return SimManagerNative.hasPhonePermission();
}

/**
 * Get list of active SIM cards
 * @returns Array of SimCardInfo objects
 */
export async function getActiveSimCards(): Promise<SimCardInfo[]> {
  if (!SimManagerNative) {
    return [];
  }
  return SimManagerNative.getActiveSimCards();
}

/**
 * Get SIM card by subscription ID
 * @param subscriptionId - The subscription ID of the SIM
 * @returns SimCardInfo or null if not found
 */
export async function getSimBySubscriptionId(
  subscriptionId: number
): Promise<SimCardInfo | null> {
  if (!SimManagerNative) {
    return null;
  }
  return SimManagerNative.getSimBySubscriptionId(subscriptionId);
}

/**
 * Get display string for a SIM card
 */
export function getSimDisplayString(sim: SimCardInfo): string {
  const slot = `SIM ${sim.slotIndex + 1}`;
  const number = sim.phoneNumber || 'Cislo nedostupne';
  const carrier = sim.carrierName;

  if (carrier) {
    return `${slot}: ${number} (${carrier})`;
  }
  return `${slot}: ${number}`;
}

export default {
  hasPhonePermission,
  getActiveSimCards,
  getSimBySubscriptionId,
  getSimDisplayString,
};
