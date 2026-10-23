# Implementation Plan: Premium UI (Plan 2) for TrafficSense Mobile

> Target: `apps/mobile` only  
> Reference Guidelines: `apps/mobile/docs/IMPLEMENTATION_INSTRUCTIONS_premium_ui.md`  
> Visual Specs: `apps/mobile/design/plan2/DESIGN.md`  
> Boundary Rule: **Strictly UI and styling only. Absolutely zero login, auth, API, data model, routing logic, or backend changes.**

---

## 1. Confirmed Decisions (D1 – D8)

| ID | Topic | Selected Decision | Rationale |
|---|---|---|---|
| **D1** | Primary Teal | `#00665E` | Matches premium spec cleanly; high contrast on white/neutral surfaces. |
| **D2** | Canvas Color | `#F8FAF9` | Crisp neutral mint canvas replacing pale lavender `#FAF8FF`. |
| **D3** | Evidence Violet | Retain `#6616D7` (`#F3EDFF` surface) | Strictly reserved for L0–L3 verification badges & simulation indicators to safeguard truthfulness rules. Slate (`#94A3B8`) used for secondary routes. |
| **D4** | Font Family | System font | No extra CDN/native font dependencies; avoids bundle bloat. |
| **D5** | Min Label Size | 12px minimum | Enforces readability guardrail (prohibits illegible 11px micro-text). |
| **D6** | Nav Tab Labels | **Explore**, **Traffic**, **Report**, **Plan**, **Me** | Updates visual labels and `accessibilityLabel` while leaving route paths intact (`/`, `/traffic`, `/report`, `/planner`, `/workspace`). |
| **D7** | Center FAB Icon | `warning` triangle | Represents immediate road hazard reporting rather than generic item creation. |
| **D8** | Header Wordmark | Text wordmark (`headlineSm`) | Clean, accessible typography without unbundled image assets. |

---

## 2. Pre-Existing Codebase Blocker Notice

Before running full `just mobile-typecheck`, please note:
`app/authority.tsx` and `src/lib/authority.ts` currently reference `AuthorityHistoryItem` and `useAuth().role` which were reverted in commit `0b81818` on `main`. To ensure clean typechecks during mobile UI slices, `authority.tsx` should either be fixed or excluded from non-authority builds without altering commuter auth flows.

---

## 3. Slice-by-Slice Implementation Plan

### Phase 1: Tokens and UI Primitives
- **Target Files:**
  - `apps/mobile/src/theme/tokens.ts`
  - `apps/mobile/src/components/ui/Button.tsx`
  - `apps/mobile/src/components/ui/Card.tsx`
  - `apps/mobile/src/components/ui/Badge.tsx`
  - `apps/mobile/src/components/ui/FormField.tsx`
  - `apps/mobile/src/components/ui/BottomNav.tsx`
  - `apps/mobile/src/components/ui/AppHeader.tsx`
- **Actions:**
  - Update color tokens (`primary: #00665E`, `background: #F8FAF9`, `border: #E5EAE8`, `text: #172321`, `textMuted: #77817F`).
  - Update typography scale (12px min, Inter-equivalent weights, `fontVariant: ["tabular-nums"]`).
  - Upgrade cards to 16px radius, crisp 1px border, Level 2 soft shadow.
  - Update `BottomNav.tsx` tabs to Explore, Traffic, Report, Plan, Me; center FAB with warning icon and white ring.
- **Verification:**
  - Component unit inspection, zero logic changes.

### Phase 2: Explore Screen (`app/index.tsx`)
- **Actions:**
  - Retain live greeting ("Good morning, Commuter") and real live status badges (`SIMULATED FLOW` / `LIVE`).
  - Restyle Commute summary card with segmented flow bar and "Plan my route" action.
  - Quick action tiles: Equal height 2-column grid for Saved Places and Active Incidents (real counts only; transit/cameras dropped).
  - Corridor Feed: Modernize incident rows with prominent L0–L3 evidence chips, category badges, and relative timestamps.
  - Retain 30s polling, `useFocusEffect`, and "Still there?" / "Cleared" confirmations intact.
- **Verification:**
  - Screen rendering at 375px/390px, no clipped text, touch targets >= 48px.

### Phase 3: Traffic Screen (`app/traffic.tsx` & `traffic-map.tsx`)
- **Actions:**
  - Restyle category filter chips ("All Incidents", "Accidents", "Road Hazards").
  - Floating map action buttons (re-center, layers, fullscreen): Restyle with Level 3 floating shadow, 48×48px minimum touch target.
  - Bottom sheet: Refine with 36×4px drag handle, `#E5EAE8` border, real sync timestamps, and active alert cards.
  - Maintain Leaflet/MapLibre privacy gate and schematic fallback without modifying map loading logic.
- **Verification:**
  - Bottom sheet drag and dismissal; fallback toggle; no layout overflow.

### Phase 4: Route Planner (`app/planner.tsx`)
- **Actions:**
  - Origin / Destination card: 2-row card with leading accent dot, swap control, and clean landmark picker modal.
  - Suggested route cards: Highlight primary route with 2px `#00665E` border, 4% teal background tint, and "Recommended" tag; alternative route with 1px `#E5EAE8` border and slate `#94A3B8` accents.
  - Tabular numerics applied to travel durations and distances.
  - Preserve detour warnings, bus corridor toggle, and explicit alternative selection.
- **Verification:**
  - Route card selection state; modal responsiveness.

### Phase 5: Hazard Report Screen (`app/report.tsx`)
- **Actions:**
  - Step indicator: Retain "Step X of 3" (truthful to app flow).
  - Category selector: Clean 2-column grid with equal-height cards (min 56px height, 48px touch envelope) mapping directly to the backend enum (`accident`, `heavy_traffic`, `road_closed`, `road_repair`, `flood`, `police_restriction`).
  - Location verification card: Styled GPS fix pill, accuracy meter, and location refinement button.
  - Photo attachment & note box: Modernized card with clear permission guidance.
  - Preserve draft saving, sign-in persistence, and manual-only submission logic.
- **Verification:**
  - Step transitions, category selection, keyboard avoidance.

### Phase 6: Workspace & Journeys (`app/workspace.tsx`, `app/journeys.tsx`)
- **Actions:**
  - Profile header: Modern user card with commuter avatar and verified role tag.
  - Privacy & consent controls: Prominent destructive card for "Stop sharing / Revoke journey access" with clear 48px action button.
  - Restyle active journeys list with card borders, tabular timestamps, and clean badges.
- **Verification:**
  - Visual hierarchy, destructive action safety, no feature additions.

---

## 4. Acceptance Criteria & Guardrails
1. **Zero Logic/Auth Alterations:** `git diff -- apps/mobile/src/lib apps/mobile/src/providers` must be completely clean.
2. **True Civic State:** Evidence labels (L0–L3) and simulation markers must remain clearly visible and colored in violet `#6616D7`.
3. **Responsive Geometry:** Tested across 375px (iPhone SE), 390px (standard phone), and tablet widths without horizontal clipping or hidden bottom actions.
4. **Touch Target Standard:** Every interactive button, chip, tab, and dismiss handle strictly enforces minimum 48×48px.
