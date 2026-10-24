import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../src/providers/auth-provider";
import { supabase } from "../src/lib/supabase";
import {
  endJourney,
  loadJourneyWorkspace,
  shareJourney,
  sharePreviewLines,
  startJourney,
  stopJourneyShare,
  type JourneyWorkspace,
  type OrganisationRow,
} from "../src/lib/journeys";
import {
  AppHeader,
  BottomNav,
  Button,
  Card,
  FeedbackBox,
  Icon,
  SimulatedBadge,
  StatusBadge,
} from "../src/components/ui";
import { colors, layout, radius, space, typography } from "../src/theme/tokens";

export default function JourneysScreen() {
  const { session, loading: authLoading } = useAuth();
  const [data, setData] = useState<JourneyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Sharing consent modal / form state
  const [sharingJourneyId, setSharingJourneyId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace({ pathname: "/auth/login", params: { next: "/journeys" } });
    }
  }, [authLoading, session]);

  const loadData = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      const result = await loadJourneyWorkspace(supabase);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Journeys could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      if (session) void loadData();
    }, [session, loadData]),
  );

  if (authLoading || (!session && loading)) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const activeJourney = data?.journeys.find((j) => j.status === "active") ?? null;
  const previousJourneys = data?.journeys.filter((j) => j.status === "ended") ?? [];
  const selectedOrg = data?.organisations.find((org) => org.id === selectedOrgId) ?? null;
  const hasMembership = (data?.organisations?.length ?? 0) > 0;

  async function handleStart() {
    try {
      setBusyAction("start");
      setError(null);
      await startJourney(supabase);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Journey could not be started.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnd(journeyId: string) {
    try {
      setBusyAction(`end_${journeyId}`);
      setError(null);
      await endJourney(supabase, journeyId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Journey could not be ended.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmShare() {
    if (!sharingJourneyId || !selectedOrgId || !consentChecked) return;
    try {
      setBusyAction(`share_${sharingJourneyId}_${selectedOrgId}`);
      setError(null);
      await shareJourney(supabase, sharingJourneyId, selectedOrgId);
      setSharingJourneyId(null);
      setSelectedOrgId(null);
      setConsentChecked(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sharing could not be confirmed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStopShare(journeyId: string, orgId: string) {
    try {
      setBusyAction(`stop_${journeyId}_${orgId}`);
      setError(null);
      await stopJourneyShare(supabase, journeyId, orgId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sharing could not be stopped.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Journeys"
        subtitle="Employer Sharing"
        canGoBack
        onBack={() => router.replace("/workspace")}
        showLive={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.eyebrow}>COMMUTER TRANSIT STATUS</Text>
            <SimulatedBadge label="SIMULATED STATUS" />
          </View>
          <Text style={styles.title}>Commuter journeys</Text>
          <Text style={styles.subtitle}>
            Manage active demonstration corridor journeys. Opt-in to share non-GPS corridor summary status with your employer organization.
          </Text>
        </View>

        {error ? (
          <FeedbackBox
            variant="error"
            message={error}
            actionText="Try again"
            onAction={() => void loadData()}
          />
        ) : null}

        {loading && !data ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading commuter journey workspace…</Text>
          </View>
        ) : null}

        {/* Active Journey Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Journey</Text>
          {activeJourney ? (
            <Card style={styles.activeCard} elevated>
              <View style={styles.activeCardHeader}>
                <View style={styles.activeTitleCol}>
                  <Text style={styles.activeCorridorName}>{activeJourney.corridor_name}</Text>
                  <Text style={styles.activeTimestamp}>
                    Started: {new Date(activeJourney.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <StatusBadge label="ACTIVE COMMUTE" variant="success" />
              </View>

              {/* Active Shares on this journey */}
              {activeJourney.shares.length > 0 ? (
                <View style={styles.sharesBlock}>
                  <Text style={styles.sharesHeading}>Employer Shares on this Journey:</Text>
                  {activeJourney.shares.map((share) => (
                    <View key={share.id} style={styles.shareItem}>
                      <View style={styles.shareItemInfo}>
                        <Text style={styles.shareOrgName}>{share.org_name}</Text>
                        <Text style={styles.shareTimestamp}>
                          Shared at {new Date(share.shared_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Status: {share.status}
                        </Text>
                      </View>
                      {share.status === "active" ? (
                        <Button
                          title="Stop sharing"
                          loading={busyAction === `stop_${activeJourney.id}_${share.org_id}`}
                          disabled={Boolean(busyAction)}
                          onPress={() => void handleStopShare(activeJourney.id, share.org_id)}
                          variant="outline"
                          style={styles.stopShareBtn}
                        />
                      ) : (
                        <StatusBadge label="STOPPED" variant="neutral" />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Actions on Active Journey: Sharing controls shown only to users with membership */}
              <View style={styles.activeActionsRow}>
                {hasMembership ? (
                  <Button
                    title="Share with organisation"
                    disabled={Boolean(busyAction) || Boolean(sharingJourneyId)}
                    onPress={() => {
                      setSharingJourneyId(activeJourney.id);
                      setSelectedOrgId(data?.organisations[0]?.id ?? null);
                      setConsentChecked(false);
                    }}
                    variant="secondary"
                    style={styles.actionFlex}
                  />
                ) : null}
                <Button
                  title="End journey"
                  loading={busyAction === `end_${activeJourney.id}`}
                  disabled={Boolean(busyAction)}
                  onPress={() => void handleEnd(activeJourney.id)}
                  variant={hasMembership ? "outline" : "primary"}
                  style={styles.actionFlex}
                />
              </View>
              {!hasMembership ? (
                <Text style={styles.membershipNotice}>
                  Sharing controls are hidden: your account is an independent commuter without an organisation membership. Employees with memberships can share journey status with employers.
                </Text>
              ) : null}
            </Card>
          ) : (
            <Card style={styles.noActiveCard}>
              <View style={styles.noActiveIconBox}>
                <Icon name="alt_route" size={24} color={colors.primary} />
              </View>
              <Text style={styles.noActiveTitle}>No active journey</Text>
              <Text style={styles.noActiveSubtitle}>
                Start a demonstration corridor commute to test status updates and employer consent sharing.
              </Text>
              <Button
                title="Start demonstration journey"
                loading={busyAction === "start"}
                disabled={Boolean(busyAction)}
                onPress={() => void handleStart()}
                variant="primary"
              />
            </Card>
          )}
        </View>

        {/* Consent Preview and Sharing Form Modal Card */}
        {sharingJourneyId && selectedOrg && hasMembership ? (
          <Card style={styles.consentCard} elevated>
            <View style={styles.consentHeader}>
              <Icon name="lock" size={20} color={colors.primary} />
              <Text style={styles.consentTitle}>Consent Sharing Agreement</Text>
            </View>

            {/* Select Organization */}
            <View style={styles.orgPickerGroup}>
              <Text style={styles.pickerLabel}>Recipient Organisation:</Text>
              <View style={styles.orgChips}>
                {data?.organisations.map((org: OrganisationRow) => {
                  const isSelected = org.id === selectedOrgId;
                  return (
                    <Pressable
                      key={org.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelectedOrgId(org.id)}
                      style={[styles.orgChip, isSelected && styles.orgChipSelected]}
                    >
                      <Text style={[styles.orgChipText, isSelected && styles.orgChipTextSelected]}>
                        {org.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Privacy boundary statements */}
            <View style={styles.previewBox}>
              <Text style={styles.previewHeading}>Exact data disclosure boundary:</Text>
              {sharePreviewLines(selectedOrg.name).map((line, idx) => (
                <Text key={idx} style={styles.previewLine}>
                  • {line}
                </Text>
              ))}
            </View>

            {/* Explicit Consent Checkbox */}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consentChecked }}
              accessibilityLabel="I confirm that I explicitly consent to share my current corridor name and estimated delay status with this organization"
              onPress={() => setConsentChecked(!consentChecked)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkboxBox, consentChecked && styles.checkboxBoxChecked]}>
                {consentChecked ? <Icon name="check" size={14} color="#ffffff" /> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                I explicitly consent to share my current corridor and delay status with {selectedOrg.name}. No GPS points or private travel history will be transmitted.
              </Text>
            </Pressable>

            {/* Form actions */}
            <View style={styles.consentActionsRow}>
              <Button
                title="Cancel"
                disabled={Boolean(busyAction)}
                onPress={() => {
                  setSharingJourneyId(null);
                  setSelectedOrgId(null);
                  setConsentChecked(false);
                }}
                variant="ghost"
              />
              <Button
                title="Confirm and share"
                disabled={!consentChecked || Boolean(busyAction)}
                loading={Boolean(busyAction?.startsWith("share_"))}
                onPress={() => void handleConfirmShare()}
                variant="primary"
                style={styles.actionFlex}
              />
            </View>
          </Card>
        ) : null}

        {/* Previous Journeys Section */}
        {previousJourneys.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Journeys</Text>
            {previousJourneys.map((j) => (
              <Card key={j.id} style={styles.historyCard}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyCorridor}>{j.corridor_name}</Text>
                  <StatusBadge label="ENDED" variant="neutral" />
                </View>
                <Text style={styles.historyTime}>
                  Ended: {j.ended_at ? new Date(j.ended_at).toLocaleDateString() : "Recently"}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}

        <View style={{ height: layout.safeBottomPadding }} />
      </ScrollView>

      <BottomNav activeTab="me" />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: space.gutter,
    paddingTop: 8,
    gap: space.md,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    gap: 4,
    paddingTop: 2,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    ...typography.codeSm,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    ...typography.headlineMd,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  activeCard: {
    padding: space.md,
    gap: 14,
    borderWidth: 1.5,
    borderColor: colors.primaryFixed,
  },
  activeCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  activeTitleCol: {
    flex: 1,
    gap: 2,
  },
  activeCorridorName: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  activeTimestamp: {
    ...typography.codeSm,
    color: colors.textSecondary,
  },
  sharesBlock: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 12,
    borderRadius: radius.control,
    gap: 8,
  },
  sharesHeading: {
    ...typography.labelSm,
    color: colors.text,
    fontWeight: "700",
  },
  shareItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainer,
    gap: 8,
  },
  shareItemInfo: {
    flex: 1,
    gap: 2,
  },
  shareOrgName: {
    ...typography.titleSm,
    fontWeight: "600",
    color: colors.text,
  },
  shareTimestamp: {
    ...typography.bodySm,
    fontSize: 11,
    color: colors.textSecondary,
  },
  stopShareBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
  },
  activeActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionFlex: {
    flex: 1,
  },
  membershipNotice: {
    ...typography.bodySm,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceContainerLow,
    padding: space.sm,
    borderRadius: radius.sm,
    marginTop: space.xs,
  },
  noActiveCard: {
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  noActiveIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  noActiveTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  noActiveSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  consentCard: {
    padding: space.md,
    gap: 14,
    borderWidth: 1.5,
    borderColor: colors.evidence,
  },
  consentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  consentTitle: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  orgPickerGroup: {
    gap: 6,
  },
  pickerLabel: {
    ...typography.labelSm,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  orgChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  orgChip: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orgChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  orgChipText: {
    ...typography.labelMd,
    color: colors.text,
  },
  orgChipTextSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },
  previewBox: {
    backgroundColor: colors.evidenceSurface,
    padding: 12,
    borderRadius: radius.control,
    gap: 6,
  },
  previewHeading: {
    ...typography.labelSm,
    color: colors.evidence,
    fontWeight: "700",
  },
  previewLine: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxLabel: {
    ...typography.bodySm,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
  consentActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  historyCard: {
    padding: 12,
    gap: 4,
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyCorridor: {
    ...typography.titleSm,
    fontWeight: "600",
    color: colors.text,
  },
  historyTime: {
    ...typography.codeSm,
    color: colors.textMuted,
  },
  centerLoading: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
});
