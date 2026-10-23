import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../providers/auth-provider";
import { colors, radius, typography } from "../../theme/tokens";
import { Icon } from "./Icon";

export type NavTab = "home" | "map" | "report" | "plan" | "me";

type BottomNavProps = {
  activeTab: NavTab;
};

export function BottomNav({ activeTab }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

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
        if (session) {
          if (activeTab !== "me") router.replace("/workspace");
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
          height: 64 + Math.max(insets.bottom, 8),
        },
      ]}
    >
      {/* Tab 1: Explore */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "home" }}
        accessibilityLabel="Navigate to Explore"
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
          Explore
        </Text>
      </Pressable>

      {/* Tab 2: Traffic */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "map" }}
        accessibilityLabel="Navigate to Traffic"
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
          Traffic
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
          <Icon name="warning" size={26} color="#ffffff" />
        </Pressable>
        <Text style={styles.centerFabLabel}>Report</Text>
      </View>

      {/* Tab 4: Plan */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "plan" }}
        accessibilityLabel="Navigate to Plan"
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

      {/* Tab 5: Me */}
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === "me" }}
        accessibilityLabel="Navigate to Me"
        onPress={() => handleNavigate("me")}
        style={styles.tabItem}
      >
        <Icon
          name="account_circle"
          size={24}
          color={activeTab === "me" ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === "me" && styles.tabLabelActive,
          ]}
        >
          Me
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
    backgroundColor: "rgba(248, 250, 249, 0.98)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    shadowColor: "#172321",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
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
    marginTop: -26,
    width: 68,
  },
  centerFab: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  centerFabPressed: {
    backgroundColor: colors.primary,
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  centerFabLabel: {
    ...typography.labelSm,
    color: colors.primary,
    fontWeight: "700",
    marginTop: 3,
  },
});
