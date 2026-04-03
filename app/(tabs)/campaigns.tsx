import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiClient } from '../../src/api/gatewayClient';
import SimManager, { SimCardInfo, getSimDisplayString } from '../../modules/sim-manager';
import { triggerImmediatePoll } from '../../src/services/smsQueueService';
import {
  CampaignTemplate,
  CampaignFilter,
  CampaignSummary,
} from '../../src/types';

type Screen = 'list' | 'step1' | 'step2' | 'step3' | 'status';

export default function CampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('list');

  // List state
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wizard state
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [filters, setFilters] = useState<CampaignFilter[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<CampaignFilter | null>(null);
  const [limit, setLimit] = useState('100');
  const [previewText, setPreviewText] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [previewCount, setPreviewCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Status state
  const [statusCampaign, setStatusCampaign] = useState<CampaignSummary | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SIM state
  const [sims, setSims] = useState<SimCardInfo[]>([]);
  const [simAssigned, setSimAssigned] = useState(false);
  const [simAssigning, setSimAssigning] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.getCampaigns();
      if (res.success) setCampaigns(res.campaigns);
    } catch (e) {
      console.error('[Campaigns] Fetch error:', e);
    }
  }, []);

  useEffect(() => {
    setListLoading(true);
    fetchCampaigns().finally(() => setListLoading(false));
  }, [fetchCampaigns]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCampaigns();
    setRefreshing(false);
  }, [fetchCampaigns]);

  // Cleanup status polling on unmount or screen change
  useEffect(() => {
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, []);

  const startWizard = async () => {
    const client = getApiClient();
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.getCampaignTemplates();
      if (res.success && res.templates.length > 0) {
        setTemplates(res.templates);
        setSelectedTemplate(null);
        setSelectedFilter(null);
        setLimit('100');
        setPreviewText('');
        setScreen('step1');
      } else {
        Alert.alert('Zadne sablony', 'Nejsou nastavene zadne SMS sablony pro tento telefon.');
      }
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo se nacist sablony.');
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = async (template: CampaignTemplate) => {
    setSelectedTemplate(template);
    setLimit(String(template.default_limit));
    const client = getApiClient();
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.getCampaignFilters(template.id);
      if (res.success) {
        setFilters(res.filters);
        setScreen('step2');
      }
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo se nacist filtry.');
    } finally {
      setLoading(false);
    }
  };

  const selectFilter = (filter: CampaignFilter) => {
    setSelectedFilter(filter);
  };

  const loadPreview = async () => {
    if (!selectedTemplate || !selectedFilter) return;
    const client = getApiClient();
    if (!client) return;
    setLoading(true);
    try {
      const res = await client.getCampaignPreview(
        selectedTemplate.id,
        selectedFilter.id,
        parseInt(limit, 10) || 100,
      );
      if (res.success) {
        setPreviewText(res.preview_text);
        setEditedBody(res.preview_text);
        setPreviewCount(res.recipient_count);
        setScreen('step3');
      }
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo se nacist nahled.');
    } finally {
      setLoading(false);
    }
  };

  const doCreateCampaign = async (sendNow: boolean) => {
    if (!selectedTemplate || !selectedFilter) return;
    const client = getApiClient();
    if (!client) return;

    setLoading(true);
    try {
      const bodyChanged = editedBody.trim() !== previewText.trim();
      const res = await client.createCampaign(
        selectedTemplate.id,
        selectedFilter.id,
        parseInt(limit, 10) || 100,
        bodyChanged ? editedBody.trim() : undefined,
        sendNow,
      );
      if (res.success) {
        const campaign: CampaignSummary = {
          id: res.campaign_id,
          name: selectedTemplate.name,
          state: res.state || (sendNow ? 'sending' : 'in_queue'),
          date_created: new Date().toISOString(),
          total: res.recipient_count,
          sent: 0,
          pending: res.recipient_count,
          error: 0,
          clicked: 0,
          total_clicks: 0,
          order_count: 0,
          revenue: 0,
          optout: 0,
        };
        setStatusCampaign(campaign);
        setSimAssigned(false);
        setScreen('status');
        startStatusPolling(res.campaign_id);

        if (sendNow) {
          // Detect SIMs and assign + trigger send
          try {
            const activeSims = await SimManager.getActiveSimCards();
            setSims(activeSims);
            const simsWithNumber = activeSims.filter((s) => s.phoneNumber);
            if (simsWithNumber.length === 1) {
              await client.assignSimToCampaign(
                res.campaign_id, 'single', simsWithNumber[0].phoneNumber!,
              );
              setSimAssigned(true);
              triggerImmediatePoll();
            } else if (simsWithNumber.length === 0) {
              setSimAssigned(true);
              triggerImmediatePoll();
            }
            // If 2+ SIMs: user picks on status screen
          } catch (simErr) {
            console.warn('[Campaigns] SIM detection failed:', simErr);
            setSimAssigned(true);
            triggerImmediatePoll();
          }
        } else {
          // Queue only — don't assign or poll
          setSims([]);
          setSimAssigned(true); // hide SIM picker, show status only
        }
      }
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo se vytvorit kampan.');
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = () => {
    if (!selectedTemplate || !selectedFilter) return;
    const bodyChanged = editedBody.trim() !== previewText.trim();
    Alert.alert(
      'Vytvorit kampan',
      `SMS "${selectedTemplate.name}" pro ${previewCount} prijemcu${bodyChanged ? '\n\n(Text SMS byl upraven)' : ''}`,
      [
        { text: 'Zrusit', style: 'cancel' },
        {
          text: 'Do fronty',
          style: 'default',
          onPress: () => doCreateCampaign(false),
        },
        {
          text: 'Odeslat ihned',
          onPress: () => doCreateCampaign(true),
        },
      ],
    );
  };

  const startStatusPolling = (campaignId: number) => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(async () => {
      const client = getApiClient();
      if (!client) return;
      try {
        const res = await client.getCampaignStatus(campaignId);
        if (res.success) {
          setStatusCampaign({
            id: res.id,
            name: res.name,
            state: res.state,
            date_created: res.created_at,
            total: res.total,
            sent: res.sent,
            pending: res.pending,
            error: res.error,
            clicked: res.clicked || 0,
            total_clicks: res.total_clicks || 0,
            order_count: res.order_count || 0,
            revenue: res.revenue || 0,
            optout: res.optout || 0,
          });
          if (res.state === 'done' || res.pending === 0) {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
          }
        }
      } catch (e) {
        // silent
      }
    }, 5000);
  };

  const viewCampaignStatus = async (campaign: CampaignSummary) => {
    setStatusCampaign(campaign);
    setScreen('status');
    if (campaign.pending > 0 && campaign.state !== 'done') {
      startStatusPolling(campaign.id);
      // Detect SIMs for pending campaigns
      try {
        const activeSims = await SimManager.getActiveSimCards();
        setSims(activeSims);
        // For existing campaigns, if single SIM, treat as already assigned
        // (SMS are phone-assigned, just need to trigger poll)
        setSimAssigned(activeSims.length <= 1);
      } catch {
        setSimAssigned(true); // Can't detect SIMs, show send button anyway
      }
    } else {
      setSimAssigned(true);
    }
  };

  const goBack = () => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    if (screen === 'step2') setScreen('step1');
    else if (screen === 'step3') setScreen('step2');
    else {
      setScreen('list');
      fetchCampaigns();
    }
  };

  const stateLabel = (state: string) => {
    switch (state) {
      case 'done': return 'Dokonceno';
      case 'sending': return 'Odesila se';
      case 'in_queue': return 'Ve fronte';
      default: return state;
    }
  };

  const stateColor = (state: string) => {
    switch (state) {
      case 'done': return '#34D399';
      case 'sending': return '#FBBF24';
      case 'in_queue': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  // ─── SCREENS ────────────────────────────────────

  if (screen === 'step1') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <Header title="1. Vyberte sablonu" onBack={goBack} />
        {loading ? <Loader /> : (
          <FlatList
            data={templates}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => selectTemplate(item)}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>Max: {item.max_limit}</Text>
                  <Text style={styles.metaText}>
                    {item.segments.length} segment(u)
                  </Text>
                  {item.exclude_contacted_days > 0 && (
                    <Text style={styles.metaExclude}>
                      Vynechava kontaktovane za {item.exclude_contacted_days}d
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

  if (screen === 'step2') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <Header title="2. Filtr a pocet" onBack={goBack} />
        {loading ? <Loader /> : (
          <>
            <Text style={styles.sectionLabel}>Segment zakazniku</Text>
            {selectedTemplate && selectedTemplate.exclude_contacted_days > 0 && (
              <Text style={styles.excludeInfo}>
                Vynechava kontakty, kterym byla odeslana SMS za poslednich {selectedTemplate.exclude_contacted_days} dni
              </Text>
            )}
            <FlatList
              data={filters}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 200 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.card,
                    selectedFilter?.id === item.id && styles.cardSelected,
                  ]}
                  onPress={() => selectFilter(item)}
                >
                  <View style={styles.filterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.cardBody}>{item.description}</Text>
                      ) : null}
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{item.recipient_count}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Pocet prijemcu:</Text>
                <TextInput
                  style={styles.limitInput}
                  value={limit}
                  onChangeText={setLimit}
                  keyboardType="numeric"
                  placeholderTextColor="#6B7280"
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, !selectedFilter && styles.btnDisabled]}
                onPress={loadPreview}
                disabled={!selectedFilter}
              >
                <Ionicons name="eye-outline" size={18} color="#FFF" />
                <Text style={styles.primaryBtnText}>Nahled</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  }

  if (screen === 'step3') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <Header title="3. Potvrzeni" onBack={goBack} />
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{selectedTemplate?.name}</Text>
          <View style={styles.divider} />
          <Text style={styles.summaryLabel}>Segment:</Text>
          <Text style={styles.summaryValue}>{selectedFilter?.name}</Text>
          <Text style={styles.summaryLabel}>Pocet prijemcu:</Text>
          <Text style={styles.summaryValue}>{previewCount}</Text>
          <Text style={styles.summaryLabel}>Text SMS (lze upravit):</Text>
          <TextInput
            style={styles.previewInput}
            value={editedBody}
            onChangeText={setEditedBody}
            multiline
            textAlignVertical="top"
            placeholderTextColor="#6B7280"
          />
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.btnDisabled]}
            onPress={createCampaign}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="megaphone-outline" size={20} color="#FFF" />
                <Text style={styles.sendBtnText}>Vytvorit kampan ({previewCount} SMS)</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const assignSimAndSend = async (
    mode: 'single' | 'split',
    simNumber?: string,
    simNumbers?: string[],
  ) => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;
    setSimAssigning(true);
    try {
      await client.assignSimToCampaign(
        statusCampaign.id, mode, simNumber, simNumbers,
      );
      setSimAssigned(true);
      triggerImmediatePoll();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo se priradit SIM.');
    } finally {
      setSimAssigning(false);
    }
  };

  const handleSendNow = async () => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;

    setSimAssigning(true);
    try {
      // Always call assign-sim — it assigns phone, SIM (if available),
      // and unpauses the mailing if it was queued
      const simsWithNumber = sims.filter((s) => s.phoneNumber);
      if (simsWithNumber.length === 1) {
        await client.assignSimToCampaign(
          statusCampaign.id, 'single', simsWithNumber[0].phoneNumber!,
        );
      } else {
        // No SIM detected — still call to assign phone + unpause
        await client.assignSimToCampaign(statusCampaign.id, 'single');
      }
      triggerImmediatePoll();
    } catch (e) {
      console.warn('[Campaigns] Send now assign failed:', e);
      triggerImmediatePoll();
    } finally {
      setSimAssigning(false);
    }
  };

  if (screen === 'status' && statusCampaign) {
    const progress = statusCampaign.total > 0
      ? statusCampaign.sent / statusCampaign.total
      : 0;
    const hasPending = statusCampaign.pending > 0;
    const showSimPicker = hasPending && !simAssigned && sims.length >= 2;

    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <Header title="Stav kampane" onBack={goBack} />
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{statusCampaign.name}</Text>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={[styles.stateBadge, { color: stateColor(statusCampaign.state) }]}>
              {stateLabel(statusCampaign.state)}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.statsGrid}>
            <StatBox label="Celkem" value={statusCampaign.total} color="#F9FAFB" />
            <StatBox label="Odeslano" value={statusCampaign.sent} color="#34D399" />
            <StatBox label="Ceka" value={statusCampaign.pending} color="#FBBF24" />
            <StatBox label="Chyba" value={statusCampaign.error} color="#F87171" />
          </View>
        </View>

        {/* Marketing stats — clicks, orders, revenue, optout */}
        {(statusCampaign.clicked > 0 || statusCampaign.order_count > 0 || statusCampaign.optout > 0) && (
          <View style={styles.summaryCard}>
            <Text style={styles.marketingTitle}>Vysledky kampane</Text>
            <View style={styles.divider} />
            <View style={styles.statsGrid}>
              <StatBox label="Kliknulo" value={statusCampaign.clicked} color="#60A5FA" />
              <StatBox label="Kliknuti" value={statusCampaign.total_clicks} color="#93C5FD" />
              <StatBox label="Objednavky" value={statusCampaign.order_count} color="#A78BFA" />
              <StatBox label="Odhlaseno" value={statusCampaign.optout} color="#F87171" />
            </View>
            {statusCampaign.revenue > 0 && (
              <View style={styles.revenueRow}>
                <Text style={styles.revenueLabel}>Prijem z kampane</Text>
                <Text style={styles.revenueValue}>
                  {statusCampaign.revenue.toLocaleString('cs-CZ', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })} Kc
                </Text>
              </View>
            )}
            {statusCampaign.sent > 0 && (
              <View style={styles.ratioRow}>
                <Text style={styles.ratioText}>
                  CTR: {((statusCampaign.clicked / statusCampaign.sent) * 100).toFixed(1)}%
                </Text>
                {statusCampaign.order_count > 0 && (
                  <Text style={styles.ratioText}>
                    Konverze: {((statusCampaign.order_count / statusCampaign.sent) * 100).toFixed(1)}%
                  </Text>
                )}
                {statusCampaign.optout > 0 && (
                  <Text style={[styles.ratioText, { color: '#F87171' }]}>
                    Odhlaseni: {((statusCampaign.optout / statusCampaign.sent) * 100).toFixed(1)}%
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* SIM selection for dual-SIM devices */}
        {showSimPicker && (
          <View style={styles.simPickerCard}>
            <Text style={styles.simPickerTitle}>Vyberte SIM pro odeslani</Text>
            {sims.map((sim) => (
              <TouchableOpacity
                key={sim.subscriptionId}
                style={styles.simBtn}
                disabled={simAssigning}
                onPress={() => assignSimAndSend('single', sim.phoneNumber || undefined)}
              >
                {simAssigning ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="phone-portrait-outline" size={18} color="#FFF" />
                    <Text style={styles.simBtnText}>{getSimDisplayString(sim)}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
            {sims.length >= 2 && sims.every((s) => s.phoneNumber) && (
              <TouchableOpacity
                style={[styles.simBtn, styles.simSplitBtn]}
                disabled={simAssigning}
                onPress={() =>
                  assignSimAndSend(
                    'split',
                    undefined,
                    sims.map((s) => s.phoneNumber!),
                  )
                }
              >
                {simAssigning ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="git-branch-outline" size={18} color="#FFF" />
                    <Text style={styles.simBtnText}>Rozdelit mezi obe SIM</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: 16 }}>
          {/* Send now button — visible when SIM is assigned and there are pending SMS */}
          {hasPending && simAssigned && (
            <TouchableOpacity
              style={[styles.sendNowBtn, simAssigning && styles.btnDisabled]}
              onPress={handleSendNow}
              disabled={simAssigning}
            >
              {simAssigning ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={20} color="#FFF" />
                  <Text style={styles.sendNowBtnText}>Odeslat ihned</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.secondaryBtn} onPress={goBack}>
            <Text style={styles.secondaryBtnText}>Zpet na seznam</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── DEFAULT: Campaign List ─────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Kampane</Text>
      </View>

      {listLoading ? <Loader /> : (
        <FlatList
          data={campaigns}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => viewCampaignStatus(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.stateBadgeSmall, { color: stateColor(item.state) }]}>
                  {stateLabel(item.state)}
                </Text>
              </View>
              <View style={styles.cardStats}>
                <Text style={styles.cardStat}>{item.sent}/{item.total} odeslano</Text>
                {item.error > 0 && (
                  <Text style={[styles.cardStat, { color: '#F87171' }]}>{item.error} chyb</Text>
                )}
              </View>
              {item.date_created ? (
                <Text style={styles.cardDate}>
                  {new Date(item.date_created).toLocaleString('cs-CZ', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>Zadne kampane</Text>
              <Text style={styles.emptySubtext}>
                Vytvorte prvni kampan tlacitkem nize
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={startWizard}
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

// ─── Sub-components ─────────────────────────────

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.wizardHeader}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#F9FAFB" />
      </TouchableOpacity>
      <Text style={styles.wizardTitle}>{title}</Text>
    </View>
  );
}

function Loader() {
  return (
    <View style={styles.emptyState}>
      <ActivityIndicator size="large" color="#3B82F6" />
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statBoxValue, { color }]}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#F9FAFB' },

  // Wizard header
  wizardHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12,
  },
  backBtn: { marginRight: 12, padding: 4 },
  wizardTitle: { fontSize: 20, fontWeight: 'bold', color: '#F9FAFB' },

  // Cards
  card: {
    marginHorizontal: 16, marginBottom: 10, padding: 14,
    backgroundColor: '#1F2937', borderRadius: 12,
  },
  cardSelected: { borderWidth: 2, borderColor: '#3B82F6' },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cardTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardBody: { color: '#9CA3AF', fontSize: 13, marginBottom: 6 },
  cardMeta: { flexDirection: 'row', gap: 16 },
  metaText: { color: '#6B7280', fontSize: 12 },
  metaExclude: { color: '#FBBF24', fontSize: 11 },
  excludeInfo: {
    color: '#FBBF24', fontSize: 12, paddingHorizontal: 16, marginBottom: 8,
  },
  cardStats: { flexDirection: 'row', gap: 16, marginTop: 4 },
  cardStat: { color: '#9CA3AF', fontSize: 13 },
  cardDate: { color: '#6B7280', fontSize: 11, marginTop: 4 },

  // Filter
  filterRow: { flexDirection: 'row', alignItems: 'center' },
  countBadge: {
    backgroundColor: '#374151', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  countText: { color: '#F9FAFB', fontSize: 16, fontWeight: 'bold' },
  sectionLabel: {
    color: '#9CA3AF', fontSize: 13, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1F2937', borderTopWidth: 1, borderTopColor: '#374151',
    paddingHorizontal: 16, paddingTop: 12,
  },
  limitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  limitLabel: { color: '#D1D5DB', fontSize: 15 },
  limitInput: {
    backgroundColor: '#374151', color: '#F9FAFB',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    width: 100, textAlign: 'center', fontSize: 16,
  },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2563EB', paddingVertical: 14, borderRadius: 12, gap: 8,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#059669', paddingVertical: 16, borderRadius: 12, gap: 8,
  },
  sendBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  sendNowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#059669', paddingVertical: 14, borderRadius: 12, gap: 8,
    marginBottom: 4,
  },
  sendNowBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    alignItems: 'center', paddingVertical: 12, marginTop: 8,
  },
  secondaryBtnText: { color: '#3B82F6', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  // Summary
  summaryCard: {
    marginHorizontal: 16, marginBottom: 16, padding: 16,
    backgroundColor: '#1F2937', borderRadius: 12,
  },
  summaryTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: 'bold' },
  divider: {
    height: 1, backgroundColor: '#374151', marginVertical: 12,
  },
  summaryLabel: { color: '#9CA3AF', fontSize: 12, marginTop: 8 },
  summaryValue: { color: '#F9FAFB', fontSize: 16, fontWeight: '500' },
  previewBox: {
    backgroundColor: '#374151', padding: 12, borderRadius: 8, marginTop: 6,
  },
  previewText: { color: '#D1D5DB', fontSize: 14, lineHeight: 20 },
  previewInput: {
    backgroundColor: '#374151', color: '#D1D5DB', fontSize: 14, lineHeight: 20,
    padding: 12, borderRadius: 8, marginTop: 6, minHeight: 100,
    borderWidth: 1, borderColor: '#4B5563',
  },

  // Status
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stateBadge: { fontSize: 16, fontWeight: '700' },
  stateBadgeSmall: { fontSize: 13, fontWeight: '600' },
  progressBar: {
    height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: { height: '100%', backgroundColor: '#34D399', borderRadius: 4 },
  statsGrid: {
    flexDirection: 'row', justifyContent: 'space-around',
  },
  statBox: { alignItems: 'center' },
  statBoxValue: { fontSize: 22, fontWeight: 'bold' },
  statBoxLabel: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  // SIM picker
  simPickerCard: {
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: '#1F2937', borderRadius: 12,
    borderWidth: 1, borderColor: '#374151',
  },
  simPickerTitle: {
    color: '#F9FAFB', fontSize: 15, fontWeight: '600', marginBottom: 10,
  },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10,
    gap: 8, marginBottom: 8,
  },
  simSplitBtn: {
    backgroundColor: '#7C3AED',
  },
  simBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },

  // Marketing stats
  marketingTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '600' },
  revenueRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#374151',
  },
  revenueLabel: { color: '#9CA3AF', fontSize: 14 },
  revenueValue: { color: '#34D399', fontSize: 20, fontWeight: 'bold' },
  ratioRow: {
    flexDirection: 'row', gap: 16, marginTop: 10,
  },
  ratioText: { color: '#9CA3AF', fontSize: 12 },

  // Empty state
  emptyState: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 60,
  },
  emptyText: { color: '#6B7280', fontSize: 16, marginTop: 12 },
  emptySubtext: { color: '#4B5563', fontSize: 13, marginTop: 4 },

  // FAB
  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
});
