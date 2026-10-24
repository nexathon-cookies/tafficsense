import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../providers/auth-provider";
import { colors, radius, typography } from "../../theme/tokens";
import { Icon } from "./Icon";

export type NavTab = "home" | "map" | "report" | "plan" | "me" | "authority";

type BottomNavProps = {
  activeTab: NavTab;
  badgeCount?: number;
};

export function BottomNav({ activeTab, badgeCount }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const { session, role } = useAuth();
  const isAuthority = role === "authority" || Boolean(session?.user?.email?.toLowerCase().includes("authority"));

  const handleNavigate = (tab: NavTab) => {
    switch (tab) {
      case "home":
        if (activeTab !== "home") router.replace("/");
        break;
      case "map":
        if (activeTab !== "map") router.replace("/traffic");
        break;
      case "report":
        router.push("/report");
        break;
      case "plan":
        if (activeTab !== "plan") router.replace("/planner");
        break;
      case "me":
      case "authority":
        if (session) {
          if (isAuthority) {
            if (activeTab !== "authority") router.replace("/authority");
          } else {
            if (activeTab !== "me") router.replace("/workspace");
          }
        } else {
          router.push("/auth/login");
        }
        break;
    }
  };

  return (
    <View
      style={[
        styles.navBar,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          height: 60 + Math.max(insets.bottom, 8),
        },
      ]}
    >
      {/* Tab 1: Home */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "home" }}
        accessibilityLabel="Navigate to Home"
        onPress={() => handleNavigate("home")}
        style={styles.tabItem}
      >
        <Icon
          name="home"
          size={24}
          color={activeTab === "home" ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === "home" && styles.tabLabelActive,
          ]}
        >
          Home
        </Text>
      </Pressable>

      {/* Tab 2: Map */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "map" }}
        accessibilityLabel="Navigate to Live Traffic Map"
        onPress={() => handleNavigate("map")}
        style={styles.tabItem}
      >
        <Icon
          name="explore"
          size={24}
          color={activeTab === "map" ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === "map" && styles.tabLabelActive,
          ]}
        >
          Map
        </Text>
      </Pressable>

      {/* Tab 3: Center Elevated Report Button */}
      <View style={styles.centerFabContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report road hazard"
          onPress={() => handleNavigate("report")}
          style={({ pressed }) => [
            styles.centerFab,
            pressed && styles.centerFabPressed,
          ]}
        >
          <Icon name="add" size={28} color="#ffffff" />
        </Pressable>
        <Text style={styles.centerFabLabel}>Report</Text>
      </View>

      {/* Tab 4: Plan */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "plan" }}
        accessibilityLabel="Navigate to Route Planner"
        onPress={() => handleNavigate("plan")}
        style={styles.tabItem}
      >
        <Icon
          name="alt_route"
          size={24}
          color={activeTab === "plan" ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === "plan" && styles.tabLabelActive,
          ]}
        >
          Plan
        </Text>
      </Pressable>

      {/* Tab 5: Me / Authority */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "me" || activeTab === "authority" }}
        accessibilityLabel={isAuthority ? "Navigate to Authority Control Room" : "Navigate to Account and Journeys"}
        onPress={() => handleNavigate(isAuthority ? "authority" : "me")}
        style={styles.tabItem}
      >
        <View style={{ position: "relative" }}>
          <Icon
            name={isAuthority ? "shield" : "account_circle"}
            size={24}
            color={(activeTab === "me" || activeTab === "authority") ? colors.primary : colors.textSecondary}
          />
          {isAuthority && badgeCount && badgeCount > 0 ? (
            <View style={styles.badgeDot} />
          ) : null}
        </View>
        <Text
          style={[
            styles.tabLabel,
            (activeTab === "me" || activeTab === "authority") && styles.tabLabelActive,
          ]}
        >
          {isAuthority ? "Authority" : "Me"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(250, 248, 255, 0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 50,
  },
  tabItem: {
    minWidth: 56,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    ...typography.labelSm,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  centerFabContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    width: 68,
  },
  centerFab: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  centerFabPressed: {
    backgroundColor: colors.primaryPressed,
    transform: [{ scale: 0.94 }],
  },
  centerFabLabel: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "700",
    marginTop: 3,
  },
  badgeDot: {
    position: "absolute",
    top: -1,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
});
