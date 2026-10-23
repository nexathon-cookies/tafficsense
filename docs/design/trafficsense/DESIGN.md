---
name: TrafficSense Mangaluru
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3e4947'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#6616d7'
  on-tertiary: '#ffffff'
  tertiary-container: '#7f3ef0'
  on-tertiary-container: '#f1e6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#eaddff'
  tertiary-fixed-dim: '#d2bbff'
  on-tertiary-fixed: '#25005a'
  on-tertiary-fixed-variant: '#5a00c6'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  body-sm-medium:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 2rem
  margin: 1rem
  margin-md: 2rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an evidence-first civic technology platform dedicated to verifiable urban mobility telemetry, public transparency, and privacy-preserving delay certificates for Mangaluru, India.

### Brand Personality & Demeanor
- **Evidential & Trustworthy:** Interfaces reflect institutional integrity and legal-grade accountability. Information is presented as substantiated data points rather than subjective estimates.
- **Calm & Unhurried:** Designed for critical commuter disputes, transit auditing, and civic verification. Free of gamification, loud micro-animations, or urgent marketing patterns.
- **Privacy-Preserving:** The UI highlights cryptographic verifiability, client-side anonymization, and purposeful omission of non-consensual personal surveillance (e.g., explicit "Photo not collected" tags).

### Visual Direction: Civic Utility & Precision
A synthesis of modern Scandinavian civic utility and high-density technical interfaces:
- **Base Canvas:** Clinical, cool paper tones (#F7F8FA) paired with structural white containers.
- **Structural Integrity:** Precision 1px dividers, disciplined typographic hierarchy, and data-dense tabular receipts.
- **State Semantics:** Strict adherence to redundant state signaling where chromatic cues (Teal, Amber, Crimson, Royal Blue, Violet) are paired with dedicated icon glyphs and textual tokens to satisfy accessibility and legibility under direct sunlight.

## Colors

The palette is tuned for high daylight legibility, formal audit presentation, and instant visual comprehension of traffic and cryptographic verification states.

### Palette Architecture
- **Primary / Brand (`#0F766E` - Deep Teal):** Denotes authenticated evidence, active system tracking, positive confirmation, and primary call-to-action surfaces. Interactive hover state defaults to `#115E59`.
- **Secondary / Warning (`#D97706` - Amber):** Indicates elevated congestion, pending evidence consensus, or transitional telemetry bottlenecks.
- **Danger & Blocked (`#DC2626` - Crimson Red):** Identifies severe delays, gridlock, road closures, or revoked cryptographic certificates.
- **Informational (`#2563EB` - Royal Blue):** Reserved for statutory disclaimers, transit notices, and metadata references.
- **Simulation / Sandbox (`#7C3AED` - Violet):** Distinguishes synthetic telemetry runs and simulated route testing from real-world Mangaluru civic telemetry.
- **Neutrals & Surface Foundation:**
  - Background Canvas: `#F7F8FA`
  - Cards & Sheet Containers: `#FFFFFF`
  - High-Contrast Ink (Primary): `#0F172A` (Slate-900)
  - Secondary / Demarcated Text: `#64748B` (Slate-500)
  - Surface Dividers & Architectural Borders: `#E2E8F0` (Slate-200)

### Color Application Rules
- **No Color-Alone States:** Chromatic feedback must be paired with icon identifiers and semantic labels (e.g., Crimson status must include an alert/block icon and the explicit string "Road Closed").
- **Tonal Contrast:** Data tags and evidence chips utilize an 8% to 12% tint of their respective base hue for backgrounds, bordered with a 25% tint, maintaining dark primary ink (`#0F172A`) or primary base tone for WCAG AAA text compliance.

## Typography

Typography prioritizes auditability, bureaucratic legibility, and technical precision.

### Typographic Hierarchy
- **Display & Section Headers (Plus Jakarta Sans):** Geometric yet humanist letterforms ground institutional reports, section titles, and delay metric outputs with authoritative weight.
- **Content & UI Controls (Inter):** High x-height, neutral grotesque for maximum legibility across complex operational tables, transit alerts, and consent dialogs.
- **Receipts, Proof Hashes, & Telemetry (JetBrains Mono):** Monospaced typography reserved exclusively for unalterable records: Cryptographic Hashes, Verification Tokens, Delay Receipt IDs, Geographic Coordinates, and Proof Levels (e.g., `L4-SPD-CONF`).

### Usage Rules
- Numerical readings in receipts and tables must enforce tabular figures (`font-variant-numeric: tabular-nums`) to ensure vertical column alignment across changing values.
- Monospace labels must not be stylized with decorative italics or variable letter-spacing that could degrade string readability.

## Layout & Spacing

The platform leverages a structured fluid grid system structured for data clarity, desktop verification dashboards, and mobile responsive field access.

### Grid & Breakpoints
- **Mobile (`< 640px`):** 4-column layout. Margin `1rem` (`16px`), gutter `1rem` (`16px`). Linear flow prioritizing verified state cards and receipt summaries.
- **Tablet (`640px - 1024px`):** 8-column layout. Margin `2rem` (`32px`), gutter `1.5rem` (`24px`). Split layout for dual verification feed and receipt generator.
- **Desktop (`> 1024px`):** 12-column layout capped at an absolute max-width of `1280px`. Margin `3rem` (`48px`), gutter `2rem` (`32px`). Multi-pane interface supporting map telemetry, proof streams, and cryptographic inspector panels.

### Spacing Principles
- **Predictable Increment:** All inter-element padding and margins adhere to an 8px base rhythm with 4px sub-increments for compact telemetry tags.
- **Form Factor Guardrails:** Minimum touch target height for mobile and desktop controls is fixed at `44px` to eliminate interaction friction for commuters on the move.

## Elevation & Depth

Visual hierarchy uses physical sheet boundaries and soft atmospheric diffusion rather than arbitrary theatrical drop shadows.

### Elevation Levels
- **Canvas Base (`z-0`):** `#F7F8FA`. Serves as the structural substrate.
- **Surface Level 1 (`z-1`, Standard Containers & Cards):** Flat `#FFFFFF` bound by a crisp 1px stroke of `#E2E8F0`. Shadow is subtle and diffuse: `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Surface Level 2 (`z-2`, Interactive Cards, Active Receipts, Dropdowns):** Elevated for focused attention: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Surface Level 3 (`z-3`, Modals, Verification Sheets, Toast Notifications):** Floating over a translucent backdrop overlay (`rgba(15, 23, 42, 0.4)`): `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)`.

### Border Discipline
Every elevated surface retains its 1px border (`#E2E8F0`) even when shadowed, ensuring distinct separation under extreme sunlight or high-contrast display profiles.

## Shapes

The design uses balanced, modern geometric radii that maintain institutional authority while remaining approachable.

### Radius Distribution
- **Small Controls & Chips:** `6px` for compact proof pills, monospace hashes, and nested data pills.
- **Interactive Elements (Buttons, Inputs, Selectors):** `8px` (`rounded-lg`) to balance clickability with visual discipline.
- **Structural Containers (Cards, Modals, Panels):** `12px` (`rounded-xl`) defining card outlines.
- **Status Pills & Telemetry Badges:** Fully circular/capsule bounds (`9999px`) to immediately denote non-clickable state markers.

## Components

### Buttons
- **Primary:** Background `#0F766E`, text `#FFFFFF`, border none, radius `8px`, min height `44px`, horizontal padding `1.25rem`. Hover `#115E59`, focus ring 2px `#0F766E` with 2px offset.
- **Secondary / Outline:** Background `#FFFFFF`, text `#0F766E`, border 1px `#0F766E`, radius `8px`. Hover background `#F0FDFA`.
- **Destructive:** Background `#DC2626`, text `#FFFFFF`, hover `#B91C1C`.
- **Ghost:** Text `#64748B`, hover text `#0F172A`, hover background `#E2E8F0`/50.

### Input Fields & Selectors
- Standard text, coordinate, and date inputs: Height `44px`, border 1px `#E2E8F0`, surface `#FFFFFF`, text `#0F172A`, radius `8px`, padding `0 0.875rem`.
- Focus state: Border `#0F766E` with a 1px halo (`box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15)`).
- Error state: Border `#DC2626` with red error text and leading alert icon.

### Evidence Level Chips (Proof Standard System)
Systematic categorization of corroboration levels. Displayed using capsule pills, monospace label, and icon:
- **L1 (Reported):** Slate `#64748B` on `#F1F5F9`.
- **L2 (Location Supported):** Blue `#2563EB` on `#EFF6FF`.
- **L3 (Multiple Sources):** Teal `#0F766E` on `#CCFBF1`.
- **L4 (Speed Confirms Congestion):** Amber `#D97706` on `#FEF3C7`.
- **L5 (Photo Verification):** Explicitly flagged as "Photo: Not collected (Privacy preserved)". Neutral stroke, muted text `#64748B`, padlock icon.
- **L6 (Authority Confirmed):** Deep Teal `#0F766E` background with white text and verified civic checkmark.

### Traffic State Badges
Always pair semantic iconography with authoritative text:
- **Normal:** Check circle icon + "Normal Flow" (Emerald/Teal hue).
- **Moderate:** Clock/Gauge icon + "Moderate Delay" (Amber hue).
- **Heavy:** Warning triangle icon + "Heavy Congestion" (Amber/Orange hue).
- **Severe:** Alert octagon icon + "Severe Gridlock" (Crimson hue).
- **Road Closed:** Prohibited barrier icon + "Road Closed / Impassable" (Crimson background, white text).

### Delay Receipt Card (Monospace Proof Block)
- **Container:** Pure `#FFFFFF` card with top security-pattern accent bar (`4px` height in Deep Teal or Violet if simulated).
- **Header:** Mangaluru ward name, timestamp in ISO-8601, and verification hash in `JetBrains Mono` (`code-sm`).
- **Telemetry Grid:** Key-value pairs displayed with `#64748B` labels and tabular-aligned values.
- **Privacy Assurance Tag:** Integrated footer pill declaring zero personal-identifying data retention.

### Simulated Tag
- Outline pill with border 1px `#7C3AED`, background `rgba(124, 58, 237, 0.08)`, text `#7C3AED`, typography `code-sm`. Must precede all synthetic records.