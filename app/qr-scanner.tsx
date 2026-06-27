import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { t, onLocaleChange } from '../src/i18n';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { setApiUrl, setApiKey } from '../src/storage/settings';
import { initializeApiClient, getApiClient } from '../src/api/gatewayClient';
import { getFcmToken } from '../modules/gateway-service';
import { QrCodeData } from '../src/types';

export default function QrScannerScreen() {
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const parsed: QrCodeData = JSON.parse(data);

      if (parsed.type !== 'sms_gateway') {
        Alert.alert(t().qrScanner.invalidQr.title, t().qrScanner.invalidQr.notGateway, [
          { text: 'OK', onPress: () => setScanned(false) },
        ]);
        return;
      }

      if (!parsed.url || !parsed.api_key) {
        Alert.alert(t().qrScanner.invalidQr.title, t().qrScanner.invalidQr.missingData, [
          { text: 'OK', onPress: () => setScanned(false) },
        ]);
        return;
      }

      // Save settings
      setApiUrl(parsed.url);
      setApiKey(parsed.api_key);

      // Initialize API client
      initializeApiClient(parsed.url, parsed.api_key);

      // Register FCM token with server for push notifications
      try {
        const fcmToken = await getFcmToken();
        if (fcmToken) {
          const client = getApiClient();
          await client?.registerFcmToken(fcmToken);
          console.log('[QR] FCM token registered with server');
        }
      } catch (e) {
        console.warn('[QR] FCM token registration failed:', e);
      }

      Alert.alert(
        t().qrScanner.paired.title,
        t().qrScanner.paired.message(parsed.url),
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert(t().common.error, t().qrScanner.readError, [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>{t().qrScanner.loadingCamera}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={64} color="#6B7280" />
        <Text style={styles.text}>{t().qrScanner.cameraPermission}</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t().qrScanner.allowCamera}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>{t().common.cancel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.instruction}>
            {t().qrScanner.instruction}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const CORNER_SIZE = 30;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  scanArea: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#3B82F6',
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#3B82F6',
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#3B82F6',
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#3B82F6',
  },
  instruction: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 30,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  text: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 12,
    padding: 8,
  },
  cancelText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
