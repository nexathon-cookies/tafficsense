---
name: TrafficSense Precision Mobility
colors:
  surface: '#effcf9'
  surface-dim: '#cfddd9'
  surface-bright: '#effcf9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e9f7f3'
  surface-container: '#e3f1ed'
  surface-container-high: '#ddebe7'
  surface-container-highest: '#d8e5e2'
  on-surface: '#121e1c'
  on-surface-variant: '#3e4947'
  inverse-surface: '#273331'
  inverse-on-surface: '#e6f4f0'
  outline: '#6f7977'
  outline-variant: '#bec9c6'
  surface-tint: '#0a6a62'
  primary: '#004c46'
  on-primary: '#ffffff'
  primary-container: '#00665e'
  on-primary-container: '#92e1d6'
  inverse-primary: '#86d5ca'
  secondary: '#516072'
  on-secondary: '#ffffff'
  secondary-container: '#d2e1f7'
  on-secondary-container: '#556477'
  tertiary: '#693600'
  on-tertiary: '#ffffff'
  tertiary-container: '#8b4a00'
  on-tertiary-container: '#ffc89e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a2f1e6'
  primary-fixed-dim: '#86d5ca'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#d4e4fa'
  secondary-fixed-dim: '#b9c8de'
  on-secondary-fixed: '#0d1c2d'
  on-secondary-fixed-variant: '#39485a'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#effcf9'
  on-background: '#121e1c'
  surface-variant: '#d8e5e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.25rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies pure utility, navigational clarity, and understated modern refinement for daily commuters. Merging the intuitive spatial wayfinding of modern mapping platforms with the disciplined restraint of native iOS and Android design languages, the aesthetic prioritizes glanceability, reduced cognitive load, and frictionless interaction under motion.

The visual direction centers on **Minimalist Utility**:
- **Clarity Over Novelty:** Elimination of decorative gradients, heavy skeuomorphic effects, and visual noise in favor of stark contrast and spatial breathing room.
- **Immediate Wayfinding:** Color is reserved strictly for operational state changes, actionable controls, active routes, and traffic density alerts.
- **Ergonomic Precision:** Ergonomics tuned for single-handed usage on the move, establishing generous 44–48px minimum touch bounding boxes with immediate mechanical feedback.

## Colors

The palette is engineered around high daytime legibility, minimal eye fatigue, and unambiguous navigational status.

### Functional Roles & Hierarchy
- **Primary / Brand (`#00665E`):** Represents the canonical active path, primary floating action controls, active mode selectors, and confirmation states.
- **Secondary / Alternate Paths (`#94A3B8`):** Applied to inactive or alternative route polylines, secondary progress indicators, and tertiary metadata tags.
- **Tertiary / Warning (`#D97706`):** Signals moderate traffic delays, upcoming route hazards, and temporary construction alerts.
- **Critical / Danger (`#DC2626`):** Reserved strictly for road closures, severe congestion, and immediate re-routing triggers.
- **Neutral Canvas (`#F8FAF9`):** Soft, desaturated off-white that prevents screen glare during daytime driving while differentiating from overlay sheets.
- **Surface & Floating Cards (`#FFFFFF`):** High-clarity pure white reserved for bottom sheets, turn-by-turn instruction banners, and floating control clusters.
- **Text Layers:** Near Black (`#172321`) for immediate scanning of street names and distances; Muted Slate (`#77817F`) for secondary contextual metrics (ETA deltas, sub-labels).
- **Subtle Structural Border (`#E5EAE8`):** 1px boundary layer ensuring card separation against both map terrain and neutral backdrops without adding visual bulk.

## Typography

The typographic hierarchy uses **Inter** throughout all tiers to guarantee cross-platform parity across mobile devices and automotive displays. 

- **Display Numbers & ETAs:** Use `headline-xl` and `headline-lg` with semi-bold weights (`600`) for time-to-destination and immediate distance readings, allowing zero-friction scanning at an arm's distance.
- **Maneuver & Road Typography:** Street names and exit directives default to `headline-md` and `headline-sm`.
- **Tabular Figures:** All dynamic counter variables (speedometers, countdowns, ETAs) must enable monospace tabular figures (`font-variant-numeric: tabular-nums`) to prevent jitter during movement.
- **Labels & Micro-data:** `label-sm` utilizes subtle tracking expansion (`0.04em`) to maintain legibility when rendered in muted shades or inside badge components.

## Layout & Spacing

The layout operates on an **8-pixel grid rhythm** (with 4px sub-increments for compact inline micro-spacing).

### Viewport Adaptation & Breakpoints
- **Mobile Handheld (320px – 599px):** Layout relies on an edge-to-edge interactive map canvas overlaid with contextual fixed-anchor modules. Floating action buttons (FABs), search triggers, and bottom interaction sheets use 16px screen margin bounds (`margin-mobile`), ensuring safe area compliance (iOS Home Indicator and Android 3-button/gesture bars).
- **Tablet & In-Dash / Landscape (600px – 1024px+):** The full-screen bottom sheet reflows into a persistent left-aligned floating side rail (width: 380px), keeping central and right-hand sightlines clear for route geometry and upcoming junction visualizers.

### Ergonomics
All interactive controls must occupy an intrinsic or padded hit target of at least 44×44px (ideally 48×48px for primary driving toggles). Stacking gaps between discrete floating interface items maintain a strict `space-md` (16px) separation to eliminate mis-taps.

## Elevation & Depth

Visual separation relies on physical floating layers, crisp 1px borders, and shallow, diffuse ambient shadows. Heavy cast shadows are prohibited to preserve a clean, native UI feel.

- **Level 0 (Base Canvas):** Vector vector map tiles and terrain geometries. Flat, non-elevated.
- **Level 1 (Subtle Inset / Grouped Rows):** Inset containers and list backgrounds within active sheets. Rendered using `#F8FAF9` with no drop shadow, separated by `#E5EAE8` hairline dividers.
- **Level 2 (Persistent Navigation Headers / Bottom Sheets):** Fixed top instruction banners and resting bottom sheets. Background: `#FFFFFF`. Boundary: 1px solid `#E5EAE8`. Elevation shadow: `0px 4px 20px -2px rgba(23, 35, 33, 0.06), 0px 1px 3px 0px rgba(23, 35, 33, 0.04)`.
- **Level 3 (Floating Action Clusters & Modals):** Recenter buttons, search floating bars, layer selectors, and turn prompt modals. Background: `#FFFFFF`. Boundary: 1px solid `#E5EAE8`. Elevation shadow: `0px 8px 24px -4px rgba(23, 35, 33, 0.10), 0px 2px 6px -1px rgba(23, 35, 33, 0.04)`.

## Shapes

The geometric signature uses comfortable, modern radii that feel natural alongside native mobile system UI:

- **Standard Containers & Sheets:** Default to 16px corner radius (`rounded-lg`), delivering a soft yet disciplined enclosure for bottom sheets and turn cards.
- **Top Sheets & In-Route Guidance Banners:** Styled with 16px to 20px bottom-only radii (`rounded-b-2xl`) when docked to the top edge.
- **Floating Controls & Micro Chips:** Circular FABs maintain a full 50% pill profile (`rounded-full`), while status chips and actionable quick filters use standard 12px to 16px corners to preserve cohesion.
- **Input Fields & Modal Dialogs:** Uniform 12px to 16px corner styling, matching system input fields without feeling overly bulbous.

## Components

### Buttons & Floating Controls
- **Primary Action (Start Route, Confirm):** Filled `#00665E`, text `#FFFFFF`, height 48px, minimum width 120px. Font `label-lg`. Pressed state applies an overlay of `rgba(0, 0, 0, 0.1)`. No gradient.
- **Secondary Action (Overview, Avoid Tolls):** Surface `#FFFFFF`, border 1px solid `#E5EAE8`, text `#172321`. Pressed state shifts background to `#F8FAF9`.
- **Map Utility FABs (Recenter, Audio, Layers):** 48×48px square with 50% border radius (`rounded-full`). Background `#FFFFFF`, 1px solid `#E5EAE8`, Level 3 elevation. Icon centered at 22px in `#172321`.

### Turn-by-Turn Guidance Cards
- **Structure:** Floating banner docked 8px below the top safe area. Background `#FFFFFF`, border 1px solid `#E5EAE8`, rounded 16px.
- **Left Cluster:** High-contrast direction arrow icon inside a 40×40px container tinted `#00665E` with `#FFFFFF` iconography.
- **Center/Right:** Primary maneuver instruction in `headline-sm` (`#172321`), following street or lane notification in `body-sm` (`#77817F`).

### Commuter Bottom Sheet & Cards
- **Resting & Expanded Modes:** Background `#FFFFFF` with Level 2 elevation. Rounded top corners (20px). Features an accessible central drag handle (36×4px, `#E5EAE8`, rounded full) positioned 8px from sheet top.
- **Route Alternative Cards:** Outlined container with 1px border. Selected route features `#00665E` 2px border with subtle background tint of `rgba(0, 102, 94, 0.04)`. Unselected alternative features `#E5EAE8` border and `#77817F` descriptive text.

### Chips & Route Metrics
- **ETA Badges:** Pill-shaped (`rounded-full`), padding 6px 12px. In standard conditions: background `#F8FAF9`, border 1px solid `#E5EAE8`, text `#00665E` (bold). In delay/traffic conditions: background tinted with warning or danger states (`#D97706` or `#DC2626`).

### Input Fields (Destination Search)
- **Container:** Height 48px, background `#FFFFFF`, border 1px solid `#E5EAE8`, corner radius 12px.
- **Content:** Leading search icon in `#77817F`, trailing voice/clear action touch-targets (44px). Typography `body-lg` in `#172321`. Active focus transitions border to 1.5px `#00665E` with zero colored drop-glow.

### Lists & Recent Destinations
- Separators use hairline `#E5EAE8` running edge-to-edge or inset by 16px.
- Touch states produce an immediate `#F8FAF9` fill. Each row supports a minimum height of 52px to ensure accurate thumb-reach.