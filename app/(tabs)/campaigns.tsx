import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { getApiClient } from "../../src/api/gatewayClient";
import SimManager, { SimCardInfo } from "../../modules/sim-manager";
import { triggerImmediatePoll } from "../../src/services/smsQueueService";
import {
  CampaignTemplate,
  CampaignFilter,
  CampaignSummary,
} from "../../src/types";
import { CampaignList } from "../../src/components/campaigns/CampaignList";
import {
  WizardStep1,
  WizardStep2,
  WizardStep3,
} from "../../src/components/campaigns/CampaignWizard";
import { CampaignStatus } from "../../src/components/campaigns/CampaignStatus";

type Screen = "list" | "step1" | "step2" | "step3" | "status";

export default function CampaignsScreen() {
  const [screen, setScreen] = useState<Screen>("list");

  // List state
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wizard state
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [filters, setFilters] = useState<CampaignFilter[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<CampaignTemplate | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<CampaignFilter | null>(
    null,
  );
  const [limit, setLimit] = useState("100");
  const [previewText, setPreviewText] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [previewCount, setPreviewCount] = useState(0);
  const [allowUnsubscribe, setAllowUnsubscribe] = useState(true);
  const [loading, setLoading] = useState(false);

  // Status state
  const [statusCampaign, setStatusCampaign] = useState<CampaignSummary | null>(
    null,
  );
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SIM state
  const [sims, setSims] = useState<SimCardInfo[]>([]);
  const [simAssigned, setSimAssigned] = useState(false);
  const [simAssigning, setSimAssigning] = useState(false);
  const [sendTriggered, setSendTriggered] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  // ─── Data fetching ──────────────────────────────

  // List filter state
  const [showDone, setShowDone] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const parseCampaignStatus = (res: any): CampaignSummary => ({
    id: res.id,
    name: res.name,
    state: res.state,
    paused: res.paused ?? false,
    active: res.active ?? true,
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
    sent_date: res.sent_date || "",
    body_plaintext: res.body_plaintext || "",
    sms_allow_unsubscribe: res.sms_allow_unsubscribe,
    exclude_contacted_days: res.exclude_contacted_days || 0,
  });

  const refreshStatus = useCallback(async () => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;
    setStatusRefreshing(true);
    try {
      const res = await client.getCampaignStatus(statusCampaign.id);
      if (res.success) setStatusCampaign(parseCampaignStatus(res));
    } catch {
      // silent
    } finally {
      setStatusRefreshing(false);
    }
  }, [statusCampaign]);

  const fetchCampaigns = useCallback(async () => {
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.getCampaigns({
        include_done: showDone,
        include_archived: showArchived,
      });
      if (res.success) setCampaigns(res.campaigns);
    } catch (e) {
      console.error("[Campaigns] Fetch error:", e);
    }
  }, [showDone, showArchived]);

  useEffect(() => {
    setListLoading(true);
    fetchCampaigns().finally(() => setListLoading(false));
  }, [fetchCampaigns]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCampaigns();
    setRefreshing(false);
  }, [fetchCampaigns]);

  useEffect(() => {
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, []);

  // ─── Wizard logic ───────────────────────────────

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
        setLimit("100");
        setPreviewText("");
        setAllowUnsubscribe(true);
        setScreen("step1");
      } else {
        Alert.alert(
          "Žádné šablony",
          "Nejsou nastavené žádné SMS šablony pro tento telefon.",
        );
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se načíst šablony.");
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
        setScreen("step2");
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se načíst filtry.");
    } finally {
      setLoading(false);
    }
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
        setScreen("step3");
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se načíst náhled.");
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
        allowUnsubscribe,
      );
      if (res.success) {
        const campaign: CampaignSummary = {
          id: res.campaign_id,
          name: selectedTemplate.name,
          state: res.state || (sendNow ? "sending" : "in_queue"),
          paused: sendNow ? false : true,
          active: true,
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
          body_plaintext: bodyChanged
            ? editedBody.trim()
            : selectedTemplate.body,
          sms_allow_unsubscribe: allowUnsubscribe,
          exclude_contacted_days: selectedTemplate.exclude_contacted_days,
        };
        setStatusCampaign(campaign);
        setSimAssigned(false);
        setSendTriggered(false);
        setScreen("status");
        startStatusPolling(res.campaign_id);

        if (sendNow) {
          try {
            const activeSims = await SimManager.getActiveSimCards();
            setSims(activeSims);
            const simsWithNumber = activeSims.filter((s) => s.phoneNumber);
            if (simsWithNumber.length === 1) {
              await client.assignSimToCampaign(
                res.campaign_id,
                "single",
                simsWithNumber[0].phoneNumber!,
              );
              setSimAssigned(true);
              setSendTriggered(true);
              triggerImmediatePoll();
            } else if (simsWithNumber.length === 0) {
              setSimAssigned(true);
              setSendTriggered(true);
              triggerImmediatePoll();
            }
          } catch (simErr) {
            console.warn("[Campaigns] SIM detection failed:", simErr);
            setSimAssigned(true);
            setSendTriggered(true);
            triggerImmediatePoll();
          }
        } else {
          setSims([]);
          setSimAssigned(true);
        }
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se vytvořit kampaň.");
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = () => {
    if (!selectedTemplate || !selectedFilter) return;
    const bodyChanged = editedBody.trim() !== previewText.trim();
    Alert.alert(
      "Vytvořit kampaň",
      `SMS "${selectedTemplate.name}" pro ${previewCount} příjemců${bodyChanged ? "\n\n(Text SMS byl upraven)" : ""}`,
      [
        { text: "Zrušit", style: "cancel" },
        {
          text: "Do fronty",
          style: "default",
          onPress: () => doCreateCampaign(false),
        },
        {
          text: "Odeslat ihned",
          onPress: () => doCreateCampaign(true),
        },
      ],
    );
  };

  // ─── Status & SIM logic ─────────────────────────

  const startStatusPolling = (campaignId: number) => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(async () => {
      const client = getApiClient();
      if (!client) return;
      try {
        const res = await client.getCampaignStatus(campaignId);
        if (res.success) {
          setStatusCampaign(parseCampaignStatus(res));
          if (res.state === "done" || res.pending === 0 || res.paused) {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
          }
        }
      } catch {
        // silent
      }
    }, 5000);
  };

  const viewCampaignStatus = async (campaign: CampaignSummary) => {
    setStatusCampaign(campaign);
    setSendTriggered(false);
    setScreen("status");

    const client = getApiClient();
    if (client) {
      try {
        const res = await client.getCampaignStatus(campaign.id);
        if (res.success) setStatusCampaign(parseCampaignStatus(res));
      } catch {
        // silent — polling will retry
      }
    }

    if (campaign.pending > 0 && campaign.state !== "done") {
      startStatusPolling(campaign.id);
      try {
        const activeSims = await SimManager.getActiveSimCards();
        setSims(activeSims);
        setSimAssigned(activeSims.length <= 1);
      } catch {
        setSimAssigned(true);
      }
    } else {
      setSimAssigned(true);
    }
  };

  const assignSimAndSend = async (
    mode: "single" | "split",
    simNumber?: string,
    simNumbers?: string[],
  ) => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;
    setSimAssigning(true);
    try {
      await client.assignSimToCampaign(
        statusCampaign.id,
        mode,
        simNumber,
        simNumbers,
      );
      setSimAssigned(true);
      setSendTriggered(true);
      triggerImmediatePoll();
    } catch {
      Alert.alert("Chyba", "Nepodařilo se přiřadit SIM.");
    } finally {
      setSimAssigning(false);
    }
  };

  const handlePause = async () => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.pauseCampaign(statusCampaign.id);
      if (res.success) {
        setStatusCampaign((prev) =>
          prev ? { ...prev, paused: true } : prev,
        );
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se pozastavit kampaň.");
    }
  };

  const handleResume = async () => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;
    try {
      const res = await client.resumeCampaign(statusCampaign.id);
      if (res.success) {
        setStatusCampaign((prev) =>
          prev ? { ...prev, state: "sending", paused: false } : prev,
        );
        triggerImmediatePoll();
        startStatusPolling(statusCampaign.id);
      }
    } catch {
      Alert.alert("Chyba", "Nepodařilo se obnovit kampaň.");
    }
  };

  const handleArchive = async () => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;
    Alert.alert(
      "Archivovat kampaň",
      "Kampaň bude skryta ze seznamu. Pokračovat?",
      [
        { text: "Zrušit", style: "cancel" },
        {
          text: "Archivovat",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await client.archiveCampaign(statusCampaign.id);
              if (res.success) {
                setStatusCampaign((prev) =>
                  prev ? { ...prev, active: false } : prev,
                );
                goBack();
              }
            } catch {
              Alert.alert("Chyba", "Nepodařilo se archivovat kampaň.");
            }
          },
        },
      ],
    );
  };

  const handleSendNow = async () => {
    if (!statusCampaign) return;
    const client = getApiClient();
    if (!client) return;

    setSimAssigning(true);
    try {
      const simsWithNumber = sims.filter((s) => s.phoneNumber);
      if (simsWithNumber.length === 1) {
        await client.assignSimToCampaign(
          statusCampaign.id,
          "single",
          simsWithNumber[0].phoneNumber!,
        );
      } else {
        await client.assignSimToCampaign(statusCampaign.id, "single");
      }
      setSendTriggered(true);
      triggerImmediatePoll();
    } catch (e) {
      console.warn("[Campaigns] Send now assign failed:", e);
      triggerImmediatePoll();
    } finally {
      setSimAssigning(false);
    }
  };

  // ─── Navigation ─────────────────────────────────

  const goBack = () => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    if (screen === "step2") setScreen("step1");
    else if (screen === "step3") setScreen("step2");
    else {
      setScreen("list");
      fetchCampaigns();
    }
  };

  // ─── Render ─────────────────────────────────────

  if (screen === "step1") {
    return (
      <WizardStep1
        templates={templates}
        loading={loading}
        onBack={goBack}
        onSelectTemplate={selectTemplate}
      />
    );
  }

  if (screen === "step2") {
    return (
      <WizardStep2
        filters={filters}
        selectedTemplate={selectedTemplate}
        selectedFilter={selectedFilter}
        limit={limit}
        loading={loading}
        onBack={goBack}
        onSelectFilter={setSelectedFilter}
        onChangeLimit={setLimit}
        onLoadPreview={loadPreview}
      />
    );
  }

  if (screen === "step3") {
    return (
      <WizardStep3
        selectedTemplate={selectedTemplate}
        selectedFilter={selectedFilter}
        previewCount={previewCount}
        editedBody={editedBody}
        allowUnsubscribe={allowUnsubscribe}
        loading={loading}
        onBack={goBack}
        onChangeBody={setEditedBody}
        onChangeUnsubscribe={setAllowUnsubscribe}
        onCreateCampaign={createCampaign}
      />
    );
  }

  if (screen === "status" && statusCampaign) {
    return (
      <CampaignStatus
        campaign={statusCampaign}
        sims={sims}
        simAssigned={simAssigned}
        simAssigning={simAssigning}
        sendTriggered={sendTriggered}
        statusRefreshing={statusRefreshing}
        onRefreshStatus={refreshStatus}
        onAssignSimAndSend={assignSimAndSend}
        onSendNow={handleSendNow}
        onPause={handlePause}
        onResume={handleResume}
        onArchive={handleArchive}
        onBack={goBack}
      />
    );
  }

  return (
    <CampaignList
      campaigns={campaigns}
      listLoading={listLoading}
      refreshing={refreshing}
      loading={loading}
      showDone={showDone}
      showArchived={showArchived}
      onToggleDone={() => setShowDone((v) => !v)}
      onToggleArchived={() => setShowArchived((v) => !v)}
      onRefresh={onRefresh}
      onViewCampaign={viewCampaignStatus}
      onStartWizard={startWizard}
    />
  );
}
