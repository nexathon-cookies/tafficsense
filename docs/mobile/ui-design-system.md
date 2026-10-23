# Mobile UI/UX Design System & Tokens

This document details the visual style system, design tokens, typography, component anatomy, dark mode specifications, and tactile haptic standards for the TrafficSense mobile application.

---

## 1. Color System & Design Tokens

The mobile color tokens mirror the web palette established in `src/app/globals.css`, ensuring seamless multi-platform brand recognition while complying with native mobile contrast guidelines (WCAG AAA for daylight driving).

### 1.1 Color Tokens Matrix

| Token Name | Light Mode Hex | Dark Mode Hex | Usage |
|---|---|---|---|
| `color-primary` | `#005c55` | `#80d5cb` | Primary brand, active route polylines, primary buttons |
| `color-primary-container` | `#0f766e` | `#00504a` | Selected chips, high-emphasis card backgrounds |
| `color-on-primary` | `#ffffff` | `#003733` | Text/icons on primary surfaces |
| `color-surface` | `#faf8ff` | `#111318` | App background, map drawer surface |
| `color-surface-container-low`| `#f2f3ff` | `#191c20` | Secondary card fills, category item cards |
| `color-on-surface` | `#131b2e` | `#e2e2e9` | High-contrast body text, headings |
| `color-on-surface-variant` | `#3e4947` | `#c0c8c6` | Subtitles, helper text, timestamps |
| `color-outline-variant` | `#cbd5e1` | `#404847` | Borders, divider lines, sheet handles |
| `color-success-verified` | `#047857` | `#34d399` | L2/L3 Verified badges, clear traffic corridors |
| `color-warning-amber` | `#b45309` | `#fbbf24` | L1 Unconfirmed badges, moderate slowdowns |
| `color-error-danger` | `#ba1a1a` | `#f87171` | Road closures, accidents, detour alerts |

---

## 2. Typography Scale

Native typography uses system-native typefaces (**San Francisco** on iOS, **Roboto** on Android) paired with **JetBrains Mono** for metric numbers, timestamps, and delay counters:

```typescript
// apps/mobile/src/theme/typography.ts
export const typography = {
  // Headings
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  titleMedium: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  
  // Body text
  bodyLarge: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },

  // Numbers and Metrics (Monospace tabular numbers)
  metricLarge: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 28,
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  metricMedium: {
    fontFamily: 'JetBrainsMono-SemiBold',
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
};
```

---

## 3. Core Component Anatomy

### 3.1 The Adaptive Map Bottom Sheet (`@gorhom/bottom-sheet`)
Instead of obscuring the map with nested screens, the mobile app uses a persistent, gesture-driven bottom sheet with three snap points:
1. **Collapsed (15% height):** Shows quick route summary card, current delay, and floating 1-tap "Report" button. Full map visible.
2. **Half-Open (50% height):** Displays route alternatives comparison, verified incident lists, and turn list preview.
3. **Fully Expanded (90% height):** Deep incident details, full verification ladder (L1–L6), and report submission wizard.

```
┌──────────────────────────────────────┐
│ [══════════════════════════════════] │ <- Sheet Handle (48pt grab target)
│                                      │
│  LADYHILL ➔ AIRPORT         [21 min] │ <- Route Title & Dynamic Travel Time
│  Fastest via KSRTC Bypass   (13.1km) │
│                                      │
│  [★ Recommended]  [⚠️ 1 Live Hazard] │ <- Status Badges
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🚨 Quick Report Incident       │  │ <- 56pt Primary Action Button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 3.2 1-Tap Incident Category Grid
The 17 official categories (matching PDF §2) are displayed in an accessible $3 \times 6$ tile grid:
- Each button has a **minimum size of $72 \times 72\text{pt}$** for easy tapping while mounted on a dashboard phone holder.
- Features large emoji icons (e.g. 💥 Accident, 🚧 Repair, 🌧️ Heavy Rain, 🚦 Signal Failure).
- Single tap immediately grabs a high-accuracy GNSS fix with zero text typing required.

### 3.3 Verification Ladder Pill Component
Every incident displays its exact evidential status using high-visibility pill tags:
- `● L1 Reported`: Yellow pill, warning icon.
- `● L2 GPS Verified`: Emerald outline, location pin icon.
- `● L3 Corroborated`: Solid green, 3-commuters icon.
- `★ L6 Authority Audit`: Royal purple, civic seal icon.

---

## 4. Haptic Feedback Standards (`expo-haptics`)

Haptic sensations provide critical eyes-free confirmation so drivers do not need to look repeatedly at their screens:

| Action | Haptic Type | Implementation |
|---|---|---|
| Map marker tapped | `Light` | `Haptics.impactAsync(ImpactFeedbackStyle.Light)` |
| Category selected | `Medium` | `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` |
| Report successfully saved | `Notification: Success` | `Haptics.notificationAsync(NotificationFeedbackType.Success)` |
| Incident Avoidance Detour Triggered | `Notification: Warning` | `Haptics.notificationAsync(NotificationFeedbackType.Warning)` |
| GPS Accuracy Rejected (>50m) | `Notification: Error` | `Haptics.notificationAsync(NotificationFeedbackType.Error)` |

---

## 5. Accessibility & Ergonomics Standards

1. **Touch Target Size:** No interactive element is smaller than $48 \times 48\text{pt}$ (WCAG 2.5.5). Primary road actions are $\ge 56\text{pt}$.
2. **Daylight Sunlight Mode:** High-contrast mode with bold road strokes ($8\text{pt}$) and solid white card casings with high-contrast outlines (`#131b2e` text on pure `#ffffff` cards).
3. **Screen Readers:** Complete `accessibilityLabel` and `accessibilityHint` tags on all map markers and report buttons (e.g., *"Accident at Jyothi Circle, Level 3 Corroborated by 3 commuters. Double tap to view avoidance detour."*).
4. **Dynamic Type:** Text scales automatically according to the user's iOS / Android system accessibility font size settings without clipping cards.
