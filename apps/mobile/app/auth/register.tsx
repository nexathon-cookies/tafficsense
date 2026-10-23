import { Link, router, Stack } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/providers/auth-provider";
import { MIN_REGISTRATION_PASSWORD } from "../../src/lib/auth-rules";
import { AppHeader, Button, Card, FeedbackBox, FormField } from "../../src/components/ui";
import { colors, space, typography } from "../../src/theme/tokens";

export default function RegisterScreen() {
  const { signUp, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(configurationError);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setMessage(null);
    setSubmitting(true);
    const result = await signUp(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsConfirmation) {
      setMessage("Account created. Check your email to confirm your account before signing in.");
      return;
    }
    router.replace("/workspace");
  }

  return (
    <View style={styles.screenWrapper}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Create account"
        subtitle="Commuter Registration"
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
            <Text style={styles.eyebrow}>COMMUTER REGISTRATION</Text>
            <Text style={styles.title}>Create commuter account</Text>
            <Text style={styles.subtitle}>
              Accounts are created with commuter role permissions. Report road obstacles, view verified community evidence, and share corridor status.
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
              helperText={`Must be at least ${MIN_REGISTRATION_PASSWORD} characters long.`}
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

            {message ? (
              <FeedbackBox
                variant="success"
                title="Registration Sent"
                message={message}
                actionText="Go to sign in"
                onAction={() => router.replace("/auth/login")}
              />
            ) : null}

            <Button
              title="Create account"
              loading={submitting}
              onPress={() => void submit()}
              variant="primary"
            />
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Link href="/auth/login" asChild>
              <Button
                title="Sign in instead"
                onPress={() => router.push("/auth/login")}
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
