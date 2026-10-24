import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/providers/auth-provider";
import { supabase } from "../src/lib/supabase";
import {
  AppHeader,
  BottomNav,
  Button,
  Card,
  FeedbackBox,
  Icon,
} from "../src/components/ui";
import { colors, layout, radius, space, typography } from "../src/theme/tokens";
import { useTabBackHandler } from "../src/lib/use-tab-back-handler";

export default function WorkspaceScreen() {
  useTabBackHandler();
  const { session, loading, signOut, role } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  const isAuthority = role === "authority" || Boolean(session?.user?.email?.toLowerCase().includes("authority"));

  useEffect(() => {
    if (!loading && !session) router.replace("/auth/login");
    if (session && supabase) {
      const sb = supabase;
      void (async () => {
        try {
          const { data: rpcData, error: rpcError } = await sb.rpc("get_commuter_organisations");
          if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0 && typeof rpcData[0]?.name === "string") {
            setOrgName(rpcData[0].name);
            return;
          }
          const { data } = await sb.from("organisations").select("id, name");
          if (data && data.length > 0 && typeof data[0]?.name === "string") {
            setOrgName(data[0].name);
          } else {
            setOrgName(null);
          }
        } catch {
          setOrgName(null);
        }
      })();
    }
  }, [loading, session]);

  if (loading || !session) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  async function leave() {
    setError(null);
    setLeaving(true);
    const result = await signOut();
    setLeaving(false);
    if (result) {
      setError(result);
      return;
    }
    router.replace("/");
  }

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Workspace"
        subtitle={isAuthority ? "Authority Ops" : "Commuter Profile"}
        canGoBack
        onBack={() => router.replace("/")}
        showLive={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            {isAuthority ? "CIVIC CONTROL ROOM ACCESS" : "AUTHENTICATED COMMUTER"}
          </Text>
          <Text style={styles.title}>Your Workspace</Text>
          <Text style={styles.subtitle}>
            Signed in as <Text style={styles.boldEmail}>{session.user.email ?? "User"}</Text>.
          </Text>
        </View>

        {error ? (
          <FeedbackBox variant="error" message={error} />
        ) : null}

        {/* Account Details Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.avatar, isAuthority && styles.authorityAvatar]}>
              <Text style={[styles.avatarText, isAuthority && styles.authorityAvatarText]}>
                {isAuthority ? "A" : (session.user.email?.[0] ?? "C").toUpperCase()}
              </Text>
            </View>
            <View style={styles.accountTextGroup}>
              <Text style={styles.accountEmail}>{session.user.email}</Text>
              <View style={[styles.roleBadge, isAuthority && styles.authorityRoleBadge]}>
                <Text style={[styles.roleBadgeText, isAuthority && styles.authorityRoleBadgeText]}>
                  {isAuthority
                    ? "Traffic Authority · Mangaluru Operations"
                    : orgName
                    ? `Employee · ${orgName}`
                    : "Verified Commuter Account"}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.accountNote}>
            {isAuthority
              ? "You have municipal authorization to verify, confirm (L6), resolve, or reject reported road hazards across the Mangaluru coastal corridor."
              : "Your reports contribute directly to community verification levels (L1–L6). Selective journey sharing and employer delay certificates are currently in progress as Phase 7 extensions."}
          </Text>
        </Card>

        {/* Dedicated Authority Control Room Card */}
        {isAuthority ? (
          <Card
            onPress={() => router.push("/authority")}
            style={styles.authorityFeaturedCard}
          >
            <View style={styles.actionRow}>
              <View style={styles.authorityIconBg}>
                <Icon name="shield" size={24} color="#ffffff" />
              </View>
              <View style={styles.actionTextCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={styles.authorityFeaturedTitle}>Authority Control Room</Text>
                  <View style={styles.authorityOpsPill}>
                    <Text style={styles.authorityOpsPillText}>L6 REVIEW</Text>
                  </View>
                </View>
                <Text style={styles.authorityFeaturedSubtitle}>
                  Moderate active community reports, confirm L6 municipal records, resolve or reject incidents
                </Text>
              </View>
              <Icon name="chevron_right" size={20} color={colors.primary} />
            </View>
          </Card>
        ) : null}

        {/* Quick Navigation Cards */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionHeading}>
            {isAuthority ? "Operations & Commuter Tools" : "Commuter Actions"}
          </Text>

          {isAuthority ? (
            <Card
              onPress={() => router.push("/authority")}
              style={styles.actionCard}
            >
              <View style={styles.actionRow}>
                <View style={[styles.actionIconBg, { backgroundColor: colors.errorSurface }]}>
                  <Icon name="shield" size={20} color={colors.error} />
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={styles.actionTitle}>Active Incident Moderation</Text>
                  <Text style={styles.actionSubtitle}>Review, confirm L6, resolve, or reject hazards</Text>
                </View>
                <Icon name="chevron_right" size={18} color={colors.textMuted} />
              </View>
            </Card>
          ) : null}

          <Card
            onPress={() => router.push("/report")}
            style={styles.actionCard}
          >
            <View style={styles.actionRow}>
              <View style={[styles.actionIconBg, { backgroundColor: colors.errorSurface }]}>
                <Icon name="warning" size={20} color={colors.error} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitle}>Report road obstacle</Text>
                <Text style={styles.actionSubtitle}>Waterlogging, potholes, breakdown, closures</Text>
              </View>
              <Icon name="chevron_right" size={18} color={colors.textMuted} />
            </View>
          </Card>

          <Card
            onPress={() => router.push("/planner")}
            style={styles.actionCard}
          >
            <View style={styles.actionRow}>
              <View style={[styles.actionIconBg, { backgroundColor: colors.evidenceSurface }]}>
                <Icon name="alt_route" size={20} color={colors.secondary} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitle}>Plan my route</Text>
                <Text style={styles.actionSubtitle}>Inspect presets, free-flow estimates & alternatives</Text>
              </View>
              <Icon name="chevron_right" size={18} color={colors.textMuted} />
            </View>
          </Card>

          <Card
            onPress={() => router.push("/traffic")}
            style={styles.actionCard}
          >
            <View style={styles.actionRow}>
              <View style={[styles.actionIconBg, { backgroundColor: colors.primaryFixed }]}>
                <Icon name="explore" size={20} color={colors.primary} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitle}>Live community traffic map</Text>
                <Text style={styles.actionSubtitle}>View real-time reports and corridor statuses</Text>
              </View>
              <Icon name="chevron_right" size={18} color={colors.textMuted} />
            </View>
          </Card>

          {/* My Journeys & Employer Sharing marked as IN PROGRESS */}
          <Card
            onPress={() => router.push("/journeys")}
            style={[styles.actionCard, styles.inProgressCard]}
          >
            <View style={styles.actionRow}>
              <View style={[styles.actionIconBg, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Icon name="shield" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.actionTextCol}>
                <View style={styles.titleBadgeRow}>
                  <Text style={styles.actionTitle}>My journeys & employer sharing</Text>
                  <View style={styles.inProgressBadge}>
                    <Text style={styles.inProgressBadgeText}>IN PROGRESS</Text>
                  </View>
                </View>
                <Text style={styles.actionSubtitle}>
                  Phase 7 planned extension · Delay receipts & employer corridor sharing
                </Text>
              </View>
              <Icon name="chevron_right" size={18} color={colors.textMuted} />
            </View>
          </Card>
        </View>

        {/* Sign Out Action */}
        <View style={styles.signOutSection}>
          <Button
            title="Sign out of account"
            loading={leaving}
            onPress={() => void leave()}
            variant="secondary"
          />
        </View>

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
  boldEmail: {
    color: colors.text,
    fontWeight: "600",
  },
  card: {
    padding: space.md,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryFixed,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.headlineSm,
    color: colors.onPrimaryFixed,
    fontWeight: "700",
  },
  accountTextGroup: {
    flex: 1,
    gap: 3,
  },
  accountEmail: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.successSurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  roleBadgeText: {
    ...typography.codeSm,
    fontSize: 9.5,
    color: colors.success,
    fontWeight: "700",
  },
  accountNote: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionsSection: {
    gap: 10,
  },
  sectionHeading: {
    ...typography.titleMd,
    fontWeight: "700",
    color: colors.text,
  },
  actionCard: {
    padding: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    ...typography.labelLg,
    fontWeight: "700",
    color: colors.text,
  },
  actionSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
    marginTop: 1,
  },
  authorityFeaturedCard: {
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: colors.surface,
    elevation: 2,
  },
  authorityIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  authorityFeaturedTitle: {
    ...typography.labelLg,
    fontWeight: "700",
    color: colors.text,
  },
  authorityOpsPill: {
    backgroundColor: colors.errorSurface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  authorityOpsPillText: {
    ...typography.codeSm,
    fontSize: 9,
    color: colors.error,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  authorityFeaturedSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  authorityAvatar: {
    backgroundColor: colors.errorSurface,
    borderColor: colors.error,
  },
  authorityAvatarText: {
    color: colors.error,
  },
  authorityRoleBadge: {
    backgroundColor: colors.errorSurface,
  },
  authorityRoleBadgeText: {
    color: colors.error,
  },
  inProgressCard: {
    borderStyle: "dashed",
    borderColor: colors.outlineVariant,
  },
  inProgressBadge: {
    backgroundColor: colors.surfaceContainerHighest,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  inProgressBadgeText: {
    ...typography.codeSm,
    fontSize: 8.5,
    color: colors.textSecondary,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  signOutSection: {
    paddingTop: 4,
  },
});
