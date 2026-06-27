import { useState, useEffect } from "react";
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
import { t, onLocaleChange } from '../../i18n';
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
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Header title={t().wizard.step1Title} onBack={onBack} />
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
                  {t().wizard.segmentCount(item.segments.length)}
                </Text>
                {item.exclude_contacted_days > 0 && (
                  <Text style={styles.metaExclude}>
                    {t().wizard.excludesContacted(item.exclude_contacted_days)}
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
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title={t().wizard.step2Title} onBack={onBack} />
      {loading ? (
        <Loader />
      ) : (
        <>
          <Text style={styles.sectionLabel}>{t().wizard.customerSegment}</Text>
          {selectedTemplate &&
            selectedTemplate.exclude_contacted_days > 0 && (
              <Text style={styles.excludeInfo}>
                {t().wizard.excludesContactedInfo(selectedTemplate.exclude_contacted_days)}
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
              <Text style={styles.limitLabel}>{t().wizard.recipientCount}</Text>
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
              <Text style={styles.primaryBtnText}>{t().wizard.preview}</Text>
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
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title={t().wizard.step3Title} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{selectedTemplate?.name}</Text>
          <View style={styles.divider} />
          <Text style={styles.summaryLabel}>{t().wizard.segment}</Text>
          <Text style={styles.summaryValue}>{selectedFilter?.name}</Text>
          <Text style={styles.summaryLabel}>{t().wizard.recipientCount}</Text>
          <Text style={styles.summaryValue}>{previewCount}</Text>
          <Text style={styles.summaryLabel}>{t().wizard.smsTextEditable}</Text>
          <TextInput
            style={styles.previewInput}
            value={editedBody}
            onChangeText={onChangeBody}
            multiline
            textAlignVertical="top"
            placeholderTextColor="#6B7280"
          />
          <View style={styles.unsubRow}>
            <Text style={styles.unsubLabel}>{t().wizard.addStopMessage}</Text>
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
                  {t().wizard.createCampaign(previewCount)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
