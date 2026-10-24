import { router, Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AuthorityNotificationItem, LiveIncident } from "@trafficsense/shared";
import { AppHeader, BottomNav, Button, FeedbackBox, Icon } from "../src/components/ui";
import {
  fetchAuthorityHistory,
  fetchAuthorityIncidents,
  fetchAuthorityNotifications,
  type AuthorityIncidentAction,
  updateAuthorityIncident,
} from "../src/lib/authority";
import { configureNotificationsAsync, dispatchLocalAuthorityNotification } from "../src/lib/notifications";
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
  const isAuthority = role === "authority" || Boolean(session?.user?.email?.toLowerCase().includes("authority"));
  const [data, setData] = useState<DashboardData>({ incidents: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);

  // Real-time Authority Dispatch Notifications
  const [notifications, setNotifications] = useState<AuthorityNotificationItem[]>([]);
  const [latestAlert, setLatestAlert] = useState<AuthorityNotificationItem | null>(null);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const isFirstPoll = useRef(true);

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
    const isAuthority = role === "authority" || Boolean(session?.user?.email?.toLowerCase().includes("authority"));
    if (isAuthority && session?.access_token) {
      const timer = setTimeout(() => void loadDashboard(session.access_token), 0);
      return () => clearTimeout(timer);
    }
  }, [authLoading, loadDashboard, role, roleLoading, session]);

  // Request OS Notification Permissions for Authority
  useEffect(() => {
    if (isAuthority) {
      void configureNotificationsAsync();
    }
  }, [isAuthority]);

  // Heartbeat Poller for Real-time Authority Notifications
  useEffect(() => {
    const isAuthority = role === "authority" || Boolean(session?.user?.email?.toLowerCase().includes("authority"));
    if (!isAuthority || !session?.access_token) return;

    let mounted = true;
    const token = session.access_token;

    async function pollNotifications() {
      try {
        const incoming = await fetchAuthorityNotifications(token);
        if (!mounted) return;
        setNotifications(incoming);

        const newItems = incoming.filter((n) => !seenNotificationIds.current.has(n.id));
        for (const item of incoming) {
          seenNotificationIds.current.add(item.id);
        }

        if (!isFirstPoll.current && newItems.length > 0) {
          const newest = newItems[0];
          setLatestAlert(newest);
          // Dispatch OS system notification (sounds & shows in Android/iOS notification drawer)
          void dispatchLocalAuthorityNotification(newest);
          // Auto-reload active incidents to show the new report in real time
          void fetchAuthorityIncidents(token).then((incidents) => {
            if (mounted) {
              setData((prev) => ({ ...prev, incidents }));
            }
          });
        }
        isFirstPoll.current = false;
      } catch {
        // Silently retry next tick
      }
    }

    void pollNotifications();
    const interval = setInterval(() => void pollNotifications(), 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isAuthority, role, session?.access_token]);

  async function refresh() {
    if (session?.access_token && isAuthority) await loadDashboard(session.access_token);
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

  if (authLoading || roleLoading || (loading && isAuthority)) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading authority dashboard…</Text>
      </View>
    );
  }

  if (!session || session.user.is_anonymous || !isAuthority) {
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
        <BottomNav activeTab="authority" />
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

        {/* Quick Switcher to Commuter Workspace */}
        <View style={styles.topToolbar}>
          <View style={styles.authorityPill}>
            <Icon name="shield" size={14} color={colors.secondary} />
            <Text style={styles.authorityPillText}>L6 MUNICIPAL OPS</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to Commuter Workspace"
            onPress={() => router.push("/workspace")}
            style={({ pressed }) => [styles.switchWorkspaceBtn, pressed && styles.switchWorkspaceBtnPressed]}
          >
            <Icon name="account_circle" size={16} color={colors.primary} />
            <Text style={styles.switchWorkspaceBtnText}>Commuter Workspace</Text>
            <Icon name="chevron_right" size={14} color={colors.primary} />
          </Pressable>
        </View>

        {/* Real-time Push Alert Banner */}
        {latestAlert ? (
          <View style={styles.liveAlertBanner}>
            <View style={styles.liveAlertHeader}>
              <View style={styles.liveAlertIconWrapper}>
                <Icon name="warning" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.liveAlertTagRow}>
                  <Text style={styles.liveAlertTag}>NEW INCIDENT SPOTTED</Text>
                  {latestAlert.has_photo ? (
                    <View style={styles.photoVerifiedBadge}>
                      <Text style={styles.photoVerifiedText}>📸 PHOTO EVIDENCE</Text>
                    </View>
                  ) : null}
                  <Text style={styles.liveAlertLevel}>{latestAlert.level}</Text>
                </View>
                <Text style={styles.liveAlertTitle}>
                  {categoryLabel(latestAlert.category)} • {latestAlert.landmark}
                </Text>
                {latestAlert.photo_summary ? (
                  <Text style={styles.liveAlertSummary} numberOfLines={2}>
                    &ldquo;{latestAlert.photo_summary}&rdquo;
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Dismiss alert"
                onPress={() => setLatestAlert(null)}
                hitSlop={8}
                style={styles.liveAlertClose}
              >
                <Icon name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {feedback ? <FeedbackBox variant={feedback.variant} message={feedback.message} /> : null}
        {error ? <FeedbackBox variant="error" message={error} actionText="Retry" onAction={() => void refresh()} /> : null}

        <View style={styles.sectionHeading}>
          <View style={styles.sectionTitleGroup}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.sectionTitle}>Active incidents</Text>
              {notifications.filter((n) => !n.is_read).length > 0 ? (
                <View style={styles.unreadCountPill}>
                  <Text style={styles.unreadCountText}>
                    {notifications.filter((n) => !n.is_read).length} new
                  </Text>
                </View>
              ) : null}
            </View>
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
      <BottomNav activeTab="authority" badgeCount={notifications.filter((n) => !n.is_read).length} />
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
  topToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    gap: 8,
  },
  authorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  authorityPillText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.secondary,
    fontWeight: "700",
  },
  switchWorkspaceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchWorkspaceBtnPressed: {
    backgroundColor: colors.surfaceContainer,
  },
  switchWorkspaceBtnText: {
    ...typography.labelSm,
    fontSize: 11.5,
    color: colors.primary,
    fontWeight: "700",
  },
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
  liveAlertBanner: {
    backgroundColor: colors.warningSurface,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radius.card,
    padding: space.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  liveAlertHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  liveAlertIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveAlertTagRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  liveAlertTag: {
    ...typography.codeSm,
    fontSize: 9.5,
    fontWeight: "800",
    color: colors.warning,
  },
  photoVerifiedBadge: {
    backgroundColor: colors.successSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.success,
  },
  photoVerifiedText: {
    ...typography.codeSm,
    fontSize: 9,
    fontWeight: "800",
    color: colors.success,
  },
  liveAlertLevel: {
    ...typography.codeSm,
    fontSize: 9,
    fontWeight: "700",
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  liveAlertTitle: {
    ...typography.labelMd,
    fontWeight: "700",
    color: colors.text,
  },
  liveAlertSummary: {
    ...typography.bodySm,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  liveAlertClose: {
    padding: 4,
  },
  unreadCountPill: {
    backgroundColor: colors.error,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  unreadCountText: {
    ...typography.codeSm,
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },
});
