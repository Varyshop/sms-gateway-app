import { AppState, AppStateStatus, Platform } from 'react-native';
import { getApiClient } from '../api/gatewayClient';
import { getSettings } from '../storage/settings';
import DirectSms, { setSmsCheckSettings } from '../../modules/direct-sms';
import SimManager from '../../modules/sim-manager';
import { PendingSms, SmsHistoryItem } from '../types';

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let appStateSubscription: { remove: () => void } | null = null;
let rateLimit = 100; // SMS per minute, updated from server
let smsHistory: SmsHistoryItem[] = [];
let historyListeners: ((history: SmsHistoryItem[]) => void)[] = [];

const MAX_HISTORY = 200;

function addToHistory(sms: PendingSms, status: 'sent' | 'error', errorMessage?: string): void {
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
}

async function processSms(sms: PendingSms): Promise<void> {
  const client = getApiClient();
  if (!client) return;

  try {
    // Notify server we're sending
    await client.confirmSms(sms.id, 'sending');

    // Send via native SMS
    const result = await DirectSms.sendSms(sms.phone_number, sms.message);

    if (result.success) {
      await client.confirmSms(sms.id, 'sent');
      addToHistory(sms, 'sent');
      console.log(`[SmsQueue] SMS ${sms.id} sent to ${sms.phone_number}`);
    } else {
      await client.confirmSms(sms.id, 'error', result.message);
      addToHistory(sms, 'error', result.message);
      console.error(`[SmsQueue] SMS ${sms.id} failed: ${result.message}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    try {
      await client.confirmSms(sms.id, 'error', errorMessage);
    } catch (_) {}
    addToHistory(sms, 'error', errorMessage);
    console.error(`[SmsQueue] Error sending SMS ${sms.id}:`, error);
  }
}

async function getPhoneNumbers(): Promise<string[]> {
  const numbers: string[] = [];
  try {
    const sims = await SimManager.getActiveSimCards();
    for (const sim of sims) {
      if (sim.phoneNumber) {
        numbers.push(sim.phoneNumber);
      }
    }
  } catch (error) {
    console.error('[SmsQueue] Failed to get SIM numbers:', error);
  }
  return numbers;
}

async function pollAndSend(): Promise<void> {
  if (isPolling) return;

  const client = getApiClient();
  if (!client) return;

  const hasPermission = await DirectSms.hasPermission();
  if (!hasPermission) {
    console.warn('[SmsQueue] No SEND_SMS permission');
    return;
  }

  isPolling = true;

  try {
    const phoneNumbers = await getPhoneNumbers();
    if (phoneNumbers.length === 0) {
      console.warn('[SmsQueue] No phone numbers available');
      return;
    }

    const response = await client.getPendingSms(phoneNumbers);

    if (response.success && response.sms_list && response.sms_list.length > 0) {
      console.log(`[SmsQueue] Found ${response.sms_list.length} pending SMS`);

      // Calculate delay between SMS from rate limit
      const delayMs = rateLimit > 0 ? Math.ceil(60000 / rateLimit) : 600;

      for (const sms of response.sms_list) {
        await processSms(sms);
        // Rate limiting delay
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } catch (error) {
    console.error('[SmsQueue] Poll error:', error);
  } finally {
    isPolling = false;
  }
}

function handleAppStateChange(nextAppState: AppStateStatus): void {
  if (nextAppState === 'active') {
    pollAndSend();
  }
}

export function startSmsQueue(): void {
  if (Platform.OS !== 'android') return;

  stopSmsQueue();

  const settings = getSettings();
  if (!settings.serviceEnabled) return;

  // Apply Android SMS check limits to prevent system abuse alert
  setSmsCheckSettings(settings.smsCheckMaxCount, settings.smsCheckIntervalMs)
    .then((res) => console.log(`[SmsQueue] SMS check limits applied: max=${res.maxCount}, interval=${res.intervalMs}ms`))
    .catch((err) => console.warn('[SmsQueue] Could not apply SMS check limits (WRITE_SECURE_SETTINGS needed):', err.message));

  const intervalMs = settings.pollingInterval * 1000;
  console.log(`[SmsQueue] Starting with ${settings.pollingInterval}s polling interval`);

  pollAndSend();
  pollingInterval = setInterval(pollAndSend, intervalMs);
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

export function stopSmsQueue(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

export function setRateLimit(limit: number): void {
  rateLimit = limit;
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
  return pollingInterval !== null;
}

export function triggerImmediatePoll(): void {
  if (pollingInterval) {
    pollAndSend();
  }
}

export default {
  startSmsQueue,
  stopSmsQueue,
  getSmsHistory,
  onHistoryChange,
  isQueueActive,
  triggerImmediatePoll,
  setRateLimit,
};
