import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, typography } from "../../theme/tokens";
import { Icon } from "./Icon";

type EvidenceBadgeProps = {
  level: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function EvidenceBadge({ level, label, style }: EvidenceBadgeProps) {
  const displayText = label ? `${level} · ${label}` : level;
  return (
    <View style={[styles.evidenceBadge, style]} accessibilityLabel={`Evidence level: ${displayText}`}>
      <Icon name="verified" size={13} color={colors.evidence} />
      <Text style={styles.evidenceText}>{displayText}</Text>
    </View>
  );
}

type FreshnessChipProps = {
  label: string;
  stale?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FreshnessChip({ label, stale = false, style }: FreshnessChipProps) {
  return (
    <View
      style={[styles.freshnessChip, stale ? styles.staleChip : styles.freshChip, style]}
      accessibilityLabel={`Freshness status: ${label}`}
    >
      <View style={[styles.dot, stale ? styles.staleDot : styles.freshDot]} />
      <Text style={[styles.baseFreshnessText, stale ? styles.staleText : styles.freshText]}>
        {label}
      </Text>
    </View>
  );
}

type SimulatedBadgeProps = {
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function SimulatedBadge({ label = "SIMULATED DATA", style }: SimulatedBadgeProps) {
  return (
    <View style={[styles.simulatedBadge, style]} accessibilityLabel={`Data type: ${label}`}>
      <Text style={styles.simulatedText}>{label}</Text>
    </View>
  );
}

type StatusBadgeProps = {
  label: string;
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  style?: StyleProp<ViewStyle>;
};

export function StatusBadge({ label, variant = "neutral", style }: StatusBadgeProps) {
  return (
    <View style={[styles.statusBadge, styles[`status_${variant}`], style]}>
      <Text style={[styles.baseStatusText, styles[`statusText_${variant}`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  evidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.evidenceSurface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 5,
  },
  evidenceText: {
    ...typography.codeMd,
    fontSize: 11,
    color: colors.evidence,
    fontWeight: "600",
  },
  freshnessChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  freshChip: {
    backgroundColor: colors.successSurface,
  },
  freshDot: {
    backgroundColor: colors.success,
  },
  baseFreshnessText: {
    ...typography.labelMd,
  },
  freshText: {
    color: colors.success,
    fontWeight: "600",
  },
  staleChip: {
    backgroundColor: colors.warningSurface,
  },
  staleDot: {
    backgroundColor: colors.warning,
  },
  staleText: {
    color: colors.warning,
    fontWeight: "600",
  },
  simulatedBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.evidenceSurface,
    borderWidth: 1,
    borderColor: colors.evidence,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  simulatedText: {
    ...typography.codeSm,
    color: colors.evidence,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  baseStatusText: {
    ...typography.labelSm,
  },
  status_success: {
    backgroundColor: colors.successSurface,
  },
  statusText_success: {
    color: colors.success,
    fontWeight: "600",
  },
  status_warning: {
    backgroundColor: colors.warningSurface,
  },
  statusText_warning: {
    color: colors.warning,
    fontWeight: "600",
  },
  status_error: {
    backgroundColor: colors.errorSurface,
  },
  statusText_error: {
    color: colors.error,
    fontWeight: "600",
  },
  status_info: {
    backgroundColor: colors.surfaceContainer,
  },
  statusText_info: {
    color: colors.primary,
    fontWeight: "600",
  },
  status_neutral: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  statusText_neutral: {
    color: colors.textSecondary,
    fontWeight: "500",
  },
});
