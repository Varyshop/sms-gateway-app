import { Stack } from 'expo-router';
import { View, Text, StatusBar, ActivityIndicator, Platform, PermissionsAndroid, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { getSettings, isConfigured, preloadStorage } from '../src/storage/settings';
import { initializeApiClient } from '../src/api/gatewayClient';
import { startHeartbeat, stopHeartbeat } from '../src/services/heartbeatService';
import { startSmsQueue, stopSmsQueue, setRateLimit, loadHistory } from '../src/services/smsQueueService';
import { startInboundSmsListener, stopInboundSmsListener } from '../src/services/inboundSmsService';
import {
  startUpdateService,
  stopUpdateService,
  onUpdateAvailable,
  onDownloadProgress,
  downloadAndInstall,
  isDownloading,
} from '../src/services/updateService';
import { AppUpdate } from '../src/types';
import GatewayService from '../modules/gateway-service';

SplashScreen.preventAutoHideAsync();

async function requestSmsPermissions() {
  if (Platform.OS !== 'android') return false;
  try {
    const perms: Array<(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]> = [
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS,
    ];
    // Android 13+ requires POST_NOTIFICATIONS for FCM push
    if (Number(Platform.Version) >= 33) {
      perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    const result = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(result).every(
      (status) => status === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (e) {
    console.error('[Permissions] Error requesting SMS permissions:', e);
    return false;
  }
}

async function requestBatteryOptimizationExemption() {
  if (Platform.OS !== 'android') return;
  try {
    const isExempt = await GatewayService.isBatteryOptimizationDisabled();
    if (!isExempt) {
      console.log('[Battery] Requesting battery optimization exemption');
      await GatewayService.requestBatteryOptimizationExemption();
    } else {
      console.log('[Battery] Already exempt from battery optimization');
    }
  } catch (e) {
    console.warn('[Battery] Could not request battery exemption:', e);
  }
}

const AppLayout = () => {
  const [storageReady, setStorageReady] = useState(false);
  const servicesInitialized = useRef(false);
  const [forceUpdate, setForceUpdate] = useState<AppUpdate | null>(null);
  const [dlProgress, setDlProgress] = useState(0);
  const [dlActive, setDlActive] = useState(false);

  useEffect(() => {
    const loadStorage = async () => {
      await preloadStorage();
      await loadHistory();
      await requestSmsPermissions();
      // Request battery optimization exemption early — needed for
      // reliable background SMS delivery even when screen is off.
      await requestBatteryOptimizationExemption();
      setStorageReady(true);
    };
    loadStorage();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || servicesInitialized.current || !storageReady) {
      return;
    }

    const initializeServices = async () => {
      try {
        const settings = getSettings();

        if (settings.apiUrl && settings.apiKey) {
          initializeApiClient(settings.apiUrl, settings.apiKey);
        }

        if (isConfigured() && settings.serviceEnabled) {
          // Start native foreground service (survives screen-off)
          startSmsQueue();
          // JS-side heartbeat (supplement, only runs in foreground)
          startHeartbeat();
          // JS-side inbound listener (supplement, native receiver handles background)
          startInboundSmsListener();
          startUpdateService();
        }

        servicesInitialized.current = true;
      } catch (e) {
        console.error('[App] Error initializing services:', e);
      }
    };

    initializeServices();

    return () => {
      stopHeartbeat();
      stopSmsQueue();
      stopInboundSmsListener();
      stopUpdateService();
      // Note: native foreground service keeps running intentionally
    };
  }, [storageReady]);

  useEffect(() => {
    const unsubUpdate = onUpdateAvailable((update) => {
      if (update?.force) {
        setForceUpdate(update);
      } else {
        setForceUpdate(null);
      }
    });
    const unsubProgress = onDownloadProgress((p) => {
      setDlProgress(p);
      setDlActive(isDownloading());
    });
    return () => {
      unsubUpdate();
      unsubProgress();
    };
  }, []);

  useEffect(() => {
    if (storageReady) {
      SplashScreen.hideAsync();
    }
  }, [storageReady]);

  if (!storageReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#111827' }}>
        <StatusBar backgroundColor="#111827" barStyle="light-content" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="qr-scanner"
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
        {forceUpdate && (
          <View style={forceStyles.overlay}>
            <View style={forceStyles.card}>
              <Text style={forceStyles.title}>Vyžadována aktualizace</Text>
              <Text style={forceStyles.version}>Verze {forceUpdate.version}</Text>
              {forceUpdate.release_notes ? (
                <Text style={forceStyles.notes}>{forceUpdate.release_notes}</Text>
              ) : null}
              {dlActive ? (
                <View style={forceStyles.progressContainer}>
                  <View style={forceStyles.progressBar}>
                    <View style={[forceStyles.progressFill, { width: `${Math.round(dlProgress * 100)}%` }]} />
                  </View>
                  <Text style={forceStyles.progressText}>{Math.round(dlProgress * 100)} %</Text>
                </View>
              ) : (
                <TouchableOpacity style={forceStyles.button} onPress={downloadAndInstall}>
                  <Text style={forceStyles.buttonText}>Aktualizovat nyní</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
};

const forceStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 28,
    marginHorizontal: 24,
    width: '85%',
    alignItems: 'center',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  version: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 16,
  },
  notes: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
});

export default AppLayout;
