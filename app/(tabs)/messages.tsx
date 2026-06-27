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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiClient } from '../../src/api/gatewayClient';
import { getSmsHistory, onHistoryChange } from '../../src/services/smsQueueService';
import GatewayService from '../../modules/gateway-service';
import { InboundSmsItem, SmsHistoryItem } from '../../src/types';
import { t, onLocaleChange } from '../../src/i18n';

// ---- Types ----

type Direction = 'outbound' | 'inbound';
type InboundFilter = 'all' | 'stop' | 'stop_not_blacklisted';

type OutboundFilter = 'all' | 'sent' | 'error';

const PAGE_SIZE = 50;

// ---- Component ----

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  const [direction, setDirection] = useState<Direction>('outbound');

  const [search, setSearch] = useState('');

  // Outbound state (local in-memory history)
  const [outHistory, setOutHistory] = useState<SmsHistoryItem[]>([]);
  const [outFilter, setOutFilter] = useState<OutboundFilter>('all');

  // Inbound state (from server)
  const [inMessages, setInMessages] = useState<InboundSmsItem[]>([]);
  const [inTotal, setInTotal] = useState(0);
  const [inFilter, setInFilter] = useState<InboundFilter>('all');
  const [inInitialLoading, setInInitialLoading] = useState(true);
  const [inRefreshing, setInRefreshing] = useState(false);
  const [inLoadingMore, setInLoadingMore] = useState(false);
  const [inHasMore, setInHasMore] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [blacklisting, setBlacklisting] = useState(false);

  // ---- Outbound ----

  useEffect(() => {
    setOutHistory(getSmsHistory());
    const unsubscribe = onHistoryChange(setOutHistory);
    return unsubscribe;
  }, []);

  const filteredOut = outHistory.filter((item) => {
    if (outFilter !== 'all' && item.status !== outFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.phone_number.toLowerCase().includes(q) || item.message.toLowerCase().includes(q);
    }
    return true;
  });

  // ---- Inbound ----

  const fetchInbound = useCallback(async (offset = 0, append = false) => {
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.getInboundHistory(PAGE_SIZE, offset, inFilter, search || undefined);
      if (res.success) {
        setInMessages((prev) => append ? [...prev, ...res.messages] : res.messages);
        setInTotal(res.total);
        setInHasMore(offset + res.messages.length < res.total);
      }
    } catch (e) {
      console.error('[Inbound] Fetch error:', e);
    }
  }, [inFilter, search]);

  useEffect(() => {
    if (direction === 'inbound') {
      setInInitialLoading(true);
      setSelected(new Set());
      fetchInbound(0, false).finally(() => setInInitialLoading(false));
    }
  }, [fetchInbound, direction]);

  const onInRefresh = useCallback(async () => {
    setInRefreshing(true);
    setSelected(new Set());
    await fetchInbound(0, false);
    setInRefreshing(false);
  }, [fetchInbound]);

  const onInEndReached = useCallback(async () => {
    if (inLoadingMore || !inHasMore) return;
    setInLoadingMore(true);
    await fetchInbound(inMessages.length, true);
    setInLoadingMore(false);
  }, [inLoadingMore, inHasMore, inMessages.length, fetchInbound]);

  // ---- Selection & Blacklist ----

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unblacklisted = inMessages.filter((m) => m.is_stop && !m.blacklisted);
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
      t().messages.blacklist.title,
      t().messages.blacklist.confirmMulti(selected.size),
      [
        { text: t().common.cancel, style: 'cancel' },
        {
          text: t().messages.blacklist.add, style: 'destructive',
          onPress: async () => {
            setBlacklisting(true);
            try {
              const res = await client.blacklistInbound(Array.from(selected));
              if (res.success) {
                setSelected(new Set());
                await fetchInbound(0, false);
                Alert.alert(t().common.done, t().messages.blacklist.successMulti(res.blacklisted));
              }
            } catch { Alert.alert(t().common.error, t().messages.blacklist.error); }
            finally { setBlacklisting(false); }
          },
        },
      ],
    );
  };

  const blacklistSingle = async (item: InboundSmsItem) => {
    const client = getApiClient();
    if (!client) return;
    Alert.alert(
      t().messages.blacklist.title,
      t().messages.blacklist.confirmSingle(item.from_number),
      [
        { text: t().common.cancel, style: 'cancel' },
        {
          text: t().messages.blacklist.add, style: 'destructive',
          onPress: async () => {
            try {
              const res = await client.blacklistInbound([item.id]);
              if (res.success) {
                setInMessages((prev) =>
                  prev.map((m) => m.id === item.id ? { ...m, blacklisted: true } : m)
                );
              }
            } catch { Alert.alert(t().common.error, t().messages.blacklist.error); }
          },
        },
      ],
    );
  };

  // ---- Formatters ----

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // ---- Render items ----

  const renderOutItem = ({ item }: { item: SmsHistoryItem }) => (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={styles.itemLeft}>
          <Ionicons
            name={item.status === 'sent' ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={item.status === 'sent' ? '#34D399' : '#F87171'}
          />
          <Text style={styles.phoneNumber}>{item.phone_number}</Text>
        </View>
        <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
      </View>
      <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
      {item.error_message && (
        <Text style={styles.errorMessage}>{item.error_message}</Text>
      )}
    </View>
  );

  const renderInItem = ({ item }: { item: InboundSmsItem }) => {
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
        {item.partner_name ? <Text style={styles.partner}>{item.partner_name}</Text> : null}
        {item.blacklisted ? (
          <Text style={styles.blacklisted}>
            <Ionicons name="checkmark-circle" size={11} color="#F87171" /> {t().messages.onBlacklist}
          </Text>
        ) : item.is_stop ? (
          <TouchableOpacity onPress={() => blacklistSingle(item)} style={styles.blacklistBtn}>
            <Ionicons name="ban-outline" size={13} color="#FBBF24" />
            <Text style={styles.blacklistBtnText}>{t().messages.addToBlacklist}</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  const [rescanning, setRescanning] = useState(false);

  const rescanInbox = async () => {
    setRescanning(true);
    try {
      await GatewayService.rescanInbox();
      await fetchInbound(0, false);
      Alert.alert(t().common.done, t().messages.rescanSuccess);
    } catch {
      Alert.alert(t().common.error, t().messages.rescanError);
    } finally {
      setRescanning(false);
    }
  };

  const hasUnblacklisted = inMessages.some((m) => m.is_stop && !m.blacklisted);

  // ---- Main render ----

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t().messages.title}</Text>
        <Text style={styles.count}>
          {direction === 'outbound' ? t().messages.recordCount(filteredOut.length) : t().messages.totalCount(inTotal)}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color="#6B7280" />
          <TextInput
            style={styles.searchText}
            placeholder={t().messages.searchPlaceholder}
            placeholderTextColor="#6B7280"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
        {direction === 'inbound' && (
          <TouchableOpacity onPress={rescanInbox} style={styles.rescanBtn} disabled={rescanning}>
            {rescanning
              ? <ActivityIndicator size="small" color="#3B82F6" />
              : <Ionicons name="refresh" size={20} color="#3B82F6" />
            }
          </TouchableOpacity>
        )}
      </View>

      {/* Direction toggle */}
      <View style={styles.directionRow}>
        <TouchableOpacity
          style={[styles.directionTab, direction === 'outbound' && styles.directionTabActive]}
          onPress={() => setDirection('outbound')}
        >
          <Ionicons name="arrow-up-circle-outline" size={16} color={direction === 'outbound' ? '#FFF' : '#9CA3AF'} />
          <Text style={[styles.directionText, direction === 'outbound' && styles.directionTextActive]}>
            {t().messages.outbound}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.directionTab, direction === 'inbound' && styles.directionTabActive]}
          onPress={() => setDirection('inbound')}
        >
          <Ionicons name="arrow-down-circle-outline" size={16} color={direction === 'inbound' ? '#FFF' : '#9CA3AF'} />
          <Text style={[styles.directionText, direction === 'inbound' && styles.directionTextActive]}>
            {t().messages.inboundTab}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sub-filters */}
      {direction === 'outbound' ? (
        <View style={styles.filterRow}>
          {(['all', 'sent', 'error'] as OutboundFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, outFilter === f && styles.filterTabActive]}
              onPress={() => setOutFilter(f)}
            >
              <Text style={[styles.filterText, outFilter === f && styles.filterTextActive]}>
                {f === 'all' ? t().common.filter.all : f === 'sent' ? t().common.filter.sent : t().common.filter.errors}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.filterRow}>
          {(['all', 'stop', 'stop_not_blacklisted'] as InboundFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, inFilter === f && styles.filterTabActive]}
              onPress={() => setInFilter(f)}
            >
              <Text style={[styles.filterText, inFilter === f && styles.filterTextActive]}>
                {f === 'all' ? t().common.filter.all : f === 'stop' ? 'STOP' : t().messages.filter.notBlacklisted}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Bulk actions (inbound only) */}
      {direction === 'inbound' && (selected.size > 0 || hasUnblacklisted) && (
        <View style={styles.bulkBar}>
          {hasUnblacklisted && (
            <TouchableOpacity onPress={selectAll} style={styles.bulkBtn}>
              <Ionicons name="checkbox-outline" size={16} color="#9CA3AF" />
              <Text style={styles.bulkBtnText}>
                {selected.size > 0 ? t().messages.selectedCount(selected.size) : t().messages.selectAll}
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
                  <Text style={styles.bulkBtnTextDanger}>Blacklist ({selected.size})</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Content */}
      {direction === 'outbound' ? (
        <FlatList
          data={filteredOut}
          keyExtractor={(item, index) => `out-${item.id}-${index}`}
          renderItem={renderOutItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>{t().messages.noHistory}</Text>
            </View>
          }
        />
      ) : inInitialLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.emptyText}>{t().common.loading}</Text>
        </View>
      ) : (
        <FlatList
          data={inMessages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderInItem}
          extraData={selected}
          refreshControl={
            <RefreshControl refreshing={inRefreshing} onRefresh={onInRefresh} tintColor="#3B82F6" />
          }
          onEndReached={onInEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={inLoadingMore ? <ActivityIndicator color="#3B82F6" style={{ padding: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {inFilter === 'stop_not_blacklisted' ? t().messages.noUnblockedStop : t().messages.noInbound}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 10,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#F9FAFB' },
  count: { color: '#6B7280', fontSize: 14 },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, gap: 8,
  },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1F2937', borderRadius: 8, paddingHorizontal: 12, height: 40,
  },
  searchText: { flex: 1, color: '#F9FAFB', fontSize: 14 },
  rescanBtn: {
    width: 40, height: 40, borderRadius: 8, backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
  },

  // Direction toggle (Odeslane / Prijate)
  directionRow: {
    flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 0,
    backgroundColor: '#1F2937', marginHorizontal: 16, borderRadius: 10, padding: 4,
  },
  directionTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8,
  },
  directionTabActive: { backgroundColor: '#374151' },
  directionText: { color: '#9CA3AF', fontSize: 14, fontWeight: '500' },
  directionTextActive: { color: '#FFF', fontWeight: '600' },

  // Sub-filters
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1F2937' },
  filterTabActive: { backgroundColor: '#2563EB' },
  filterText: { color: '#9CA3AF', fontSize: 13 },
  filterTextActive: { color: '#FFF', fontWeight: '600' },

  // Bulk bar
  bulkBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#374151', marginBottom: 4,
  },
  bulkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#1F2937',
  },
  bulkBtnDanger: { backgroundColor: '#7F1D1D' },
  bulkBtnText: { color: '#9CA3AF', fontSize: 13 },
  bulkBtnTextDanger: { color: '#FCA5A5', fontSize: 13, fontWeight: '600' },

  // Items
  item: {
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    backgroundColor: '#1F2937', borderRadius: 10, borderWidth: 1, borderColor: 'transparent',
  },
  itemSelected: { borderColor: '#3B82F6', backgroundColor: '#1E3A5F' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneNumber: { color: '#F9FAFB', fontSize: 15, fontWeight: '500' },
  stopBadge: { backgroundColor: '#991B1B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stopBadgeText: { color: '#FCA5A5', fontSize: 10, fontWeight: '700' },
  time: { color: '#6B7280', fontSize: 12 },
  message: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
  errorMessage: { color: '#F87171', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  partner: { color: '#60A5FA', fontSize: 12, marginTop: 4 },
  blacklisted: { color: '#F87171', fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  blacklistBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
    paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#78350F', borderRadius: 6, alignSelf: 'flex-start',
  },
  blacklistBtnText: { color: '#FBBF24', fontSize: 12, fontWeight: '500' },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: '#6B7280', fontSize: 14, marginTop: 8 },
});
