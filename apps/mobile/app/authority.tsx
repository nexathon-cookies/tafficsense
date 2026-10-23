import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { LiveIncident } from "@trafficsense/shared";
import { AppHeader, BottomNav, Button, FeedbackBox } from "../src/components/ui";
import {
  fetchAuthorityHistory,
  fetchAuthorityIncidents,
  type AuthorityIncidentAction,
  updateAuthorityIncident,
} from "../src/lib/authority";
import { categoryLabel } from "../src/lib/format";
import { evidenceLabel } from "../src/lib/evidence";
import type { AuthorityHistoryItem } from "../src/lib/response-parsers";
import { useTabBackHandler } from "../src/lib/use-tab-back-handler";
import { useAuth } from "../src/providers/auth-provider";
import { colors, layout, minTouchTarget, radius, space, typography } from "../src/theme/tokens";

type DashboardData = { incidents: LiveIncident[]; history: AuthorityHistoryItem[] };
type Feedback = { variant: "success" | "error"; message: string };

function formatIncidentTime(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp) + " IST";
}

function actionLabel(action: AuthorityHistoryItem["action"]): string {
  if (action === "confirm_incident") return "Confirmed (L6)";
  if (action === "resolve_incident") return "Resolved";
  return "Rejected";
}

function reviewPrompt(action: AuthorityIncidentAction): { title: string; verb: string } {
  if (action === "confirm") return { title: "Confirm this incident?", verb: "Confirm as L6" };
  if (action === "resolve") return { title: "Resolve this incident?", verb: "Resolve incident" };
  return { title: "Reject this report?", verb: "Reject report" };
}

export default function AuthorityScreen() {
  useTabBackHandler();
  const { session, loading: authLoading, role, roleLoading, roleError, reloadRole } = useAuth();
  const [data, setData] = useState<DashboardData>({ incidents: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);

  const loadDashboard = useCallback(async (accessToken: string) => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const [incidents, history] = await Promise.all([
        fetchAuthorityIncidents(accessToken),
        fetchAuthorityHistory(accessToken),
      ]);
      setData({ incidents, history });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The authority dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace("/auth/login?next=/authority");
      return;
    }
    if (!authLoading && session?.user.is_anonymous) {
      router.replace("/auth/login?next=/authority");
      return;
    }
    if (role === "authority" && session?.access_token) {
      const timer = setTimeout(() => void loadDashboard(session.access_token), 0);
      return () => clearTimeout(timer);
    }
  }, [authLoading, loadDashboard, role, roleLoading, session]);

  async function refresh() {
    if (session?.access_token && role === "authority") await loadDashboard(session.access_token);
  }

  async function performAction(incident: LiveIncident, action: AuthorityIncidentAction) {
    const prompt = reviewPrompt(action);
    if (!session?.access_token || pendingIncidentId) return;
    setPendingIncidentId(incident.id);
    setFeedback(null);
    try {
      await updateAuthorityIncident(incident.id, action, session.access_token);
      setFeedback({
        variant: "success",
        message: action === "confirm"
          ? "Incident confirmed as authority evidence (L6)."
          : action === "resolve"
            ? "Incident resolved and removed from active review."
            : "Report rejected and removed from active review.",
      });
      await loadDashboard(session.access_token);
    } catch (reason) {
      setFeedback({
        variant: "error",
        message: reason instanceof Error ? reason.message : `${prompt.verb} failed. Try again.`,
      });
    } finally {
      setPendingIncidentId(null);
    }
  }

  function confirmAction(incident: LiveIncident, action: AuthorityIncidentAction) {
    const prompt = reviewPrompt(action);
    Alert.alert(
      prompt.title,
      `${categoryLabel(incident.category)} · ${evidenceLabel(incident.level)}. This action is recorded by the authority review service.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: prompt.verb, style: action === "confirm" ? "default" : "destructive", onPress: () => void performAction(incident, action) },
      ],
    );
  }

  if (authLoading || roleLoading || loading && role === "authority") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading authority dashboard…</Text>
      </View>
    );
  }

  if (!session || session.user.is_anonymous || role !== "authority") {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader title="Authority Access" subtitle="Restricted workspace" canGoBack onBack={() => router.replace("/workspace")} showLive={false} />
        <View style={styles.accessCard}>
          <Text style={styles.title}>Authority access required</Text>
          <Text style={styles.body}>This dashboard is available only to an authenticated account whose Supabase profile has the authority role. The server also checks this role for review data and actions.</Text>
          {roleError ? <FeedbackBox variant="error" message={roleError} actionText="Retry role check" onAction={() => void reloadRole()} /> : null}
          <Button title="Return to Workspace" variant="secondary" onPress={() => router.replace(session ? "/workspace" : "/auth/login")} />
        </View>
        <BottomNav activeTab="me" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="Authority Dashboard" subtitle="Active incident review" canGoBack onBack={() => router.replace("/workspace")} showLive={false} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>CIVIC AUTHORITY</Text>
          <Text style={styles.title}>Incident review</Text>
          <Text style={styles.body}>Review active community reports. Evidence level describes verification support; it does not prove a reported cause.</Text>
        </View>

        {feedback ? <FeedbackBox variant={feedback.variant} message={feedback.message} /> : null}
        {error ? <FeedbackBox variant="error" message={error} actionText="Retry" onAction={() => void refresh()} /> : null}

        <View style={styles.sectionHeading}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Active incidents</Text>
            <Text style={styles.sectionCaption}>{data.incidents.length} active incident{data.incidents.length === 1 ? "" : "s"}</Text>
          </View>
          <Button title="Refresh" variant="secondary" disabled={loading || pendingIncidentId !== null} onPress={() => void refresh()} style={styles.refreshButton} />
        </View>

        {!error && !loading && data.incidents.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.cardTitle}>No active incidents</Text><Text style={styles.body}>There are no open community incidents to review right now.</Text></View>
        ) : null}

        {data.incidents.map((incident) => {
          const pending = pendingIncidentId === incident.id;
          return (
            <View key={incident.id} style={styles.incidentCard}>
              <View style={styles.incidentTop}>
                <Text style={styles.cardTitle}>{categoryLabel(incident.category)}</Text>
                <Text style={styles.statusBadge}>{incident.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.metaLabel}>Verification · {incident.level} · {evidenceLabel(incident.level)}</Text>
              <Text style={styles.body}>{incident.level_reason}</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>LOCATION</Text>
                  <Text style={styles.detailValue}>{incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>FIRST REPORTED</Text>
                  <Text style={styles.detailValue}>{formatIncidentTime(incident.first_reported_at)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>LAST CONFIRMED</Text>
                  <Text style={styles.detailValue}>{formatIncidentTime(incident.last_confirmed_at)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>REPORTS</Text>
                  <Text style={styles.detailValue}>{incident.report_count}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>PROVENANCE</Text>
                  <Text style={styles.detailValue}>{incident.provenance}</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                {incident.level !== "L6" ? <Button title={pending ? "Saving…" : "Confirm (L6)"} disabled={pending || pendingIncidentId !== null} onPress={() => confirmAction(incident, "confirm")} style={styles.actionButton} /> : null}
                <Button title={pending ? "Saving…" : "Resolve"} variant="secondary" disabled={pending || pendingIncidentId !== null} onPress={() => confirmAction(incident, "resolve")} style={styles.actionButton} />
                <Button title={pending ? "Saving…" : "Reject"} variant="secondary" disabled={pending || pendingIncidentId !== null} onPress={() => confirmAction(incident, "reject")} style={styles.actionButton} />
              </View>
            </View>
          );
        })}

        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent authority actions</Text>
          {error ? <Text style={styles.body}>History is unavailable until the dashboard refresh succeeds.</Text> : null}
          {!error && !loading && data.history.length === 0 ? <Text style={styles.body}>No authority actions have been recorded yet.</Text> : null}
          {data.history.map((item) => (
            <View key={item.id} style={styles.historyItem}>
              <View style={styles.historyMark} />
              <View style={styles.historyText}>
                <Text style={styles.historyTitle}>{actionLabel(item.action)} · {categoryLabel(item.category)}</Text>
                <Text style={styles.detailValue}>{formatIncidentTime(item.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ height: layout.safeBottomPadding }} />
      </ScrollView>
      <BottomNav activeTab="me" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, backgroundColor: colors.background },
  loadingText: { ...typography.bodyMd },
  content: { paddingHorizontal: space.gutter, paddingTop: space.md, gap: space.md },
  heading: { gap: space.xs },
  eyebrow: { ...typography.codeSm, color: colors.primary, fontWeight: "700" },
  title: { ...typography.headlineMd },
  body: { ...typography.bodySm },
  accessCard: { margin: space.gutter, marginTop: space.lg, padding: space.md, gap: space.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  sectionTitleGroup: { flex: 1, gap: 2 },
  sectionTitle: { ...typography.titleMd },
  sectionCaption: { ...typography.labelSm, color: colors.textMuted },
  refreshButton: { minHeight: minTouchTarget, paddingHorizontal: 12 },
  emptyCard: { padding: space.md, gap: space.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card },
  incidentCard: { padding: space.md, gap: space.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, elevation: 1 },
  incidentTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.sm },
  cardTitle: { ...typography.titleMd, flex: 1, textTransform: "capitalize" },
  statusBadge: { ...typography.codeSm, color: colors.success, backgroundColor: colors.successSurface, borderRadius: radius.pill, overflow: "hidden", paddingVertical: 4, paddingHorizontal: 8 },
  metaLabel: { ...typography.labelSm, color: colors.evidence, fontWeight: "700" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  detailItem: { width: "48%", flexGrow: 1, gap: 2 },
  detailLabel: { ...typography.codeSm, fontSize: 10 },
  detailValue: { ...typography.bodySm, color: colors.text, fontWeight: "600" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingTop: space.xs },
  actionButton: { flexGrow: 1, flexBasis: "30%", minHeight: minTouchTarget, paddingHorizontal: 8 },
  historySection: { gap: space.sm, paddingTop: space.sm },
  historyItem: { flexDirection: "row", alignItems: "stretch", gap: space.sm, paddingVertical: space.xs },
  historyMark: { width: 3, borderRadius: radius.pill, backgroundColor: colors.primaryFixed },
  historyText: { flex: 1, gap: 2 },
  historyTitle: { ...typography.labelMd },
});
