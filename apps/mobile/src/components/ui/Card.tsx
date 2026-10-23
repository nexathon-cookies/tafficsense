import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle, type GestureResponderEvent } from "react-native";
import { colors, radius, shadows, space } from "../../theme/tokens";

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityRole?: "button" | "none";
  accessibilityLabel?: string;
  accessibilityLiveRegion?: "none" | "polite" | "assertive";
  elevated?: boolean;
};

export function Card({
  children,
  style,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  accessibilityLiveRegion,
  elevated = false,
}: CardProps) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole={accessibilityRole ?? "button"}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          elevated && styles.elevated,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, elevated && styles.elevated, style]} accessibilityLiveRegion={accessibilityLiveRegion}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
    ...shadows.card,
  },
  elevated: {
    ...shadows.sheet,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
