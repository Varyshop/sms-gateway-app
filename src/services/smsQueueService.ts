import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Subscription } from 'expo-modules-core';
import { getSettings } from '../storage/settings';
import { setSmsCheckSettings } from '../../modules/direct-sms';
import GatewayService, { onSmsResult } from '../../modules/gateway-service';
import { SmsHistoryItem } from '../types';

let smsHistory: SmsHistoryItem[] = [];
let historyListeners: ((history: SmsHistoryItem[]) => void)[] = [];
let smsResultSubscription: Subscription | null = null;

const MAX_HISTORY = 200;
const HISTORY_STORAGE_KEY = 'sms_send_history';

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistHistory(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(smsHistory)).catch(() => {});
  }, 2000);
}

export async function loadHistory(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      smsHistory = JSON.parse(raw);
      for (const listener of historyListeners) {
        listener(smsHistory);
      }
    }
  } catch {}
}

export function addToHistory(sms: { id: number; phone_number: string; message: string }, status: 'sent' | 'error', errorMessage?: string): void {
  const item: SmsHistoryItem = {
    id: sms.id,
    phone_number: sms.phone_number,
    message: sms.message,
    status,
    timestamp: Date.now(),
    error_message: errorMessage,
  };
  smsHistory = [item, ...smsHistory].slice(0, MAX_HISTORY);

  for (const listener of historyListeners) {
    listener(smsHistory);
  }
  persistHistory();
}

/**
 * Start SMS queue processing.
 *
 * All background work (polling, sending, status tracking, sync) is done
 * by the native SmsGatewayService foreground service.  JS side only
 * manages history for UI display.
 */
export function startSmsQueue(): void {
  if (Platform.OS !== 'android') return;

  const settings = getSettings();
  if (!settings.serviceEnabled) return;

  // Apply Android SMS check limits to prevent system abuse alert
  setSmsCheckSettings(settings.smsCheckMaxCount, settings.smsCheckIntervalMs)
    .then((res) => console.log(`[SmsQueue] SMS check limits applied: max=${res.maxCount}, interval=${res.intervalMs}ms`))
    .catch((err) => console.warn('[SmsQueue] Could not apply SMS check limits (WRITE_SECURE_SETTINGS needed):', err.message));

  // Start native foreground service (handles all polling, sending, and status reporting)
  GatewayService.startService(
    settings.apiUrl,
    settings.apiKey,
    settings.serviceEnabled,
    settings.pollingInterval,
    settings.heartbeatInterval,
  )
    .then(() => console.log('[SmsQueue] Native foreground service started'))
    .catch((err) => console.error('[SmsQueue] Failed to start native service:', err));

  // Subscribe to individual SMS results for UI history
  smsResultSubscription?.remove();
  smsResultSubscription = onSmsResult((event) => {
    addToHistory(
      { id: event.smsId, phone_number: event.phoneNumber, message: event.message },
      event.status as 'sent' | 'error',
      event.errorMessage || undefined,
    );
  });
}

export function stopSmsQueue(): void {
  smsResultSubscription?.remove();
  smsResultSubscription = null;
}

/**
 * Stop the native foreground service.
 */
export async function stopSmsQueueFull(): Promise<void> {
  await GatewayService.stopService();
}

export function setRateLimit(limit: number): void {
  // Rate limit is now managed entirely by native service
  console.log(`[SmsQueue] Rate limit ${limit} (managed by native service)`);
}

export function getSmsHistory(): SmsHistoryItem[] {
  return smsHistory;
}

export function onHistoryChange(callback: (history: SmsHistoryItem[]) => void): () => void {
  historyListeners.push(callback);
  return () => {
    historyListeners = historyListeners.filter((l) => l !== callback);
  };
}

export function isQueueActive(): boolean {
  // Synchronous check not possible with async bridge — return true if service was started
  return true;
}

/**
 * Trigger an immediate poll cycle in the native service.
 */
export function triggerImmediatePoll(): void {
  GatewayService.triggerImmediatePoll()
    .catch((err: Error) => console.warn('[SmsQueue] triggerImmediatePoll failed:', err.message));
}

export default {
  startSmsQueue,
  stopSmsQueue,
  stopSmsQueueFull,
  getSmsHistory,
  onHistoryChange,
  isQueueActive,
  triggerImmediatePoll,
  setRateLimit,
};
