import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/providers/auth-provider";
import { colors, typography } from "../src/theme/tokens";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.headlineSm, color: colors.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" options={{ animation: "fade" }} />
        <Stack.Screen name="traffic" options={{ animation: "fade" }} />
        <Stack.Screen name="planner" options={{ animation: "fade" }} />
        <Stack.Screen name="workspace" options={{ animation: "fade" }} />
        <Stack.Screen name="report" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="journeys" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="authority" options={{ animation: "fade" }} />
        <Stack.Screen name="auth/login" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="auth/register" options={{ animation: "slide_from_right" }} />
      </Stack>
    </AuthProvider>
  );
}
