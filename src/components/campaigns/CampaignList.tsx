import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { t, onLocaleChange } from '../../i18n';
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CampaignSummary } from "../../../src/types";
import { getSettings } from "../../../src/storage/settings";
import { styles } from "./styles";
import { Loader, stateLabel, stateColor } from "./helpers";

interface CampaignListProps {
  campaigns: CampaignSummary[];
  listLoading: boolean;
  refreshing: boolean;
  loading: boolean;
  showDone: boolean;
  showArchived: boolean;
  onToggleDone: () => void;
  onToggleArchived: () => void;
  onRefresh: () => void;
  onViewCampaign: (campaign: CampaignSummary) => void;
  onStartWizard: () => void;
}

export function CampaignList({
  campaigns,
  listLoading,
  refreshing,
  loading,
  showDone,
  showArchived,
  onToggleDone,
  onToggleArchived,
  onRefresh,
  onViewCampaign,
  onStartWizard,
}: CampaignListProps) {
  const insets = useSafeAreaInsets();
  const simpleMode = getSettings().simpleMode;
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t().campaignList.title}</Text>
      </View>
      {/* Filter chips */}
      <View style={styles.filterChips}>
        <TouchableOpacity
          style={[styles.filterChip, showDone && styles.filterChipActive]}
          onPress={onToggleDone}
        >
          <Text style={[styles.filterChipText, showDone && styles.filterChipTextActive]}>
            {t().campaignList.filterDone}
          </Text>
        </TouchableOpacity>
        {!simpleMode && (
          <TouchableOpacity
            style={[styles.filterChip, showArchived && styles.filterChipActive]}
            onPress={onToggleArchived}
          >
            <Text style={[styles.filterChipText, showArchived && styles.filterChipTextActive]}>
              {t().campaignList.filterArchived}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {listLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3B82F6"
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => onViewCampaign(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.stateBadgeSmall,
                    { color: stateColor(item.state, item.paused) },
                  ]}
                >
                  {stateLabel(item.state, item.paused)}
                </Text>
              </View>
              <View style={styles.cardStats}>
                <Text style={styles.cardStat}>
                  {t().campaignList.sentCount(item.sent, item.total)}
                </Text>
                {item.error > 0 && (
                  <Text style={[styles.cardStat, { color: "#F87171" }]}>
                    {t().campaignList.errorCount(item.error)}
                  </Text>
                )}
                {(item.revenue ?? 0) > 0 && (
                  <Text style={[styles.cardStat, { color: "#34D399" }]}>
                    {item.revenue!.toLocaleString("cs-CZ", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    {t().common.currency}
                  </Text>
                )}
              </View>
              {item.date_created ? (
                <Text style={styles.cardDate}>
                  {new Date(item.date_created).toLocaleString("cs-CZ", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>{t().campaignList.empty}</Text>
              <Text style={styles.emptySubtext}>
                {t().campaignList.emptyHint}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={onStartWizard}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Ionicons name="add" size={28} color="#FFF" />
        )}
      </TouchableOpacity>
    </View>
  );
}
