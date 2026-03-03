import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryStorage: Record<string, string | number | boolean> = {};

const KEYS = {
  API_URL: 'api_url',
  API_KEY: 'api_key',
  SERVICE_ENABLED: 'sms_service_enabled',
  POLLING_INTERVAL: 'sms_polling_interval',
  HEARTBEAT_INTERVAL: 'heartbeat_interval',
  SMS_CHECK_MAX_COUNT: 'sms_check_max_count',
  SMS_CHECK_INTERVAL_MS: 'sms_check_interval_ms',
} as const;

const DEFAULTS = {
  POLLING_INTERVAL: 10, // seconds
  HEARTBEAT_INTERVAL: 60, // seconds
  SMS_CHECK_MAX_COUNT: 1000,
  SMS_CHECK_INTERVAL_MS: 60000, // 1 minute
};

export interface AppSettings {
  apiUrl: string;
  apiKey: string;
  serviceEnabled: boolean;
  pollingInterval: number;
  heartbeatInterval: number;
  smsCheckMaxCount: number;
  smsCheckIntervalMs: number;
}

function getString(key: string): string | undefined {
  const value = memoryStorage[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(key: string): number | undefined {
  const value = memoryStorage[key];
  return typeof value === 'number' ? value : undefined;
}

function getBoolean(key: string): boolean | undefined {
  const value = memoryStorage[key];
  return typeof value === 'boolean' ? value : undefined;
}

function setValue(key: string, value: string | number | boolean): void {
  AsyncStorage.setItem(key, String(value)).catch((error) => {
    console.error(`[Storage] Write failed for ${key}:`, error);
  });
  memoryStorage[key] = value;
}

export async function preloadStorage(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const allKeys = Object.values(KEYS);
    const values = await AsyncStorage.multiGet(allKeys);
    for (const [key, value] of values) {
      if (value !== null) {
        if (value === 'true' || value === 'false') {
          memoryStorage[key] = value === 'true';
        } else if (!isNaN(Number(value)) && value !== '') {
          memoryStorage[key] = Number(value);
        } else {
          memoryStorage[key] = value;
        }
      }
    }
  } catch (error) {
    console.error('[Storage] Preload failed:', error);
  }
}

export function getSettings(): AppSettings {
  return {
    apiUrl: getString(KEYS.API_URL) ?? '',
    apiKey: getString(KEYS.API_KEY) ?? '',
    serviceEnabled: getBoolean(KEYS.SERVICE_ENABLED) ?? false,
    pollingInterval: getNumber(KEYS.POLLING_INTERVAL) ?? DEFAULTS.POLLING_INTERVAL,
    heartbeatInterval: getNumber(KEYS.HEARTBEAT_INTERVAL) ?? DEFAULTS.HEARTBEAT_INTERVAL,
    smsCheckMaxCount: getNumber(KEYS.SMS_CHECK_MAX_COUNT) ?? DEFAULTS.SMS_CHECK_MAX_COUNT,
    smsCheckIntervalMs: getNumber(KEYS.SMS_CHECK_INTERVAL_MS) ?? DEFAULTS.SMS_CHECK_INTERVAL_MS,
  };
}

export function setApiUrl(url: string): void {
  const secureUrl = url.startsWith('http://') ? url.replace('http://', 'https://') : url;
  setValue(KEYS.API_URL, secureUrl);
}

export function setApiKey(key: string): void {
  setValue(KEYS.API_KEY, key);
}

export function setServiceEnabled(enabled: boolean): void {
  setValue(KEYS.SERVICE_ENABLED, enabled);
}

export function setPollingInterval(seconds: number): void {
  setValue(KEYS.POLLING_INTERVAL, seconds);
}

export function setHeartbeatInterval(seconds: number): void {
  setValue(KEYS.HEARTBEAT_INTERVAL, seconds);
}

export function isConfigured(): boolean {
  const settings = getSettings();
  return settings.apiUrl.length > 0 && settings.apiKey.length > 0;
}

export function setSmsCheckMaxCount(count: number): void {
  setValue(KEYS.SMS_CHECK_MAX_COUNT, count);
}

export function setSmsCheckIntervalMs(ms: number): void {
  setValue(KEYS.SMS_CHECK_INTERVAL_MS, ms);
}

export function clearSettings(): void {
  AsyncStorage.clear().catch(console.error);
  Object.keys(memoryStorage).forEach((key) => delete memoryStorage[key]);
}

export { DEFAULTS };
