import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiClient } from '../../src/api/gatewayClient';
import { InboundSmsItem } from '../../src/types';

type Filter = 'all' | 'stop' | 'stop_not_blacklisted';

const PAGE_SIZE = 50;

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Vše',
  stop: 'STOP',
  stop_not_blacklisted: 'Neblokované',
};

export default function InboundScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<InboundSmsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [blacklisting, setBlacklisting] = useState(false);

  const fetchMessages = useCallback(async (offset = 0, append = false) => {
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.getInboundHistory(PAGE_SIZE, offset, filter);
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
    setSelected(new Set());
    fetchMessages(0, false).finally(() => setInitialLoading(false));
  }, [fetchMessages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setSelected(new Set());
    await fetchMessages(0, false);
    setRefreshing(false);
  }, [fetchMessages]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchMessages(messages.length, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages.length, fetchMessages]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unblacklisted = messages.filter((m) => m.is_stop && !m.blacklisted);
    if (selected.size === unblacklisted.length && unblacklisted.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unblacklisted.map((m) => m.id)));
    }
  };

  const blacklistSelected = async () => {
    const client = getApiClient();
    if (!client || selected.size === 0) return;

    Alert.alert(
      'Přidat na blacklist',
      `Opravdu chcete přidat ${selected.size} čísel na blacklist?`,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Přidat',
          style: 'destructive',
          onPress: async () => {
            setBlacklisting(true);
            try {
              const res = await client.blacklistInbound(Array.from(selected));
              if (res.success) {
                setSelected(new Set());
                await fetchMessages(0, false);
                Alert.alert('Hotovo', `Přidáno ${res.blacklisted} čísel na blacklist`);
              }
            } catch (e) {
              Alert.alert('Chyba', 'Nepodařilo se přidat na blacklist');
            } finally {
              setBlacklisting(false);
            }
          },
        },
      ],
    );
  };

  const blacklistSingle = async (item: InboundSmsItem) => {
    const client = getApiClient();
    if (!client) return;

    Alert.alert(
      'Přidat na blacklist',
      `Přidat ${item.from_number} na blacklist?`,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Přidat',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await client.blacklistInbound([item.id]);
              if (res.success) {
                setMessages((prev) =>
                  prev.map((m) => m.id === item.id ? { ...m, blacklisted: true } : m)
                );
              }
            } catch (e) {
              Alert.alert('Chyba', 'Nepodařilo se přidat na blacklist');
            }
          },
        },
      ],
    );
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }: { item: InboundSmsItem }) => {
    const isSelectable = item.is_stop && !item.blacklisted;
    const isSelected = selected.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.item, isSelected && styles.itemSelected]}
        onPress={() => isSelectable && toggleSelect(item.id)}
        onLongPress={() => isSelectable && blacklistSingle(item)}
        activeOpacity={isSelectable ? 0.7 : 1}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemLeft}>
            {isSelectable && (
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={isSelected ? '#3B82F6' : '#6B7280'}
              />
            )}
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
        {item.blacklisted ? (
          <Text style={styles.blacklisted}>
            <Ionicons name="checkmark-circle" size={11} color="#F87171" /> Na blacklistu
          </Text>
        ) : item.is_stop ? (
          <TouchableOpacity onPress={() => blacklistSingle(item)} style={styles.blacklistBtn}>
            <Ionicons name="ban-outline" size={13} color="#FBBF24" />
            <Text style={styles.blacklistBtnText}>Přidat na blacklist</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const hasUnblacklisted = messages.some((m) => m.is_stop && !m.blacklisted);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Příchozí SMS</Text>
        <Text style={styles.count}>{total} celkem</Text>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'stop', 'stop_not_blacklisted'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {FILTER_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bulk actions bar */}
      {(selected.size > 0 || hasUnblacklisted) && (
        <View style={styles.bulkBar}>
          {hasUnblacklisted && (
            <TouchableOpacity onPress={selectAll} style={styles.bulkBtn}>
              <Ionicons name="checkbox-outline" size={16} color="#9CA3AF" />
              <Text style={styles.bulkBtnText}>
                {selected.size > 0 ? `Vybrano (${selected.size})` : 'Vybrat vše'}
              </Text>
            </TouchableOpacity>
          )}
          {selected.size > 0 && (
            <TouchableOpacity
              onPress={blacklistSelected}
              style={[styles.bulkBtn, styles.bulkBtnDanger]}
              disabled={blacklisting}
            >
              {blacklisting ? (
                <ActivityIndicator size="small" color="#FCA5A5" />
              ) : (
                <>
                  <Ionicons name="ban" size={16} color="#FCA5A5" />
                  <Text style={styles.bulkBtnTextDanger}>
                    Blacklist ({selected.size})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {initialLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.emptyText}>Načítám...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          extraData={selected}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#3B82F6" style={{ padding: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {filter === 'stop_not_blacklisted'
                  ? 'Žádné neblokované STOP zprávy'
                  : 'Žádné příchozí SMS'}
              </Text>
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
    marginBottom: 8,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1F2937',
  },
  filterTabActive: {
    backgroundColor: '#2563EB',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  bulkBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    marginBottom: 4,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1F2937',
  },
  bulkBtnDanger: {
    backgroundColor: '#7F1D1D',
  },
  bulkBtnText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  bulkBtnTextDanger: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
  },
  item: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E3A5F',
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
    marginTop: 6,
    fontStyle: 'italic',
  },
  blacklistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#78350F',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  blacklistBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '500',
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
