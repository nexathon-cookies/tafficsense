import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/providers/auth-provider";
import { safeReturnPath } from "../../src/lib/auth-rules";
import { AppHeader, Button, Card, FeedbackBox, FormField } from "../../src/components/ui";
import { colors, space, typography } from "../../src/theme/tokens";

export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(configurationError);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result) {
      setError(result);
      return;
    }
    router.replace(safeReturnPath(next));
  }

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Sign in"
        subtitle="Commuter Access"
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
          <View style={styles.header}>
            <Text style={styles.eyebrow}>COMMUTER ACCESS</Text>
            <Text style={styles.title}>Sign in to TrafficSense</Text>
            <Text style={styles.subtitle}>
              Sign in with your commuter account to submit road problem reports and share journey status. Public traffic map and routes remain open to all.
            </Text>
          </View>

          <Card style={styles.card}>
            <FormField
              label="Email address"
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="commuter@example.com"
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
              title="Sign in"
              loading={submitting}
              onPress={() => void submit()}
              variant="primary"
            />
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Need a commuter account?</Text>
            <Link href="/auth/register" asChild>
              <Button
                title="Create a commuter account"
                onPress={() => router.push("/auth/register")}
                variant="outline"
              />
            </Link>
          </View>
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
    paddingTop: space.md,
    paddingBottom: space.xl * 2,
    gap: space.md,
  },
  header: {
    gap: space.xs,
  },
  eyebrow: {
    ...typography.codeSm,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    ...typography.headlineLg,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    padding: space.lg,
    gap: space.md,
  },
  footer: {
    alignItems: "stretch",
    gap: space.sm,
  },
  footerText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
