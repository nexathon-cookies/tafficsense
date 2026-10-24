import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../src/providers/auth-provider";
import { safeReturnPath } from "../../src/lib/auth-rules";
import { AppHeader, Button, Card, FeedbackBox, FormField, Icon } from "../../src/components/ui";
import type { IconName } from "../../src/components/ui/Icon";
import { colors, layout, minTouchTarget, radius, shadows, space, typography } from "../../src/theme/tokens";

type DemoAccount = {
  label: string;
  role: "commuter" | "employer" | "authority" | "admin";
  email: string;
  password: string;
  badge: string;
  icon: IconName;
  description: string;
};

const SEEDED_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "Commuter (Primary)",
    role: "commuter",
    email: "commuter@demo.trafficsense.test",
    password: "9dwxkTxE5YdAEXnGmMuJ5sfdf2h777ix",
    badge: "COMMUTER",
    icon: "directions_car",
    description: "Standard road user · Submit & verify reports",
  },
  {
    label: "Commuter B",
    role: "commuter",
    email: "commuter-b@demo.trafficsense.test",
    password: "w7CEllGEJayU78SSrtZDI9jTzo83Owb_",
    badge: "CORROBORATOR",
    icon: "directions_car",
    description: "Second driver · Independent corridor verification",
  },
  {
    label: "Traffic Authority",
    role: "authority",
    email: "authority@demo.trafficsense.test",
    password: "1vtM3X1e0Rc6BigIJRIGE-JKgGXDDSvz",
    badge: "AUTHORITY",
    icon: "shield",
    description: "Control room · Verify, confirm & clear hazards",
  },
  {
    label: "Employer A",
    role: "employer",
    email: "employer-a@demo.trafficsense.test",
    password: "bfYZVofoGLTBibYmXwKSiGOHY8EfTWmy",
    badge: "EMPLOYER",
    icon: "group",
    description: "Workplace coordinator · Commute delay receipts",
  },
];

export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(configurationError);
  const [submitting, setSubmitting] = useState(false);
  const [activeDemoEmail, setActiveDemoEmail] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>(SEEDED_DEMO_ACCOUNTS);

  useEffect(() => {
    let cancelled = false;
    const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
    if (!apiBaseUrl) return;

    fetch(`${apiBaseUrl}/api/demo-accounts`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ok && Array.isArray(data.accounts) && data.accounts.length > 0) {
          const mapped: DemoAccount[] = data.accounts.map((acc: { label?: string; role?: string; email: string; password: string }) => {
            const role = (acc.role ?? "commuter") as DemoAccount["role"];
            const rawLabel = acc.label ?? acc.email;
            const label = rawLabel.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            let icon: IconName = "directions_car";
            let badge = "COMMUTER";
            let description = "Standard road user · Submit & verify reports";
            if (role === "authority") {
              icon = "shield";
              badge = "AUTHORITY";
              description = "Control room · Verify, confirm & clear hazards";
            } else if (role === "employer") {
              icon = "group";
              badge = "EMPLOYER";
              description = "Workplace coordinator · Commute delay receipts";
            } else if (label.toLowerCase().includes("b") || label.toLowerCase().includes("c")) {
              icon = "directions_car";
              badge = "CORROBORATOR";
              description = "Secondary driver · Multi-party verification";
            }
            return {
              label,
              role,
              email: acc.email,
              password: acc.password,
              badge,
              icon,
              description,
            };
          });
          setDemoAccounts(mapped);
        }
      })
      .catch(() => {
        // Fallback to seeded demo accounts already in state
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleQuickDemoSignIn(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
    setSubmitting(true);
    setActiveDemoEmail(account.email);

    const result = await signIn(account.email, account.password);
    setSubmitting(false);
    setActiveDemoEmail(null);

    if (result) {
      setError(result);
      return;
    }

    if (account.role === "authority") {
      router.replace("/authority");
    } else {
      router.replace(safeReturnPath(next));
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result) {
      setError(result);
      return;
    }
    if (email.toLowerCase().includes("authority")) {
      router.replace("/authority");
    } else {
      router.replace(safeReturnPath(next));
    }
  }

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Sign in"
        subtitle="TrafficSense Mangaluru"
        canGoBack
        onBack={() => router.replace("/")}
        showLive={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Branding Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={styles.corridorTag}>
                <Text style={styles.corridorTagText}>MANGALURU CORRIDOR</Text>
              </View>
              <View style={styles.demoPill}>
                <Icon name="verified" size={13} color={colors.secondary} />
                <Text style={styles.demoPillText}>DEMO AUTH</Text>
              </View>
            </View>
            <Text style={styles.title}>Account Access</Text>
            <Text style={styles.subtitle}>
              Sign in with a commuter, authority, or employer account. Public traffic maps and route planning remain open without signing in.
            </Text>
          </View>

          {/* Quick Judge Demo Sign-In Card (1-Click) */}
          <Card style={styles.quickDemoCard}>
            <View style={styles.quickDemoHeader}>
              <View style={styles.quickDemoTitleRow}>
                <View style={styles.quickDemoIconCircle}>
                  <Icon name="tune" size={18} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickDemoTitle}>Quick Judge Demo Sign-In</Text>
                  <Text style={styles.quickDemoSubtitle}>
                    1-Click instant authentication for evaluation
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.demoAccountsList}>
              {demoAccounts.map((account) => {
                const isActive = activeDemoEmail === account.email && submitting;
                const isAuthority = account.role === "authority";
                const isEmployer = account.role === "employer";

                const badgeBg = isAuthority
                  ? colors.errorSurface
                  : isEmployer
                  ? colors.warningSurface
                  : colors.evidenceSurface;

                const badgeColor = isAuthority
                  ? colors.error
                  : isEmployer
                  ? colors.warning
                  : colors.secondary;

                return (
                  <Pressable
                    key={account.email}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick sign in as ${account.label}`}
                    disabled={submitting}
                    onPress={() => void handleQuickDemoSignIn(account)}
                    style={({ pressed }) => [
                      styles.demoAccountRow,
                      pressed && styles.demoAccountRowPressed,
                      isActive && styles.demoAccountRowActive,
                    ]}
                  >
                    <View style={[styles.roleIconBox, { backgroundColor: badgeBg }]}>
                      <Icon name={account.icon} size={20} color={badgeColor} />
                    </View>

                    <View style={styles.demoAccountInfo}>
                      <View style={styles.demoAccountTopRow}>
                        <Text style={styles.demoAccountLabel}>{account.label}</Text>
                        <View style={[styles.roleBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.roleBadgeText, { color: badgeColor }]}>
                            {account.badge}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.demoAccountDesc} numberOfLines={1}>
                        {account.description}
                      </Text>
                      <Text style={styles.demoAccountEmail}>{account.email}</Text>
                    </View>

                    <View style={styles.demoActionCol}>
                      {isActive ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <View style={styles.quickSignBtn}>
                          <Text style={styles.quickSignBtnText}>Sign in</Text>
                          <Icon name="chevron_right" size={14} color={colors.primary} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Guest Explorer CTA */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue as guest to view traffic map"
            onPress={() => router.replace("/traffic")}
            style={({ pressed }) => [
              styles.guestButton,
              pressed && styles.guestButtonPressed,
            ]}
          >
            <Icon name="explore" size={18} color={colors.primary} />
            <Text style={styles.guestButtonText}>Continue as Guest (Public Map & Routes)</Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR SIGN IN WITH PASSWORD</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Manual Sign-In Card */}
          <Card style={styles.formCard}>
            <FormField
              label="Email address"
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="commuter@demo.trafficsense.test"
              value={email}
            />

            <FormField
              label="Password"
              accessibilityLabel="Password"
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="••••••••••••"
              secureTextEntry
              value={password}
            />

            {error ? (
              <FeedbackBox
                variant="error"
                message={error}
                actionText="Dismiss"
                onAction={() => setError(null)}
              />
            ) : null}

            <Button
              title="Sign in with credentials"
              loading={submitting && !activeDemoEmail}
              onPress={() => void submit()}
              variant="primary"
              icon={<Icon name="chevron_right" size={18} color="#ffffff" />}
            />
          </Card>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Need a new commuter account?</Text>
            <Link href="/auth/register" asChild>
              <Button
                title="Create a commuter account"
                onPress={() => router.push("/auth/register")}
                variant="outline"
              />
            </Link>

            <View style={styles.transparencyNotice}>
              <Icon name="shield" size={14} color={colors.textMuted} />
              <Text style={styles.transparencyNoticeText}>
                Local demo mode: Uses synthetic Mangaluru corridor accounts. No private personal data or GPS tracking is retained.
              </Text>
            </View>
          </View>

          <View style={{ height: layout.safeBottomPadding }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: space.gutter,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.md,
  },
  header: {
    gap: space.xs,
    paddingBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginBottom: 4,
  },
  corridorTag: {
    backgroundColor: colors.surfaceContainerHighest,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  corridorTagText: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.primary,
    fontWeight: "700",
  },
  demoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  demoPillText: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.secondary,
    fontWeight: "700",
  },
  title: {
    ...typography.headlineMd,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  quickDemoCard: {
    padding: space.md,
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  quickDemoHeader: {
    paddingBottom: 4,
  },
  quickDemoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quickDemoIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  quickDemoTitle: {
    ...typography.titleSm,
    fontWeight: "700",
    color: colors.text,
  },
  quickDemoSubtitle: {
    ...typography.bodySm,
    fontSize: 12,
    color: colors.textSecondary,
  },
  demoAccountsList: {
    gap: 8,
  },
  demoAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: minTouchTarget + 6,
    padding: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    gap: 10,
  },
  demoAccountRowPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.99 }],
  },
  demoAccountRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.evidenceSurface,
  },
  roleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  demoAccountInfo: {
    flex: 1,
    gap: 2,
  },
  demoAccountTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  demoAccountLabel: {
    ...typography.labelMd,
    fontWeight: "700",
    color: colors.text,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
  },
  roleBadgeText: {
    ...typography.codeSm,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  demoAccountDesc: {
    ...typography.bodySm,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  demoAccountEmail: {
    ...typography.codeSm,
    fontSize: 10,
    color: colors.textMuted,
  },
  demoActionCol: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  quickSignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickSignBtnText: {
    ...typography.labelSm,
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.primary,
  },
  guestButton: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  guestButtonPressed: {
    backgroundColor: colors.surfaceContainerLow,
    transform: [{ scale: 0.99 }],
  },
  guestButtonText: {
    ...typography.labelMd,
    fontWeight: "700",
    color: colors.primary,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surfaceContainerHighest,
  },
  dividerText: {
    ...typography.codeSm,
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  formCard: {
    padding: space.md,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  footer: {
    alignItems: "stretch",
    gap: space.sm,
    paddingTop: space.xs,
  },
  footerText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  transparencyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 6,
    marginTop: 4,
  },
  transparencyNoticeText: {
    ...typography.codeSm,
    fontSize: 10.5,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 14,
  },
});
