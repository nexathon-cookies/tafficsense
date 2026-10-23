import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { colors, minTouchTarget, radius, space, typography } from "../../theme/tokens";

type FormFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function FormField({
  label,
  error,
  helperText,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: FormFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          focused && styles.inputFocused,
          Boolean(error) && styles.inputError,
          props.multiline && styles.inputMultiline,
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  label: {
    ...typography.titleSm,
    color: colors.text,
    fontWeight: "700",
  },
  input: {
    minHeight: minTouchTarget + 4,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    color: colors.text,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.error,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    textAlignVertical: "top",
  },
  errorText: {
    ...typography.bodySm,
    color: colors.error,
  },
  helperText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
