import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../providers/auth-provider";
import { colors, radius, typography } from "../../theme/tokens";
import { Icon } from "./Icon";

type AppHeaderProps = {
  subtitle?: string;
  title?: string;
  canGoBack?: boolean;
  onBack?: () => void;
  showLive?: boolean;
};

export function AppHeader({
  subtitle = "Mangaluru · Home",
  title = "TrafficSense",
  canGoBack = false,
  onBack,
  showLive = true,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handleProfilePress = () => {
    if (session) {
      router.push("/workspace");
    } else {
      router.push("/auth/login");
    }
  };

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.headerContent}>
        {/* Left Side */}
        <View style={styles.leftGroup}>
          {canGoBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={handleBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Icon name="arrow_back" size={22} color={colors.text} />
            </Pressable>
          ) : null}

          {/* TrafficSense Civic Monogram Logo */}
          <View style={styles.logoMark}>
            <View style={styles.logoLinePrimary} />
            <View style={styles.logoLineSecondary} />
            <View style={styles.logoDot} />
          </View>

          <View style={styles.titleColumn}>
            <Text numberOfLines={1} style={styles.brandTitle}>
              {canGoBack ? title : "TrafficSense"}
            </Text>
            <Text numberOfLines={1} style={styles.brandSubtitle}>
              {canGoBack ? "Mangaluru" : subtitle.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Right Side */}
        <View style={styles.rightGroup}>
          {showLive ? (
            <View style={styles.liveBadge} accessibilityLabel="Status: LIVE data">
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}

          {/* Commuter Avatar Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={session ? "Open commuter workspace" : "Sign in to account"}
            onPress={handleProfilePress}
            style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
          >
            <View style={styles.avatarRing}>
              {session?.user.email ? (
                <Text style={styles.avatarInitials}>
                  {session.user.email[0].toUpperCase()}
                </Text>
              ) : (
                <Icon name="account_circle" size={26} color={colors.primary} />
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 50,
  },
  headerContent: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    marginLeft: -8,
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  logoLinePrimary: {
    position: "absolute",
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
    top: 9,
  },
  logoLineSecondary: {
    position: "absolute",
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: colors.secondary,
    bottom: 9,
  },
  logoDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.onPrimaryFixed,
    right: 5,
    top: 5,
  },
  titleColumn: {
    justifyContent: "center",
    flexShrink: 1,
  },
  brandTitle: {
    ...typography.headlineSm,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    ...typography.labelSm,
    color: colors.textSecondary,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveBadge: {
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  liveText: {
    ...typography.codeSm,
    color: colors.onPrimaryFixed,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  avatarButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 2,
    borderColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    ...typography.labelMd,
    color: colors.primary,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});
