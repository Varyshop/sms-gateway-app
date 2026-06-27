import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t, onLocaleChange, getLocale, setLocale, type Locale } from '../../src/i18n';
import {
  getSettings,
  setServiceEnabled,
  setPollingInterval,
  setHeartbeatInterval,
  setSmsCheckMaxCount,
  setSmsCheckIntervalMs,
  setSimpleMode,
  isConfigured,
  clearSettings,
} from "../../src/storage/settings";
import {
  initializeApiClient,
  clearApiClient,
} from "../../src/api/gatewayClient";
import {
  startSmsQueue,
  stopSmsQueue,
  stopSmsQueueFull,
} from "../../src/services/smsQueueService";
import {
  startInboundSmsListener,
  stopInboundSmsListener,
} from "../../src/services/inboundSmsService";
import GatewayService from "../../modules/gateway-service";
import SimManager, {
  SimCardInfo,
  getSimDisplayString,
} from "../../modules/sim-manager";
import DirectSms from "../../modules/direct-sms";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [settings, setSettingsState] = useState(getSettings());
  const [simCards, setSimCards] = useState<SimCardInfo[]>([]);
  const [pollIntervalText, setPollIntervalText] = useState(
    String(settings.pollingInterval),
  );
  const [heartbeatIntervalText, setHeartbeatIntervalText] = useState(
    String(settings.heartbeatInterval),
  );
  const [smsCheckMaxCountText, setSmsCheckMaxCountText] = useState(
    String(settings.smsCheckMaxCount),
  );
  const [smsCheckIntervalText, setSmsCheckIntervalText] = useState(
    String(Math.round(settings.smsCheckIntervalMs / 1000)),
  );
  const [smsCheckStatus, setSmsCheckStatus] = useState<string | null>(null);
  const [, setLangTick] = useState(0);

  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  useEffect(() => {
    loadSimCards();
    loadSmsCheckSettings();
  }, []);

  const loadSmsCheckSettings = async () => {
    try {
      const current = await DirectSms.getSmsCheckSettings();
      setSmsCheckMaxCountText(String(current.maxCount));
      setSmsCheckIntervalText(String(Math.round(current.intervalMs / 1000)));
      setSmsCheckStatus(null);
    } catch (error) {
      console.error("Failed to load SMS check settings:", error);
    }
  };

  const handleApplySmsCheckSettings = async () => {
    const maxCount = parseInt(smsCheckMaxCountText, 10);
    const intervalSec = parseInt(smsCheckIntervalText, 10);
    if (
      isNaN(maxCount) ||
      maxCount < 1 ||
      isNaN(intervalSec) ||
      intervalSec < 1
    ) {
      setSmsCheckStatus(t().settings.invalidValues);
      return;
    }
    const intervalMs = intervalSec * 1000;
    try {
      await DirectSms.setSmsCheckSettings(maxCount, intervalMs);
      setSmsCheckMaxCount(maxCount);
      setSmsCheckIntervalMs(intervalMs);
      setSettingsState({
        ...settings,
        smsCheckMaxCount: maxCount,
        smsCheckIntervalMs: intervalMs,
      });
      setSmsCheckStatus(t().settings.saved);
      setTimeout(() => setSmsCheckStatus(null), 2000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t().common.error;
      setSmsCheckStatus(msg);
    }
  };

  const loadSimCards = async () => {
    try {
      const sims = await SimManager.getActiveSimCards();
      setSimCards(sims);
    } catch (error) {
      console.error("Failed to load SIM cards:", error);
    }
  };

  const handleQrScan = () => {
    router.push("/qr-scanner");
  };

  const handleToggleService = async (enabled: boolean) => {
    setServiceEnabled(enabled);
    setSettingsState({ ...settings, serviceEnabled: enabled });

    if (enabled && isConfigured()) {
      startSmsQueue();
      startInboundSmsListener();
    } else {
      await stopSmsQueueFull();
      stopInboundSmsListener();
    }
  };

  const handleSavePollingInterval = () => {
    const value = parseInt(pollIntervalText, 10);
    if (value > 0) {
      setPollingInterval(value);
      const newSettings = { ...settings, pollingInterval: value };
      setSettingsState(newSettings);
      // Update native service config
      if (settings.serviceEnabled) {
        GatewayService.updateConfig(
          newSettings.apiUrl,
          newSettings.apiKey,
          newSettings.serviceEnabled,
          newSettings.pollingInterval,
          newSettings.heartbeatInterval,
        );
        stopSmsQueue();
        startSmsQueue();
      }
    }
  };

  const handleSaveHeartbeatInterval = () => {
    const value = parseInt(heartbeatIntervalText, 10);
    if (value > 0) {
      setHeartbeatInterval(value);
      const newSettings = { ...settings, heartbeatInterval: value };
      setSettingsState(newSettings);
      if (settings.serviceEnabled) {
        GatewayService.updateConfig(
          newSettings.apiUrl,
          newSettings.apiKey,
          newSettings.serviceEnabled,
          newSettings.pollingInterval,
          newSettings.heartbeatInterval,
        );
      }
    }
  };

  const handleDisconnect = () => {
    Alert.alert(t().settings.disconnect.title, t().settings.disconnect.message, [
      { text: t().common.cancel, style: "cancel" },
      {
        text: t().settings.disconnect.confirm,
        style: "destructive",
        onPress: async () => {
          await stopSmsQueueFull();
          stopInboundSmsListener();
          clearApiClient();
          clearSettings();
          setSettingsState(getSettings());
        },
      },
    ]);
  };

  const refreshSettings = () => {
    setSettingsState(getSettings());
    setPollIntervalText(String(getSettings().pollingInterval));
    setHeartbeatIntervalText(String(getSettings().heartbeatInterval));
  };

  // Refresh settings when screen gains focus (e.g. returning from QR scanner)
  useFocusEffect(useCallback(() => {
    refreshSettings();
  }, []));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#111827" }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + 8 }]}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t().settings.title}</Text>

        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t().settings.connection}</Text>

          {isConfigured() ? (
            <>
              {settings.simpleMode ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t().settings.status}</Text>
                  <Text style={[styles.value, { color: "#34D399" }]}>
                    {t().settings.connected}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.row}>
                    <Text style={styles.label}>{t().settings.server}</Text>
                    <Text style={styles.value} numberOfLines={1}>
                      {settings.apiUrl}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>{t().settings.apiKey}</Text>
                    <Text style={styles.value}>
                      {"*".repeat(8)}...{settings.apiKey.slice(-4)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.dangerButton}
                    onPress={handleDisconnect}
                  >
                    <Ionicons name="unlink-outline" size={18} color="#F87171" />
                    <Text style={styles.dangerButtonText}>{t().settings.disconnectButton}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleQrScan}
            >
              <Ionicons name="qr-code-outline" size={20} color="#FFF" />
              <Text style={styles.primaryButtonText}>{t().settings.scanQrCode}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Mode Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t().settings.appMode}</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.label}>{t().settings.simpleMode}</Text>
              <Text
                style={[styles.hintText, { marginTop: 4, marginBottom: 0 }]}
              >
                {t().settings.simpleModeHint}
              </Text>
            </View>
            <Switch
              value={settings.simpleMode}
              onValueChange={(val) => {
                setSimpleMode(val);
                setSettingsState({ ...settings, simpleMode: val });
              }}
              trackColor={{ false: "#374151", true: "#1D4ED8" }}
              thumbColor={settings.simpleMode ? "#3B82F6" : "#9CA3AF"}
            />
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>{t().settings.language}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t().settings.language}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['en', 'cs'] as Locale[]).map((lang) => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setLocale(lang)}
                  style={[
                    styles.langButton,
                    getLocale() === lang && styles.langButtonActive,
                  ]}
                >
                  <Text style={[
                    styles.langButtonText,
                    getLocale() === lang && styles.langButtonTextActive,
                  ]}>
                    {lang === 'en' ? 'English' : 'Čeština'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* SIM Info */}
        {!settings.simpleMode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t().settings.simCards}</Text>
            {simCards.length > 0 ? (
              simCards.map((sim) => (
                <View key={sim.subscriptionId} style={styles.row}>
                  <Text style={styles.label}>SIM {sim.slotIndex + 1}</Text>
                  <Text style={styles.value}>{getSimDisplayString(sim)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>{t().settings.noSimCards}</Text>
            )}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={loadSimCards}
            >
              <Text style={styles.secondaryButtonText}>{t().settings.refresh}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Service Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t().settings.service}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.label}>{t().settings.smsSending}</Text>
            <Switch
              value={settings.serviceEnabled}
              onValueChange={handleToggleService}
              trackColor={{ false: "#374151", true: "#1D4ED8" }}
              thumbColor={settings.serviceEnabled ? "#3B82F6" : "#9CA3AF"}
            />
          </View>

          {!settings.simpleMode && (
            <>
              <View style={styles.inputRow}>
                <Text style={styles.label}>{t().settings.pollingInterval}</Text>
                <TextInput
                  style={styles.input}
                  value={pollIntervalText}
                  onChangeText={setPollIntervalText}
                  onBlur={handleSavePollingInterval}
                  keyboardType="numeric"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.label}>{t().settings.heartbeatInterval}</Text>
                <TextInput
                  style={styles.input}
                  value={heartbeatIntervalText}
                  onChangeText={setHeartbeatIntervalText}
                  onBlur={handleSaveHeartbeatInterval}
                  keyboardType="numeric"
                  placeholderTextColor="#6B7280"
                />
              </View>
            </>
          )}

          {!settings.simpleMode && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={async () => {
                try {
                  await GatewayService.rescanInbox();
                  Alert.alert(
                    t().settings.rescan.title,
                    t().settings.rescan.message,
                  );
                } catch (e) {
                  Alert.alert(t().common.error, t().settings.rescan.error);
                }
              }}
            >
              <Ionicons name="refresh-outline" size={16} color="#3B82F6" />
              <Text style={styles.secondaryButtonText}>
                {t().settings.rescanInbound}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SMS Limit Section — advanced only */}
        {!settings.simpleMode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t().settings.smsLimit}</Text>
            <Text style={styles.hintText}>
              {t().settings.smsLimitHint}
            </Text>

            <View style={styles.inputRow}>
              <Text style={styles.label}>{t().settings.maxSmsInInterval}</Text>
              <TextInput
                style={styles.input}
                value={smsCheckMaxCountText}
                onChangeText={setSmsCheckMaxCountText}
                keyboardType="numeric"
                placeholderTextColor="#6B7280"
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.label}>{t().settings.intervalSeconds}</Text>
              <TextInput
                style={styles.input}
                value={smsCheckIntervalText}
                onChangeText={setSmsCheckIntervalText}
                keyboardType="numeric"
                placeholderTextColor="#6B7280"
              />
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleApplySmsCheckSettings}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color="#FFF"
              />
              <Text style={styles.primaryButtonText}>{t().settings.apply}</Text>
            </TouchableOpacity>

            {smsCheckStatus && (
              <Text
                style={[
                  styles.hintText,
                  {
                    marginTop: 8,
                    color: smsCheckStatus === t().settings.saved ? "#34D399" : "#F87171",
                  },
                ]}
              >
                {smsCheckStatus}
              </Text>
            )}
          </View>
        )}

        {/* App Version */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t().settings.about}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t().settings.version}</Text>
            <Text style={styles.value}>
              {Constants.expoConfig?.version ?? "—"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t().settings.build}</Text>
            <Text style={styles.value}>
              {Constants.expoConfig?.android?.versionCode ??
                Constants.expoConfig?.extra?.eas?.projectId?.slice(0, 8) ??
                "—"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  contentContainer: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#F9FAFB",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#1F2937",
    borderRadius: 12,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  label: {
    color: "#D1D5DB",
    fontSize: 15,
  },
  value: {
    color: "#6B7280",
    fontSize: 14,
    maxWidth: "60%",
    textAlign: "right",
  },
  input: {
    backgroundColor: "#374151",
    color: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    width: 80,
    textAlign: "center",
    fontSize: 15,
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    paddingVertical: 8,
  },
  hintText: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 16,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 8,
  },
  secondaryButtonText: {
    color: "#3B82F6",
    fontSize: 14,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 8,
    gap: 6,
  },
  dangerButtonText: {
    color: "#F87171",
    fontSize: 14,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#1F2937",
    borderRadius: 12,
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#374151',
  },
  langButtonActive: {
    backgroundColor: '#2563EB',
  },
  langButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  langButtonTextActive: {
    color: '#FFF',
  },
});
