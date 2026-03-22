import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApiClient } from '../../src/api/gatewayClient';
import { InboundSmsItem } from '../../src/types';

type Filter = 'all' | 'stop';

const PAGE_SIZE = 50;

export default function InboundScreen() {
  const [messages, setMessages] = useState<InboundSmsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessages = useCallback(async (offset = 0, append = false) => {
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.getInboundHistory(PAGE_SIZE, offset, filter === 'stop');
      if (res.success) {
        setMessages((prev) => append ? [...prev, ...res.messages] : res.messages);
        setTotal(res.total);
        setHasMore(offset + res.messages.length < res.total);
      }
    } catch (e) {
      console.error('[Inbound] Fetch error:', e);
    }
  }, [filter]);

  useEffect(() => {
    setInitialLoading(true);
    fetchMessages(0, false).finally(() => setInitialLoading(false));
  }, [fetchMessages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMessages(0, false);
    setRefreshing(false);
  }, [fetchMessages]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchMessages(messages.length, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages.length, fetchMessages]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }: { item: InboundSmsItem }) => (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={styles.itemLeft}>
          <Ionicons
            name={item.is_stop ? 'hand-left' : 'mail'}
            size={20}
            color={item.is_stop ? '#F87171' : '#3B82F6'}
          />
          <Text style={styles.phoneNumber}>{item.from_number}</Text>
          {item.is_stop && (
            <View style={styles.stopBadge}>
              <Text style={styles.stopBadgeText}>STOP</Text>
            </View>
          )}
        </View>
        <Text style={styles.time}>{formatDateTime(item.received_at)}</Text>
      </View>
      <Text style={styles.message} numberOfLines={3}>{item.message}</Text>
      {item.partner_name ? (
        <Text style={styles.partner}>{item.partner_name}</Text>
      ) : null}
      {item.blacklisted && (
        <Text style={styles.blacklisted}>Pridano na blacklist</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Prichozi SMS</Text>
        <Text style={styles.count}>{total} celkem</Text>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'stop'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'Vse' : 'STOP'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {initialLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.emptyText}>Nacitam...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#3B82F6" style={{ padding: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>Zadne prichozi SMS</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F9FAFB',
  },
  count: {
    color: '#6B7280',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1F2937',
  },
  filterTabActive: {
    backgroundColor: '#2563EB',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  item: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phoneNumber: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '500',
  },
  stopBadge: {
    backgroundColor: '#991B1B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stopBadgeText: {
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '700',
  },
  time: {
    color: '#6B7280',
    fontSize: 12,
  },
  message: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
  },
  partner: {
    color: '#60A5FA',
    fontSize: 12,
    marginTop: 4,
  },
  blacklisted: {
    color: '#F87171',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
  },
});
