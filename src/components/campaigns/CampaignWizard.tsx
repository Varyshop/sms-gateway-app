import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CampaignTemplate, CampaignFilter } from "../../../src/types";
import { styles } from "./styles";
import { Header, Loader } from "./helpers";

// ─── Step 1: Template Selection ───────────────────

interface Step1Props {
  templates: CampaignTemplate[];
  loading: boolean;
  onBack: () => void;
  onSelectTemplate: (template: CampaignTemplate) => void;
}

export function WizardStep1({
  templates,
  loading,
  onBack,
  onSelectTemplate,
}: Step1Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Header title="1. Vyberte šablonu" onBack={onBack} />
      {loading ? (
        <Loader />
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => onSelectTemplate(item)}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardBody} numberOfLines={3}>
                {item.body}
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>Max: {item.max_limit}</Text>
                <Text style={styles.metaText}>
                  {item.segments.length} segment(u)
                </Text>
                {item.exclude_contacted_days > 0 && (
                  <Text style={styles.metaExclude}>
                    Vynechává kontaktované za {item.exclude_contacted_days}d
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ─── Step 2: Filter & Count ───────────────────────

interface Step2Props {
  filters: CampaignFilter[];
  selectedTemplate: CampaignTemplate | null;
  selectedFilter: CampaignFilter | null;
  limit: string;
  loading: boolean;
  onBack: () => void;
  onSelectFilter: (filter: CampaignFilter) => void;
  onChangeLimit: (value: string) => void;
  onLoadPreview: () => void;
}

export function WizardStep2({
  filters,
  selectedTemplate,
  selectedFilter,
  limit,
  loading,
  onBack,
  onSelectFilter,
  onChangeLimit,
  onLoadPreview,
}: Step2Props) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="2. Filtr a počet" onBack={onBack} />
      {loading ? (
        <Loader />
      ) : (
        <>
          <Text style={styles.sectionLabel}>Segment zákazníků</Text>
          {selectedTemplate &&
            selectedTemplate.exclude_contacted_days > 0 && (
              <Text style={styles.excludeInfo}>
                Vynechává kontakty, kterým byla odeslána SMS za posledních{" "}
                {selectedTemplate.exclude_contacted_days} dní
              </Text>
            )}
          <FlatList
            data={filters}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingBottom: 200 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.card,
                  selectedFilter?.id === item.id && styles.cardSelected,
                ]}
                onPress={() => onSelectFilter(item)}
              >
                <View style={styles.filterRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.cardBody}>{item.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>
                      {item.recipient_count}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
          <View
            style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}
          >
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Počet příjemců:</Text>
              <TextInput
                style={styles.limitInput}
                value={limit}
                onChangeText={onChangeLimit}
                keyboardType="numeric"
                placeholderTextColor="#6B7280"
              />
            </View>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                !selectedFilter && styles.btnDisabled,
              ]}
              onPress={onLoadPreview}
              disabled={!selectedFilter}
            >
              <Ionicons name="eye-outline" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Náhled</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Step 3: Confirmation ─────────────────────────

interface Step3Props {
  selectedTemplate: CampaignTemplate | null;
  selectedFilter: CampaignFilter | null;
  previewCount: number;
  editedBody: string;
  allowUnsubscribe: boolean;
  loading: boolean;
  onBack: () => void;
  onChangeBody: (text: string) => void;
  onChangeUnsubscribe: (value: boolean) => void;
  onCreateCampaign: () => void;
}

export function WizardStep3({
  selectedTemplate,
  selectedFilter,
  previewCount,
  editedBody,
  allowUnsubscribe,
  loading,
  onBack,
  onChangeBody,
  onChangeUnsubscribe,
  onCreateCampaign,
}: Step3Props) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="3. Potvrzení" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{selectedTemplate?.name}</Text>
          <View style={styles.divider} />
          <Text style={styles.summaryLabel}>Segment:</Text>
          <Text style={styles.summaryValue}>{selectedFilter?.name}</Text>
          <Text style={styles.summaryLabel}>Počet příjemců:</Text>
          <Text style={styles.summaryValue}>{previewCount}</Text>
          <Text style={styles.summaryLabel}>Text SMS (lze upravit):</Text>
          <TextInput
            style={styles.previewInput}
            value={editedBody}
            onChangeText={onChangeBody}
            multiline
            textAlignVertical="top"
            placeholderTextColor="#6B7280"
          />
          <View style={styles.unsubRow}>
            <Text style={styles.unsubLabel}>Přidat STOP zprávu</Text>
            <Switch
              value={allowUnsubscribe}
              onValueChange={onChangeUnsubscribe}
              trackColor={{ false: "#374151", true: "#2563EB" }}
              thumbColor={allowUnsubscribe ? "#93C5FD" : "#6B7280"}
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.btnDisabled]}
            onPress={onCreateCampaign}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="megaphone-outline" size={20} color="#FFF" />
                <Text style={styles.sendBtnText}>
                  Vytvořit kampaň ({previewCount} SMS)
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
