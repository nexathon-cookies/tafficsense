import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, minTouchTarget, radius, space, typography } from "../../theme/tokens";

export type FeedbackVariant = "error" | "warning" | "success" | "info";

type FeedbackBoxProps = {
  variant: FeedbackVariant;
  title?: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function FeedbackBox({
  variant,
  title,
  message,
  actionText,
  onAction,
  style,
}: FeedbackBoxProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.box, styles[variant], style]}
    >
      <View style={styles.content}>
        {title ? <Text style={[styles.title, styles[`${variant}Text`]]}>{title}</Text> : null}
        <Text style={[styles.message, styles[`${variant}Text`]]}>{message}</Text>
      </View>
      {actionText && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={[styles.actionText, styles[`${variant}ActionText`]]}>{actionText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: space.xs,
  },
  content: {
    gap: 4,
  },
  title: {
    ...typography.titleSm,
    fontWeight: "700",
  },
  message: {
    ...typography.bodyMd,
    lineHeight: 20,
  },
  error: {
    backgroundColor: colors.errorSurface,
    borderColor: "#ffdad6",
  },
  errorText: {
    color: colors.error,
  },
  warning: {
    backgroundColor: colors.warningSurface,
    borderColor: "#ffe0b2",
  },
  warningText: {
    color: colors.warning,
  },
  success: {
    backgroundColor: colors.successSurface,
    borderColor: "#c8e6c9",
  },
  successText: {
    color: colors.success,
  },
  info: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.border,
  },
  infoText: {
    color: colors.textSecondary,
  },
  actionButton: {
    alignSelf: "flex-start",
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionText: {
    ...typography.labelLg,
    fontWeight: "700",
  },
  errorActionText: {
    color: colors.error,
  },
  warningActionText: {
    color: colors.warning,
  },
  successActionText: {
    color: colors.success,
  },
  infoActionText: {
    color: colors.primary,
  },
});
