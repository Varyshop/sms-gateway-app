import { requireNativeModule, Platform } from "expo-modules-core";

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
}

const GatewayService: GatewayServiceModule | null =
  Platform.OS === "android" ? requireNativeModule("GatewayService") : null;

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
      sentCount: 0,
      errorCount: 0,
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

export default {
  startService,
  stopService,
  isRunning,
  getStatus,
  updateConfig,
  isBatteryOptimizationDisabled,
  requestBatteryOptimizationExemption,
};
