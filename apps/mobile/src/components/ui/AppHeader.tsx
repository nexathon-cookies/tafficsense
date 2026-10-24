import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
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

          {/* TrafficSense Brand Logo */}
          <Image
            source={require("../../../assets/icon.png")}
            style={styles.logoImage}
            accessibilityLabel="TrafficSense logo"
          />

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
  logoImage: {
    width: 30,
    height: 30,
    borderRadius: 7,
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
