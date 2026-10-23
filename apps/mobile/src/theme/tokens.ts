import { Platform, type TextStyle, type ViewStyle } from "react-native";

// Visual tokens aligned with apps/mobile/design/plan2/DESIGN.md (Plan 2: Precision Mobility)
export const colors = {
  background: "#effcf9",
  surface: "#effcf9",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#e9f7f3",
  surfaceContainer: "#e3f1ed",
  surfaceContainerHigh: "#ddebe7",
  surfaceContainerHighest: "#d8e5e2",
  border: "#e3f1ed",
  outline: "#6f7977",
  outlineVariant: "#bec9c6",
  primary: "#00665e",
  primaryDark: "#004c46",
  primaryPressed: "rgba(0, 0, 0, 0.10)",
  onPrimary: "#ffffff",
  primaryFixed: "#a2f1e6",
  onPrimaryFixed: "#00201d",
  onPrimaryFixedVariant: "#00504a",
  secondary: "#516072",
  secondaryContainer: "#d2e1f7",
  secondaryBorder: "#bec9c6",
  text: "#121e1c",
  textSecondary: "#3e4947",
  textMuted: "#6f7977",
  evidence: "#6616d7",
  evidenceSurface: "#f3edff",
  warning: "#8b4a00",
  warningAccent: "#ffb77d",
  warningSurface: "#fff4e5",
  error: "#ba1a1a",
  errorSurface: "#ffdad6",
  success: "#176d55",
  successSurface: "#e8f5ee",
} as const;

// Strict minimum 48x48px clickable bounding box for interactive elements on phone.
export const minTouchTarget = 48;

export const radius = {
  sm: 4,
  md: 8,
  input: 10,
  control: 12,
  card: 16,
  pill: 9999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  gutter: 16,
} as const;

export const layout = {
  gutterPhone: 16,
  gutterTablet: 24,
  sectionGap: 20,
  cardGap: 12,
  controlGap: 8,
  bottomNavHeight: 64,
  safeBottomPadding: 88,
} as const;

export const shadows = {
  card: {
    shadowColor: "#172321",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  } as ViewStyle,
  sheet: {
    shadowColor: "#172321",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  } as ViewStyle,
  floating: {
    shadowColor: "#172321",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 4,
  } as ViewStyle,
};

const monoFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const typography = {
  headlineLg: {
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 32,
    letterSpacing: -0.3,
    color: colors.text,
  } as TextStyle,
  headlineMd: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
    letterSpacing: -0.2,
    color: colors.text,
  } as TextStyle,
  headlineSm: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    color: colors.text,
  } as TextStyle,
  titleMd: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    color: colors.text,
  } as TextStyle,
  titleSm: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  } as TextStyle,
  bodyLg: {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
    color: colors.textSecondary,
  } as TextStyle,
  bodyMd: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    color: colors.textSecondary,
  } as TextStyle,
  bodySm: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
    color: colors.textSecondary,
  } as TextStyle,
  labelLg: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    color: colors.text,
  } as TextStyle,
  labelMd: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: colors.text,
  } as TextStyle,
  labelSm: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    letterSpacing: 0.2,
    color: colors.textSecondary,
  } as TextStyle,
  codeMd: {
    fontFamily: monoFamily,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    letterSpacing: 0.2,
    color: colors.text,
  } as TextStyle,
  codeSm: {
    fontFamily: monoFamily,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    letterSpacing: 0.3,
    color: colors.textMuted,
  } as TextStyle,
  numeric: {
    fontVariant: ["tabular-nums"],
  } as TextStyle,
};
