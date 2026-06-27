import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { t } from '../../i18n';
import { styles } from "./styles";

export function stateLabel(state: string, paused?: boolean): string {
  if (paused) return t().campaignState.paused;
  switch (state) {
    case "done":
      return t().campaignState.done;
    case "sending":
      return t().campaignState.sending;
    case "in_queue":
      return t().campaignState.inQueue;
    default:
      return state;
  }
}

export function stateColor(state: string, paused?: boolean): string {
  if (paused) return "#F59E0B";
  switch (state) {
    case "done":
      return "#34D399";
    case "sending":
      return "#FBBF24";
    case "in_queue":
      return "#3B82F6";
    default:
      return "#6B7280";
  }
}

export function Header({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.wizardHeader}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#F9FAFB" />
      </TouchableOpacity>
      <Text style={styles.wizardTitle}>{title}</Text>
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color="#3B82F6" />
    </View>
  );
}

export function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statBoxValue, { color }]}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}
