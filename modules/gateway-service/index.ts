import { requireNativeModule, Platform, EventEmitter, Subscription } from "expo-modules-core";

export interface SmsResultEvent {
  smsId: number;
  phoneNumber: string;
  message: string;
  status: 'sent' | 'error';
  errorMessage?: string;
}

export interface ServiceStatus {
  isRunning: boolean;
  lastPollTime: number;
  lastHeartbeatTime: number;
  pendingCount: number;
  sentToday: number;
  sentMonth: number;
  sentTotal: number;
  dailyLimit: number;
  monthlyLimit: number;
  sessionSentCount: number;
  sessionErrorCount: number;
  fcmToken: string;
}

interface GatewayServiceModule {
  startService(
    apiUrl: string,
    apiKey: string,
    serviceEnabled: boolean,
    pollingInterval: number,
    heartbeatInterval: number,
  ): Promise<boolean>;
  stopService(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  getStatus(): Promise<ServiceStatus>;
  updateConfig(
    apiUrl: string,
    apiKey: string,
    serviceEnabled: boolean,
    pollingInterval: number,
    heartbeatInterval: number,
  ): Promise<boolean>;
  isBatteryOptimizationDisabled(): Promise<boolean>;
  requestBatteryOptimizationExemption(): Promise<boolean>;
  rescanInbox(): Promise<boolean>;
  getFcmToken(): Promise<string | null>;
  triggerImmediatePoll(): Promise<boolean>;
  getStatusCounts(): Promise<{ unsyncedCount: number; totalCount: number }>;
}

const GatewayService: GatewayServiceModule | null =
  Platform.OS === "android" ? requireNativeModule("GatewayService") : null;

const emitter = GatewayService ? new EventEmitter(GatewayService as any) : null;

/**
 * Subscribe to real-time status updates from the native service.
 * Fires whenever counters change (SMS sent, pending updated, heartbeat, etc.)
 */
export function onStatusChange(callback: (status: ServiceStatus) => void): Subscription | null {
  if (!emitter) return null;
  return emitter.addListener("onStatusChange", callback);
}

/**
 * Start the native foreground service for SMS gateway.
 * The service runs independently of React Native and survives screen-off / background.
 */
export async function startService(
  apiUrl: string,
  apiKey: string,
  serviceEnabled: boolean,
  pollingInterval: number,
  heartbeatInterval: number,
): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.startService(
    apiUrl,
    apiKey,
    serviceEnabled,
    pollingInterval,
    heartbeatInterval,
  );
}

/**
 * Stop the native foreground service.
 */
export async function stopService(): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.stopService();
}

/**
 * Check if the native service is currently running.
 */
export async function isRunning(): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.isRunning();
}

/**
 * Get current service status for UI display.
 */
export async function getStatus(): Promise<ServiceStatus> {
  if (!GatewayService) {
    return {
      isRunning: false,
      lastPollTime: 0,
      lastHeartbeatTime: 0,
      pendingCount: 0,
      sentToday: 0,
      sentMonth: 0,
      sentTotal: 0,
      dailyLimit: 0,
      monthlyLimit: 0,
      sessionSentCount: 0,
      sessionErrorCount: 0,
      fcmToken: '',
    };
  }
  return GatewayService.getStatus();
}

/**
 * Update service configuration without restart.
 */
export async function updateConfig(
  apiUrl: string,
  apiKey: string,
  serviceEnabled: boolean,
  pollingInterval: number,
  heartbeatInterval: number,
): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.updateConfig(
    apiUrl,
    apiKey,
    serviceEnabled,
    pollingInterval,
    heartbeatInterval,
  );
}

/**
 * Check if battery optimization is disabled (app is exempt from Doze).
 */
export async function isBatteryOptimizationDisabled(): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.isBatteryOptimizationDisabled();
}

/**
 * Request the user to disable battery optimization for this app.
 * Opens a system dialog.
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.requestBatteryOptimizationExemption();
}

/**
 * Reset the retroactive check timestamp and rescan the SMS inbox.
 * Sends all messages from the last 30 days to the server.
 */
export async function rescanInbox(): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.rescanInbox();
}

/**
 * Get the current FCM token for this device.
 * Returns null if Firebase is not available.
 */
export async function getFcmToken(): Promise<string | null> {
  if (!GatewayService) return null;
  return GatewayService.getFcmToken();
}

/**
 * Subscribe to individual SMS result events from the native service.
 * Fires after each SMS is sent or fails, with full details for UI history.
 */
export function onSmsResult(callback: (event: SmsResultEvent) => void): Subscription | null {
  if (!emitter) return null;
  return emitter.addListener("onSmsResult", callback);
}

/**
 * Trigger an immediate poll cycle in the native service.
 */
export async function triggerImmediatePoll(): Promise<boolean> {
  if (!GatewayService) return false;
  return GatewayService.triggerImmediatePoll();
}

/**
 * Get SMS status counts from the persistent SQLite database.
 */
export async function getStatusCounts(): Promise<{ unsyncedCount: number; totalCount: number }> {
  if (!GatewayService) return { unsyncedCount: 0, totalCount: 0 };
  return GatewayService.getStatusCounts();
}

export default {
  startService,
  stopService,
  isRunning,
  getStatus,
  updateConfig,
  isBatteryOptimizationDisabled,
  requestBatteryOptimizationExemption,
  rescanInbox,
  getFcmToken,
  onStatusChange,
  onSmsResult,
  triggerImmediatePoll,
  getStatusCounts,
};
