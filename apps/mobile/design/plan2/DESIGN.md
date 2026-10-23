# TrafficSense Premium Design Specification (Plan 2: Precision Mobility)

Baseline derived from `stitch_trafficsense_premium_ui_redesign` and `IMPLEMENTATION_INSTRUCTIONS_premium_ui.md`.

## 1. Core Principles
- **Clarity Over Decoration:** Clean, modern civic presentation with subtle borders and restrained shadows.
- **Truthful Data State:** Live, reported, simulated, stale, and unavailable states are visibly distinguished. Never drop evidence levels (L0–L3) or simulated data badges.
- **Strict Touch Envelopes:** Minimum 48×48px clickable bounding box for all phone interactive controls.
- **System Font Baseline:** System font with Inter-equivalent weight/line heights; minimum font size is 12px (no 11px micro-labels).
- **Tabular Figures:** Applied to all updating numerical counts, ETAs, timestamps, and metric values.

---

## 2. Color Palette

```yaml
canvas:
  background: "#F8FAF9"          # Neutral mint canvas
  surface: "#FFFFFF"             # Cards, sheets, modals
  surfaceContainerLow: "#F8FAF9" # Inset rows, subtle grouped sections
  border: "#E5EAE8"              # Clean crisp borders (replaces lavender)

brand:
  primary: "#00665E"             # Deep coastal teal (Decision D1)
  primaryPressed: "rgba(0,0,0,0.10)" # Pressed state overlay
  onPrimary: "#FFFFFF"
  secondary: "#94A3B8"           # Slate for alternative routes

text:
  text: "#172321"                # Primary text (high contrast dark teal-slate)
  textSecondary: "#3E4947"       # Body copy contrast
  textMuted: "#77817F"           # Secondary labels, captions, timestamps

semantic:
  warning: "#D97706"             # Moderate delay, upcoming hazard
  warningAccent: "#FE932C"
  error: "#DC2626"               # Road closure, severe delay, emergency
  success: "#176D55"

truth_and_evidence:
  evidence: "#6616D7"            # Civic violet strictly reserved for L0-L3 evidence & simulation
  evidenceSurface: "#F3EDFF"     # Tint for evidence badges
```

---

## 3. Typography Scale (System Font, Min 12px)

| Token | Size / Line Height / Weight | Tracking | Usage |
|---|---|---|---|
| `headlineLg` | 24px / 32px / 600 | -0.015em | Top screen titles |
| `headlineMd` | 20px / 28px / 600 | -0.01em | Section headers |
| `headlineSm` | 18px / 24px / 600 | normal | Card titles, modal headers |
| `bodyLg` | 16px / 24px / 400 | normal | Prominent descriptions, route labels |
| `bodyMd` | 14px / 20px / 400 | normal | Default body text |
| `bodySm` | 12px / 16px / 400 | normal | Secondary supporting details |
| `labelLg` | 14px / 20px / 500 | normal | Button text, form labels |
| `labelMd` | 12px / 16px / 600 | normal | Navigation tabs, badge text |
| `labelSm` | 12px / 16px / 600 | 0.02em | Compact chips, uppercase tags |
| `numeric` | fontVariant: tabular-nums | — | ETAs, minutes, distances |

---

## 4. Radii & Spacing

| Token | Value | Target |
|---|---|---|
| `radius.card` | 16px | Containers, cards, bottom sheets |
| `radius.control` | 12px | Form inputs, buttons, picker items |
| `radius.pill` | 9999px | Status badges, category filter chips |
| `layout.gutterPhone` | 16px | Horizontal screen margins on mobile |
| `layout.gutterTablet` | 24px | Margins on tablet displays |
| `layout.bottomNavHeight` | 64px | Plus safe-area inset |

---

## 5. Shadows & Elevation

- **Level 2 (Cards):** `shadowOffset: { width: 0, height: 4 }`, `shadowRadius: 20`, `shadowOpacity: 0.06`, `elevation: 2`, with 1px `#E5EAE8` border.
- **Level 3 (Floating Controls / Modals):** `shadowOffset: { width: 0, height: 8 }`, `shadowRadius: 24`, `shadowOpacity: 0.10`, `elevation: 4`, with 1px `#E5EAE8` border.

---

## 6. Primitives Specification

1. **Button (`Button.tsx`):**
   - Height: 48px, min-width: 120px, radius: 12px.
   - Primary: Filled `#00665E`, `#FFFFFF` text.
   - Secondary: `#FFFFFF` fill, 1px `#E5EAE8` border, `#172321` text.
2. **Card (`Card.tsx`):**
   - 16px radius, `#FFFFFF` fill, 1px `#E5EAE8` border, Level 2 shadow.
3. **Badge (`Badge.tsx`):**
   - Pill radius, padding 6px 12px.
   - Standard: `#F8FAF9` bg, `#E5EAE8` border, `#00665E` text.
   - Evidence: `#F3EDFF` bg, `#6616D7` text.
4. **FormField (`FormField.tsx`):**
   - 48px height, 12px radius, 1px `#E5EAE8` border. Focus border: 1.5px `#00665E`, no glow.
5. **BottomNav (`BottomNav.tsx`):**
   - Labels: Explore, Traffic, Report, Plan, Me (Decision D6).
   - Center FAB: 56px circle, `#00665E`, warning triangle icon (Decision D7), 1px white ring.
