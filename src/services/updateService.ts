import { Paths, File } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system';
import { onHeartbeat } from './heartbeatService';
import { getSettings } from '../storage/settings';
import { installApk } from '../../modules/apk-installer';
import { AppUpdate } from '../types';

let currentUpdate: AppUpdate | null = null;
let listeners: ((update: AppUpdate | null) => void)[] = [];
let downloading = false;
let downloadProgress = 0;
let progressListeners: ((progress: number) => void)[] = [];
let dismissed = false;
let unsubscribe: (() => void) | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener(currentUpdate);
  }
}

function notifyProgress(progress: number) {
  downloadProgress = progress;
  for (const listener of progressListeners) {
    listener(progress);
  }
}

export function startUpdateService(): void {
  if (unsubscribe) return;
  unsubscribe = onHeartbeat((response) => {
    const update = response.app_update;
    if (update?.available) {
      if (!currentUpdate || currentUpdate.version_code !== update.version_code) {
        dismissed = false;
      }
      currentUpdate = update;
    } else {
      currentUpdate = null;
    }
    notifyListeners();
  });
}

export function stopUpdateService(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export function getAvailableUpdate(): AppUpdate | null {
  return currentUpdate;
}

export function isDownloading(): boolean {
  return downloading;
}

export function getDownloadProgress(): number {
  return downloadProgress;
}

export function isDismissed(): boolean {
  return dismissed;
}

export function dismissUpdate(): void {
  dismissed = true;
  notifyListeners();
}

export function onUpdateAvailable(callback: (update: AppUpdate | null) => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function onDownloadProgress(callback: (progress: number) => void): () => void {
  progressListeners.push(callback);
  return () => {
    progressListeners = progressListeners.filter((l) => l !== callback);
  };
}

export async function downloadAndInstall(): Promise<void> {
  if (!currentUpdate || downloading) return;

  const settings = getSettings();
  const url = `${settings.apiUrl}${currentUpdate.download_url}`;

  downloading = true;
  notifyProgress(0);
  notifyListeners();

  try {
    const downloadDest = new File(Paths.cache, 'sms-gateway-update.apk');
    const destUri = downloadDest.uri;

    const downloadResumable = createDownloadResumable(
      url,
      destUri,
      { headers: { 'X-API-Key': settings.apiKey } },
      (progress) => {
        const pct = progress.totalBytesExpectedToWrite > 0
          ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
          : 0;
        notifyProgress(pct);
      },
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) {
      throw new Error('Download failed — no file returned');
    }

    notifyProgress(1);
    await installApk(result.uri.replace('file://', ''));
  } finally {
    downloading = false;
    notifyListeners();
  }
}
