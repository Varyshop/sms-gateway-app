import { Platform } from 'react-native';
import { getApiClient } from '../api/gatewayClient';
import { getSettings } from '../storage/settings';
import SimManager from '../../modules/sim-manager';
import { HeartbeatResponse } from '../types';

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastResponse: HeartbeatResponse | null = null;
let listeners: ((response: HeartbeatResponse) => void)[] = [];

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
    console.error('[Heartbeat] Failed to get SIM numbers:', error);
  }
  return numbers;
}

async function sendHeartbeat(): Promise<void> {
  const client = getApiClient();
  if (!client) return;

  try {
    const phoneNumbers = await getPhoneNumbers();
    if (phoneNumbers.length === 0) {
      console.warn('[Heartbeat] No phone numbers available');
      return;
    }

    const response = await client.heartbeat(phoneNumbers);
    lastResponse = response;

    // Notify listeners
    for (const listener of listeners) {
      listener(response);
    }

    console.log('[Heartbeat] OK, pending:', response.pending_count);
  } catch (error) {
    console.error('[Heartbeat] Failed:', error);
  }
}

export function startHeartbeat(): void {
  if (Platform.OS !== 'android') return;

  stopHeartbeat();

  const settings = getSettings();
  const intervalMs = settings.heartbeatInterval * 1000;

  console.log(`[Heartbeat] Starting with ${settings.heartbeatInterval}s interval`);

  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, intervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function getLastHeartbeat(): HeartbeatResponse | null {
  return lastResponse;
}

export function onHeartbeat(callback: (response: HeartbeatResponse) => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function isHeartbeatActive(): boolean {
  return heartbeatInterval !== null;
}

export default {
  startHeartbeat,
  stopHeartbeat,
  getLastHeartbeat,
  onHeartbeat,
  isHeartbeatActive,
};
