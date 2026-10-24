import { Platform, type TextStyle, type ViewStyle } from "react-native";

// Visual tokens aligned with apps/mobile/design/trafficsense_mangaluru/DESIGN.md
export const colors = {
  background: "#faf8ff",
  surface: "#ffffff",
  surfaceContainerLow: "#f2f3f9",
  surfaceContainer: "#eceef3",
  surfaceContainerHigh: "#e6e8ed",
  surfaceContainerHighest: "#e1e2e7",
  border: "#e2e7ff",
  outline: "#6f7977",
  outlineVariant: "#bec9c6",
  primary: "#005c55",
  primaryPressed: "#004741",
  onPrimary: "#ffffff",
  primaryFixed: "#a7f0e6",
  onPrimaryFixed: "#00201d",
  onPrimaryFixedVariant: "#00504a",
  secondary: "#712ae2",
  secondaryBorder: "#cbd5e1",
  text: "#191c20",
  textSecondary: "#3f4947",
  textMuted: "#6f7977",
  evidence: "#6616d7",
  evidenceSurface: "#f3edff",
  warning: "#904d00",
  warningAccent: "#fe932c",
  warningSurface: "#fff4e5",
  error: "#ba1a1a",
  errorSurface: "#fff0ed",
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
  card: 14,
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
    shadowColor: "#191c20",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  } as ViewStyle,
  sheet: {
    shadowColor: "#191c20",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  } as ViewStyle,
  floating: {
    shadowColor: "#005c55",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  } as ViewStyle,
};

const monoFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const typography = {
  headlineLg: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: -0.5,
    color: colors.text,
  } as TextStyle,
  headlineMd: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.text,
  } as TextStyle,
  headlineSm: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    letterSpacing: -0.2,
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
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    color: colors.textSecondary,
  } as TextStyle,
  bodySm: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
    color: colors.textSecondary,
  } as TextStyle,
  labelLg: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  } as TextStyle,
  labelMd: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    color: colors.text,
  } as TextStyle,
  labelSm: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    color: colors.textSecondary,
  } as TextStyle,
  codeMd: {
    fontFamily: monoFamily,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
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
};
