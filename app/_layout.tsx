import { Stack } from 'expo-router';
import { View, StatusBar, ActivityIndicator, Platform, PermissionsAndroid } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { getSettings, isConfigured, preloadStorage } from '../src/storage/settings';
import { initializeApiClient } from '../src/api/gatewayClient';
import { startHeartbeat, stopHeartbeat } from '../src/services/heartbeatService';
import { startSmsQueue, stopSmsQueue, setRateLimit } from '../src/services/smsQueueService';
import { startInboundSmsListener, stopInboundSmsListener } from '../src/services/inboundSmsService';
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

  useEffect(() => {
    const loadStorage = async () => {
      await preloadStorage();
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
      // Note: native foreground service keeps running intentionally
    };
  }, [storageReady]);

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
    <View style={{ flex: 1 }}>
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
    </View>
  );
};

export default AppLayout;
