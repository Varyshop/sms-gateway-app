import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isConfigured, getSettings, setServiceEnabled } from '../../src/storage/settings';
import { getApiClient } from '../../src/api/gatewayClient';
import { startSmsQueue, stopSmsQueue, stopSmsQueueFull, isQueueActive } from '../../src/services/smsQueueService';
import { startInboundSmsListener, stopInboundSmsListener } from '../../src/services/inboundSmsService';
import GatewayService, { ServiceStatus, onStatusChange } from '../../modules/gateway-service';
import { PhoneStats } from '../../src/types';

function formatLimit(value: number, limit: number): string {
  if (limit === 0) return `${value} / ∞`;
  return `${value} / ${limit}`;
}

function ProgressBar({ value, limit, color }: { value: number; limit: number; color: string }) {
  const progress = limit > 0 ? Math.min(value / limit, 1) : 0;
  const isWarning = limit > 0 && progress >= 0.85;
  const barColor = isWarning ? '#EF4444' : color;

  return (
    <View style={styles.progressBar}>
      <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: barColor }]} />
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [configured, setConfigured] = useState(false);
  const simpleMode = getSettings().simpleMode;
  const [serviceRunning, setServiceRunning] = useState(false);
  const [nativeServiceRunning, setNativeServiceRunning] = useState(false);
  const [nativePendingCount, setNativePendingCount] = useState(0);
  const [phoneStats, setPhoneStats] = useState<PhoneStats[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fcmConnected, setFcmConnected] = useState(false);

  useEffect(() => {
    setConfigured(isConfigured());
    setServiceRunning(isQueueActive());

    // Check native service status + FCM token
    GatewayService.getStatus().then((status) => {
      setNativeServiceRunning(status.isRunning);
      setFcmConnected(!!status.fcmToken);
      if (status.isRunning && !isQueueActive()) {
        setServiceRunning(true);
      }
    });

    // Real-time status updates from native service via EventEmitter
    const statusSubscription = onStatusChange((status: ServiceStatus) => {
      setNativeServiceRunning(status.isRunning);
      setFcmConnected(!!status.fcmToken);
      setNativePendingCount(status.pendingCount);
      setPhoneStats((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((phone, i) =>
          i === 0
            ? {
                ...phone,
                sent_today: status.sentToday,
                sent_month: status.sentMonth,
                sent_total: status.sentTotal,
                daily_limit: status.dailyLimit,
                monthly_limit: status.monthlyLimit,
              }
            : phone
        );
      });
    });

    return () => {
      statusSubscription?.remove();
    };
  }, []);

  const fetchStats = useCallback(async () => {
    const client = getApiClient();
    if (!client) return;

    try {
      const response = await client.getStats();
      if (response.success) {
        setPhoneStats(response.phones);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    }
  }, []);

  useEffect(() => {
    if (configured) {
      fetchStats();
    }
  }, [configured, fetchStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const toggleService = async () => {
    if (serviceRunning) {
      await stopSmsQueueFull();
      stopInboundSmsListener();
      setServiceEnabled(false);
    } else {
      setServiceEnabled(true);
      startSmsQueue();
      startInboundSmsListener();
    }
    setServiceRunning(!serviceRunning);
  };

  if (!configured) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.emptyState}>
          <Ionicons name="qr-code-outline" size={64} color="#6B7280" />
          <Text style={styles.emptyTitle}>Není spárováno</Text>
          <Text style={styles.emptySubtitle}>
            Přejděte do Nastavení a naskenujte QR kód z Odoo
          </Text>
        </View>
      </View>
    );
  }

  const totalPending = nativePendingCount;
  const totalSentToday = phoneStats.reduce((a, p) => a + p.sent_today, 0);
  const totalSentMonth = phoneStats.reduce((a, p) => a + p.sent_month, 0);
  const totalSentAll = phoneStats.reduce((a, p) => a + p.sent_total, 0);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>SMS Gateway</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {!simpleMode && (
            <View style={[styles.statusBadge, fcmConnected ? styles.statusOnline : styles.statusOffline]}>
              <Ionicons name="notifications-outline" size={10} color="#F9FAFB" style={{ marginRight: 4 }} />
              <Text style={styles.statusText}>{fcmConnected ? 'FCM' : 'Poll'}</Text>
            </View>
          )}
          <View style={[styles.statusBadge, (serviceRunning || nativeServiceRunning) ? styles.statusOnline : styles.statusOffline]}>
            <View style={[styles.statusDot, (serviceRunning || nativeServiceRunning) ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.statusText}>{(serviceRunning || nativeServiceRunning) ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
      </View>

      {/* Toggle Button */}
      <TouchableOpacity
        style={[styles.toggleButton, serviceRunning ? styles.toggleStop : styles.toggleStart]}
        onPress={toggleService}
      >
        <Ionicons
          name={serviceRunning ? 'stop-circle-outline' : 'play-circle-outline'}
          size={24}
          color="#FFF"
        />
        <Text style={styles.toggleText}>
          {serviceRunning ? 'Zastavit odesílání' : 'Spustit odesílání'}
        </Text>
      </TouchableOpacity>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Global Summary */}
      {phoneStats.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="hourglass-outline" size={18} color="#FBBF24" />
              <Text style={styles.summaryValue}>{totalPending}</Text>
              <Text style={styles.summaryLabel}>Ve frontě</Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="today-outline" size={18} color="#3B82F6" />
              <Text style={styles.summaryValue}>{totalSentToday}</Text>
              <Text style={styles.summaryLabel}>Dnes</Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="calendar-outline" size={18} color="#8B5CF6" />
              <Text style={styles.summaryValue}>{totalSentMonth}</Text>
              <Text style={styles.summaryLabel}>Měsíc</Text>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="stats-chart-outline" size={18} color="#34D399" />
              <Text style={styles.summaryValue}>{totalSentAll}</Text>
              <Text style={styles.summaryLabel}>Celkem</Text>
            </View>
          </View>
        </View>
      )}

      {/* Phone Cards */}
      {phoneStats.map((phone) => {
        const phonePending = totalPending;

        return (
          <View key={phone.id} style={styles.phoneCard}>
            <View style={styles.phoneHeader}>
              <Text style={styles.phoneName}>{phone.name}</Text>
              <View style={[styles.statusBadge, phone.state === 'online' ? styles.statusOnline : styles.statusOffline]}>
                <View style={[styles.statusDot, phone.state === 'online' ? styles.dotOnline : styles.dotOffline]} />
                <Text style={styles.statusText}>{phone.state}</Text>
              </View>
            </View>

            <Text style={styles.phoneNumber}>SIM 1: {phone.phone_number}</Text>
            {phone.phone_number_2 && (
              <Text style={styles.phoneNumber}>SIM 2: {phone.phone_number_2}</Text>
            )}

            {/* Daily limit */}
            <View style={styles.limitSection}>
              <View style={styles.limitHeader}>
                <Text style={styles.limitLabel}>Denní limit</Text>
                <Text style={styles.limitValue}>{formatLimit(phone.sent_today, phone.daily_limit)}</Text>
              </View>
              <ProgressBar value={phone.sent_today} limit={phone.daily_limit} color="#3B82F6" />
            </View>

            {/* Monthly limit — advanced only */}
            {!simpleMode && (
              <View style={styles.limitSection}>
                <View style={styles.limitHeader}>
                  <Text style={styles.limitLabel}>Měsíční limit</Text>
                  <Text style={styles.limitValue}>{formatLimit(phone.sent_month, phone.monthly_limit)}</Text>
                </View>
                <ProgressBar value={phone.sent_month} limit={phone.monthly_limit} color="#8B5CF6" />
              </View>
            )}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, phonePending > 0 && styles.statValueWarning]}>
                  {phonePending}
                </Text>
                <Text style={styles.statLabel}>Ve frontě</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{phone.sent_today}</Text>
                <Text style={styles.statLabel}>Dnes</Text>
              </View>
              {!simpleMode && (
                <>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{phone.sent_month}</Text>
                    <Text style={styles.statLabel}>Měsíc</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{phone.sent_total}</Text>
                    <Text style={styles.statLabel}>Celkem</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{phone.rate_limit}/m</Text>
                    <Text style={styles.statLabel}>Rychlost</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        );
      })}

      {phoneStats.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Ionicons name="phone-portrait-outline" size={48} color="#6B7280" />
          <Text style={styles.emptySubtitle}>Žádné telefony nenalezeny</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F9FAFB',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusOnline: { backgroundColor: '#064E3B' },
  statusOffline: { backgroundColor: '#7F1D1D' },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotOnline: { backgroundColor: '#34D399' },
  dotOffline: { backgroundColor: '#F87171' },
  statusText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  toggleStart: { backgroundColor: '#2563EB' },
  toggleStop: { backgroundColor: '#DC2626' },
  toggleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
  },
  errorText: { color: '#FCA5A5', fontSize: 14 },

  // Global summary card
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: 'bold',
  },
  summaryLabel: {
    color: '#6B7280',
    fontSize: 11,
  },

  // Phone card
  phoneCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
  },
  phoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  phoneName: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '600',
  },
  phoneNumber: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 2,
  },

  // Limit sections
  limitSection: {
    marginTop: 10,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  limitLabel: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  limitValue: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  statItem: { alignItems: 'center' },
  statValue: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statValueWarning: {
    color: '#FBBF24',
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
