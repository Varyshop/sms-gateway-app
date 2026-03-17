import { useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getSettings,
  setServiceEnabled,
  setPollingInterval,
  setHeartbeatInterval,
  setSmsCheckMaxCount,
  setSmsCheckIntervalMs,
  isConfigured,
  clearSettings,
} from "../../src/storage/settings";
import {
  initializeApiClient,
  clearApiClient,
} from "../../src/api/gatewayClient";
import {
  startHeartbeat,
  stopHeartbeat,
} from "../../src/services/heartbeatService";
import {
  startSmsQueue,
  stopSmsQueue,
  stopSmsQueueFull,
} from "../../src/services/smsQueueService";
import { startInboundSmsListener, stopInboundSmsListener } from "../../src/services/inboundSmsService";
import GatewayService from "../../modules/gateway-service";
import SimManager, {
  SimCardInfo,
  getSimDisplayString,
} from "../../modules/sim-manager";
import DirectSms from "../../modules/direct-sms";

export default function SettingsScreen() {
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
      setSmsCheckStatus("Neplatne hodnoty");
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
      setSmsCheckStatus("Ulozeno");
      setTimeout(() => setSmsCheckStatus(null), 2000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Chyba";
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
      startHeartbeat();
      startSmsQueue();
      startInboundSmsListener();
    } else {
      stopHeartbeat();
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
          newSettings.apiUrl, newSettings.apiKey, newSettings.serviceEnabled,
          newSettings.pollingInterval, newSettings.heartbeatInterval
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
      // Update native service config
      if (settings.serviceEnabled) {
        GatewayService.updateConfig(
          newSettings.apiUrl, newSettings.apiKey, newSettings.serviceEnabled,
          newSettings.pollingInterval, newSettings.heartbeatInterval
        );
        stopHeartbeat();
        startHeartbeat();
      }
    }
  };

  const handleDisconnect = () => {
    Alert.alert("Odpojit", "Opravdu chcete odpojit telefon od serveru?", [
      { text: "Zrusit", style: "cancel" },
      {
        text: "Odpojit",
        style: "destructive",
        onPress: async () => {
          stopHeartbeat();
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

  // Refresh settings when returning from QR scanner
  useEffect(() => {
    const interval = setInterval(refreshSettings, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Nastaveni</Text>

        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pripojeni</Text>

          {isConfigured() ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Server</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {settings.apiUrl}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>API Key</Text>
                <Text style={styles.value}>
                  {"*".repeat(8)}...{settings.apiKey.slice(-4)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleDisconnect}
              >
                <Ionicons name="unlink-outline" size={18} color="#F87171" />
                <Text style={styles.dangerButtonText}>Odpojit</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleQrScan}
            >
              <Ionicons name="qr-code-outline" size={20} color="#FFF" />
              <Text style={styles.primaryButtonText}>Naskenovat QR kod</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SIM Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SIM karty</Text>
          {simCards.length > 0 ? (
            simCards.map((sim) => (
              <View key={sim.subscriptionId} style={styles.row}>
                <Text style={styles.label}>SIM {sim.slotIndex + 1}</Text>
                <Text style={styles.value}>{getSimDisplayString(sim)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Zadne SIM karty nenalezeny</Text>
          )}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={loadSimCards}
          >
            <Text style={styles.secondaryButtonText}>Obnovit</Text>
          </TouchableOpacity>
        </View>

        {/* Service Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sluzba</Text>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Odesilani SMS</Text>
            <Switch
              value={settings.serviceEnabled}
              onValueChange={handleToggleService}
              trackColor={{ false: "#374151", true: "#1D4ED8" }}
              thumbColor={settings.serviceEnabled ? "#3B82F6" : "#9CA3AF"}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>Polling interval (s)</Text>
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
            <Text style={styles.label}>Heartbeat interval (s)</Text>
            <TextInput
              style={styles.input}
              value={heartbeatIntervalText}
              onChangeText={setHeartbeatIntervalText}
              onBlur={handleSaveHeartbeatInterval}
              keyboardType="numeric"
              placeholderTextColor="#6B7280"
            />
          </View>
        </View>

        {/* SMS Limit Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SMS limit (Android)</Text>
          <Text style={styles.hintText}>
            Maximalni pocet SMS v intervalu pred systemovym alertem. Vyzaduje
            ADB: adb shell pm grant com.varyshop.smsgatewayapp
            android.permission.WRITE_SECURE_SETTINGS
          </Text>

          <View style={styles.inputRow}>
            <Text style={styles.label}>Max SMS v intervalu</Text>
            <TextInput
              style={styles.input}
              value={smsCheckMaxCountText}
              onChangeText={setSmsCheckMaxCountText}
              keyboardType="numeric"
              placeholderTextColor="#6B7280"
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>Interval (s)</Text>
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
            <Ionicons name="shield-checkmark-outline" size={18} color="#FFF" />
            <Text style={styles.primaryButtonText}>Aplikovat</Text>
          </TouchableOpacity>

          {smsCheckStatus && (
            <Text
              style={[
                styles.hintText,
                {
                  marginTop: 8,
                  color: smsCheckStatus === "Ulozeno" ? "#34D399" : "#F87171",
                },
              ]}
            >
              {smsCheckStatus}
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
    paddingTop: 48,
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
});
