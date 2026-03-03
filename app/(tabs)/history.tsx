import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSmsHistory, onHistoryChange } from '../../src/services/smsQueueService';
import { SmsHistoryItem } from '../../src/types';

type Filter = 'all' | 'sent' | 'error';

export default function HistoryScreen() {
  const [history, setHistory] = useState<SmsHistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    setHistory(getSmsHistory());
    const unsubscribe = onHistoryChange(setHistory);
    return unsubscribe;
  }, []);

  const filteredHistory = filter === 'all'
    ? history
    : history.filter((item) => item.status === filter);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('cs-CZ');
  };

  const renderItem = ({ item }: { item: SmsHistoryItem }) => (
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historie SMS</Text>
        <Text style={styles.count}>{filteredHistory.length} zaznam(u)</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'sent', 'error'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'Vse' : f === 'sent' ? 'Odeslano' : 'Chyby'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredHistory}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#6B7280" />
            <Text style={styles.emptyText}>Zadna historie</Text>
          </View>
        }
      />
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
  time: {
    color: '#6B7280',
    fontSize: 12,
  },
  message: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 4,
  },
  errorMessage: {
    color: '#F87171',
    fontSize: 12,
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
