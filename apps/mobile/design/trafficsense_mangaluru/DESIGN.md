---
name: TrafficSense Mangaluru
colors:
  surface: '#f8f9fe'
  surface-dim: '#d8dadf'
  surface-bright: '#f8f9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3f9'
  surface-container: '#eceef3'
  surface-container-high: '#e6e8ed'
  surface-container-highest: '#e1e2e7'
  on-surface: '#191c20'
  on-surface-variant: '#3f4947'
  inverse-surface: '#2e3135'
  inverse-on-surface: '#eff1f6'
  outline: '#6f7977'
  outline-variant: '#bec9c6'
  surface-tint: '#1a6962'
  primary: '#00433d'
  on-primary: '#ffffff'
  primary-container: '#005c55'
  on-primary-container: '#8ad2c8'
  inverse-primary: '#8cd4ca'
  secondary: '#712ae2'
  on-secondary: '#ffffff'
  secondary-container: '#8a4cfc'
  on-secondary-container: '#fffbff'
  tertiary: '#5b2f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#7d4200'
  on-tertiary-container: '#ffb477'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a7f0e6'
  primary-fixed-dim: '#8cd4ca'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77c'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f8f9fe'
  on-background: '#191c20'
  surface-variant: '#e1e2e7'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  title-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
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
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
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
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
---

## Brand & Style

The design system is engineered for utility-first mobile civic transit navigation and community incident reporting in Mangaluru. It balances high-urgency road safety awareness with an overarching sense of calm, precision, and civic trust. Commuting under heavy monsoon downpours, coastal traffic bottlenecks, and sudden road closures demands immediate legibility without inciting driver panic.

The aesthetic blends **Modern Utilitarian Clean** with **Atmospheric Layering**:
- Base canvas surfaces employ an ultra-soft pale lavender tint rather than stark blue-light white to reduce eye strain during bright coastal days and dark rainy nights.
- Information hierarchy favors structured clarity: cards are strictly delineated with crisp borders, evidence tiers are verified through explicit provenance tags, and synthetic or extrapolated traffic data is transparently flagged as simulated.
- Tone is objective, reliable, and civic-minded. Microcopy rejects sensationalism (e.g., avoid "Warning! Disastrous gridlock!"; use "Slow traffic · +12 min delay · Confirmed by 4 drivers").

## Colors

The palette establishes unambiguous contrast for outdoor readability, with semantic states that inform rather than alarm.

### Core Roles
- **Canvas / Background**: `#FAF8FF` (Pale Lavender). Reduces glare, anchors surfaces, and distinguishes the app environment from bare web views.
- **Card & Sheet Surface**: `#FFFFFF` (Crisp White). Used for elevated operational sheets, navigation action bars, and reports.
- **Surface Outline / Divider**: `#E2E7FF`. A calibrated cool tint providing precise structural separation without high-contrast friction.
- **Primary / Brand Action**: `#005C55` (Deep Coastal Teal). Reflects stability and navigation authority. Active/Pressed state steps down to `#004741`. Contrast text is permanently `#FFFFFF`.
- **Secondary / Evidence & Simulation**: `#6616D7` (Civic Violet). Paired with `#F3EDFF` background container. Used for community verification hierarchies, algorithmic projections, and the persistent `SIMULATED` status.
- **Neutral Primary (Typography)**: `#191C1E`.
- **Neutral Secondary (Muted/Subtitles)**: `#42474E`.
- **Neutral Tertiary (Borders/Disabled)**: `#72777F`.

### Status & Feedback Containers
- **Warning / Alert**: `#904D00` text on `#FFF4E5` container.
- **Critical / Hazard / Error**: `#BA1A1A` text on `#FFF0ED` container.
- **Safe / Active / Success**: `#176D55` text on `#E8F5EE` container.

### Map & Geo-Spatial Overlays
- **Recommended Route**: `#005C55` (Teal line with 6dp stroke and soft `#005C5533` outer halo).
- **Alternative Route**: `#6616D7` (Violet line with 4dp stroke).
- **Incident Point / Community Hazard**: `#B91C1C` (Red round pin with 2dp white ring).
- **Segment Congestion (Slowdown)**: `#EA580C` (Vibrant Orange segment).
- **Segment Flow (Clear)**: `#059669` (Green segment).
- **Current User Position**: `#2563EB` (Cobalt blue puck with 16dp pulsing `#2563EB26` accuracy ring).

## Typography

The typographic strategy prioritizes speed-of-comprehension during vehicle stops or rapid glances.

- **Plus Jakarta Sans** renders navigation directions, turn titles, road junctions, and hazard titles. Its geometric structure and clear apertures maintain legibility under motion.
- **Inter** handles multi-line narrative notes, commuter commentary, and incident descriptions. Its neutral, optimized vertical metrics ensure dense incident feeds remain clear.
- **JetBrains Mono** anchors all telemetry: distance metrics (`1.4 km`), time stamps (`14:02:44`), coordinate points (`12.9141° N, 74.8560° E`), and speed estimations (`32 km/h`). This prevents tabular number shifting when live-updating readouts.

## Layout & Spacing

The layout is built for mobile single-thumb ergonomics within a standard 4-column mobile grid system (360dp to 428dp viewport width).

- **Screen Margins**: Uniform `16px` (`margin`) outer horizontal margins on mobile screens, expanding to `24px` on tablet viewports.
- **Content Stacking**: Bottom sheets and hazard lists follow an explicit `12px` or `16px` vertical inter-card gap (`space-md`).
- **One-Handed Utility Zone**: Action buttons, hazard confirmations, and quick-filter chips are anchored in the lower 40% of the screen. Critical map indicators (speed, upcoming turn, simulation alerts) float in the top safe zone.
- **Touch Envelope**: All interactive elements (hazard buttons, report upvotes, dismissal triggers) enforce a strict minimum clickable bounding box of `48px x 48px`, even when visual icons are 20px.

## Elevation & Depth

Visual hierarchy does not use heavy black dropshadows, which create visual muddying on mobile devices outdoors. Depth is expressed through structural card borders, pale background contrast, and soft ambient ambient occlusion.

- **Level 0 (Map / Canvas Base)**: `#FAF8FF` flat canvas.
- **Level 1 (Feed Cards / Route Selector Cards)**: Solid `#FFFFFF` fill, 1px perimeter border of `#E2E7FF`, and a soft ground shadow: `0 2px 8px -2px rgba(25, 28, 30, 0.04)`.
- **Level 2 (Active Drawer / Floating Bottom Sheet)**: Solid `#FFFFFF`, 1px border of `#E2E7FF`, shadow: `0 8px 24px -4px rgba(25, 28, 30, 0.08)`.
- **Level 3 (Modal Alerts / Urgent Hazard Dialogues)**: Solid `#FFFFFF`, 1px border of `#BA1A1A` (for emergency warnings) or `#E2E7FF`, shadow: `0 16px 36px -6px rgba(0, 92, 85, 0.12)`.

## Shapes

The geometric vocabulary balances clean institutional authority with soft modern tactile forms.

- **Cards & Modal Sheets**: Structured with an exact radius of `14px` (`border-radius: 14px;`).
- **Interactive Buttons**: Standard primary and secondary controls use `12px` roundedness (`border-radius: 12px;`).
- **Badges, Tags, & Freshness Indicators**: Strict capsule/pill geometry (`border-radius: 9999px;`).
- **Form Controls & Checkboxes**: Inputs use `10px` inner corner radii; radio buttons and status indicators are fully circular (`50%`).

## Components

### 1. Primary & Secondary Buttons
- **Primary CTA**: Background `#005C55`, text `#FFFFFF`, height `48px`, horizontal padding `20px`, corner radius `12px`. Pressed state: `#004741`. Typography: `label-lg` (Inter 14px Semibold).
- **Secondary / Ghost Button**: Background `transparent`, border `1.5px solid #005C55`, text `#005C55`, height `48px`, corner radius `12px`. Pressed state: `#005C5510`.
- **Quick Hazard Report Floating Button**: Height `56px`, pill shape (`rounded-full`), background `#005C55`, text `#FFFFFF`, icon 24px, label 14px bold. Shadow: `0 6px 16px rgba(0, 92, 85, 0.28)`.

### 2. Evidence Badges & Verification Pills
- **Evidence Tier Badge (e.g., "L3 · Multiple independent reports")**: Pill shape (`rounded-full`), padding `4px 12px`. Fill `#F3EDFF`, text `#6616D7`, typography `code-md` (JetBrains Mono 12px Medium). Left icon: 12px shield or verified-check icon.
- **Freshness Chips**:
  - *Fresh*: Background `#E8F5EE`, text `#176D55`, typography `label-md`. Left indicator: 6px solid green dot. Content: "Last confirmed 4 min ago".
  - *Stale / Unverified*: Background `#FFF4E5`, text `#904D00`, typography `label-md`. Left indicator: 6px solid amber dot. Content: "Possibly stale · Verify".

### 3. SIMULATED Accent Pill
- Displayed whenever traffic flow, time estimates, or congestion are synthesized or predicted rather than sensor/user verified.
- **Token**: Full-pill capsule (`rounded-full`), background `#F3EDFF`, border `1px solid #6616D7`, text `#6616D7`, typography `code-sm` (`JetBrains Mono`, 10px, uppercase, letter-spacing +0.06em).

### 4. Hazard & Incident Cards
- **Container**: White `#FFFFFF`, border `1px solid #E2E7FF`, border radius `14px`, padding `16px`.
- **Header**: Left side carries category icon (waterlogging, pothole, vehicle breakdown) inside a 36px circular tint box (`#FFF0ED` or `#FFF4E5`), accompanied by the road name in `title-md`. The right side hosts the Freshness Chip.
- **Body**: Incident summary in `body-md` (`#42474E`), followed by the Evidence Badge.
- **Footer**: Monospaced timestamp and GPS locality in `code-sm` (`#72777F`), paired with inline "Still there?" thumbs-up / thumbs-down micro-action pills (min-height 36px, `rounded-full`, border `1px solid #E2E7FF`).

### 5. Input Fields & Search Bars
- **Route Search Input**: Height `52px`, background `#FFFFFF`, border `1.5px solid #E2E7FF`, border radius `12px`, padding `0 16px`. Typography: `body-lg`. Focus state: border `1.5px solid #005C55` with no harsh outline glow. Leading search icon `#005C55`, trailing clear button `#72777F`.