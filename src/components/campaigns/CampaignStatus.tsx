import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SimCardInfo, getSimDisplayString } from "../../../modules/sim-manager";
import { CampaignSummary } from "../../../src/types";
import { getSettings } from "../../../src/storage/settings";
import { styles } from "./styles";
import { Header, StatBox, stateLabel, stateColor } from "./helpers";

interface CampaignStatusProps {
  campaign: CampaignSummary;
  sims: SimCardInfo[];
  simAssigned: boolean;
  simAssigning: boolean;
  sendTriggered: boolean;
  statusRefreshing: boolean;
  onRefreshStatus: () => void;
  onAssignSimAndSend: (
    mode: "single" | "split",
    simNumber?: string,
    simNumbers?: string[],
  ) => void;
  onSendNow: () => void;
  onPause: () => void;
  onResume: () => void;
  onArchive: () => void;
  onBack: () => void;
}

export function CampaignStatus({
  campaign,
  sims,
  simAssigned,
  simAssigning,
  sendTriggered,
  statusRefreshing,
  onRefreshStatus,
  onAssignSimAndSend,
  onSendNow,
  onPause,
  onResume,
  onArchive,
  onBack,
}: CampaignStatusProps) {
  const insets = useSafeAreaInsets();
  const simpleMode = getSettings().simpleMode;
  const progress =
    campaign.total > 0 ? campaign.sent / campaign.total : 0;
  const hasPending = campaign.pending > 0;
  const isSending = campaign.state === "sending" && !campaign.paused;
  const isPaused = campaign.paused;
  const isDone = campaign.state === "done";
  const showSimPicker = hasPending && !simAssigned && sims.length >= 2 && !isPaused;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Header title="Stav kampaně" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={statusRefreshing}
            onRefresh={onRefreshStatus}
          />
        }
      >
        {/* Progress card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{campaign.name}</Text>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text
              style={[
                styles.stateBadge,
                { color: stateColor(campaign.state, campaign.paused) },
              ]}
            >
              {stateLabel(campaign.state, campaign.paused)}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
          <View style={styles.statsGrid}>
            <StatBox label="Celkem" value={campaign.total} color="#F9FAFB" />
            <StatBox label="Odesláno" value={campaign.sent} color="#34D399" />
            <StatBox label="Čeká" value={campaign.pending} color="#FBBF24" />
            <StatBox label="Chyba" value={campaign.error} color="#F87171" />
          </View>
        </View>

        {/* Campaign details */}
        {campaign.body_plaintext !== undefined && (
          <View style={styles.summaryCard}>
            {campaign.body_plaintext ? (
              <>
                <Text style={styles.summaryLabel}>Text SMS:</Text>
                <Text style={styles.detailBody} numberOfLines={4}>
                  {campaign.body_plaintext}
                </Text>
              </>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>STOP zpráva:</Text>
              <Text
                style={[
                  styles.detailValue,
                  {
                    color: campaign.sms_allow_unsubscribe
                      ? "#34D399"
                      : "#6B7280",
                  },
                ]}
              >
                {campaign.sms_allow_unsubscribe ? "Ano" : "Ne"}
              </Text>
            </View>
            {(campaign.exclude_contacted_days ?? 0) > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Vynechává kontaktované:</Text>
                <Text style={styles.detailValue}>
                  {campaign.exclude_contacted_days} dní
                </Text>
              </View>
            )}
            {campaign.sent_date ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Datum odeslání:</Text>
                <Text style={styles.detailValue}>
                  {new Date(campaign.sent_date).toLocaleString("cs-CZ", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Marketing stats */}
        {!simpleMode &&
         (campaign.clicked > 0 ||
          campaign.order_count > 0 ||
          campaign.optout > 0) && (
          <View style={styles.summaryCard}>
            <Text style={styles.marketingTitle}>Výsledky kampaně</Text>
            <View style={styles.divider} />
            <View style={styles.statsGrid}>
              <StatBox
                label="Kliknulo"
                value={campaign.clicked}
                color="#60A5FA"
              />
              <StatBox
                label="Objednávky"
                value={campaign.order_count}
                color="#A78BFA"
              />
              <StatBox
                label="Odhlášeno"
                value={campaign.optout}
                color="#F87171"
              />
            </View>
            {campaign.revenue > 0 && (
              <View style={styles.revenueRow}>
                <Text style={styles.revenueLabel}>Příjem z kampaně</Text>
                <Text style={styles.revenueValue}>
                  {campaign.revenue.toLocaleString("cs-CZ", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                  Kč
                </Text>
              </View>
            )}
            {campaign.sent > 0 && (
              <View style={styles.ratioRow}>
                <Text style={styles.ratioText}>
                  CTR:{" "}
                  {((campaign.clicked / campaign.sent) * 100).toFixed(1)}%
                </Text>
                {campaign.order_count > 0 && (
                  <Text style={styles.ratioText}>
                    Konverze:{" "}
                    {((campaign.order_count / campaign.sent) * 100).toFixed(1)}%
                  </Text>
                )}
                {campaign.optout > 0 && (
                  <Text style={[styles.ratioText, { color: "#F87171" }]}>
                    Odhlášení:{" "}
                    {((campaign.optout / campaign.sent) * 100).toFixed(1)}%
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* SIM picker */}
        {showSimPicker && (
          <View style={styles.simPickerCard}>
            <Text style={styles.simPickerTitle}>
              Vyberte SIM pro odeslání
            </Text>
            {sims.map((sim) => (
              <TouchableOpacity
                key={sim.subscriptionId}
                style={styles.simBtn}
                disabled={simAssigning}
                onPress={() =>
                  onAssignSimAndSend("single", sim.phoneNumber || undefined)
                }
              >
                {simAssigning ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="phone-portrait-outline"
                      size={18}
                      color="#FFF"
                    />
                    <Text style={styles.simBtnText}>
                      {getSimDisplayString(sim)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
            {sims.length >= 2 && sims.every((s) => s.phoneNumber) && (
              <TouchableOpacity
                style={[styles.simBtn, styles.simSplitBtn]}
                disabled={simAssigning}
                onPress={() =>
                  onAssignSimAndSend(
                    "split",
                    undefined,
                    sims.map((s) => s.phoneNumber!),
                  )
                }
              >
                {simAssigning ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="git-branch-outline"
                      size={18}
                      color="#FFF"
                    />
                    <Text style={styles.simBtnText}>
                      Rozdělit mezi obě SIM
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: 16 }}>
          {/* Send now — only when in_queue, not paused, not already triggered */}
          {hasPending && simAssigned && !sendTriggered && !isPaused &&
           campaign.state === "in_queue" && (
            <TouchableOpacity
              style={[styles.sendNowBtn, simAssigning && styles.btnDisabled]}
              onPress={onSendNow}
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

          {/* Pause — red, shown when actively sending */}
          {isSending && hasPending && (
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={onPause}
            >
              <Ionicons name="pause-circle-outline" size={20} color="#FFF" />
              <Text style={styles.pauseBtnText}>Pozastavit odesílání</Text>
            </TouchableOpacity>
          )}

          {/* Resume — yellow, shown when paused */}
          {isPaused && hasPending && (
            <TouchableOpacity
              style={styles.resumeBtn}
              onPress={onResume}
            >
              <Ionicons name="play-circle-outline" size={20} color="#1F2937" />
              <Text style={styles.resumeBtnText}>Pokračovat v odesílání</Text>
            </TouchableOpacity>
          )}

          {/* Archive — advanced mode only, when done */}
          {!simpleMode && isDone && campaign.active !== false && (
            <TouchableOpacity
              style={styles.archiveBtn}
              onPress={onArchive}
            >
              <Ionicons name="archive-outline" size={18} color="#9CA3AF" />
              <Text style={styles.archiveBtnText}>Archivovat kampaň</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryBtn} onPress={onBack}>
            <Text style={styles.secondaryBtnText}>Zpět na seznam</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
