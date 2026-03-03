import { requireNativeModule, Platform, EventEmitter } from 'expo-modules-core';

interface SmsReceivedEvent {
  from: string;
  message: string;
  to: string;
}

interface SmsReceiverModuleType {
  startListening(): Promise<boolean>;
  stopListening(): Promise<void>;
}

const SmsReceiverNative: SmsReceiverModuleType | null =
  Platform.OS === 'android' ? requireNativeModule('SmsReceiver') : null;

const emitter = SmsReceiverNative
  ? new EventEmitter(SmsReceiverNative as any)
  : null;

export async function startListening(): Promise<boolean> {
  if (!SmsReceiverNative) return false;
  return SmsReceiverNative.startListening();
}

export async function stopListening(): Promise<void> {
  if (!SmsReceiverNative) return;
  return SmsReceiverNative.stopListening();
}

export function addListener(
  eventName: 'onSmsReceived',
  callback: (event: SmsReceivedEvent) => void
): { remove: () => void } {
  if (!emitter) {
    return { remove: () => {} };
  }
  const subscription = emitter.addListener(eventName, callback);
  return { remove: () => subscription.remove() };
}

export default {
  startListening,
  stopListening,
  addListener,
};
