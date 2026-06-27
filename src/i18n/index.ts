import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en, { type TranslationKeys } from './en';
import cs from './cs';

const STORAGE_KEY = 'app_language';

type Locale = 'en' | 'cs';

const translations: Record<Locale, TranslationKeys> = { en, cs };

let currentLocale: Locale = 'en';
let listeners: Array<() => void> = [];

function getDeviceLocale(): Locale {
  try {
    const raw =
      Platform.OS === 'android'
        ? NativeModules.I18nManager?.localeIdentifier
        : NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
    if (raw && typeof raw === 'string' && raw.startsWith('cs')) return 'cs';
  } catch {}
  return 'en';
}

export async function initLocale(): Promise<void> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  currentLocale = saved === 'cs' || saved === 'en' ? saved : getDeviceLocale();
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => {});
  listeners.forEach((fn) => fn());
}

export function t(): TranslationKeys {
  return translations[currentLocale];
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export type { Locale };
