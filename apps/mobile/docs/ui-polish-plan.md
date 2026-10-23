# Mobile UI Polish Plan

> Written: 22 Oct 2026
> Status: Proposed — implementation has not started
> Scope: Expo mobile client only (`apps/mobile`). No API, Supabase, RLS, web, or privacy-contract changes.

## Outcome

Make the Expo app quicker to navigate, easier to read on a phone, and visually calmer without weakening the existing commuter loop:

**REPORT → VERIFY → ALERT → ANALYSE**

The desired result is not a cosmetic redesign. Each screen should have one obvious primary action, a consistent hierarchy, accessible text and controls, intentional loading/error/empty states, and no content hidden by the fixed navigation.

## Current evidence and constraints

The current implementation already has a shared token file, reusable UI primitives, an Expo Router shell, API-backed traffic/report/planner flows, and a fixed `BottomNav`. Preserve those working flows and truthful data labels.

The following code observations motivate this work; they are hypotheses to confirm with device profiling before changing behaviour:

| Area | Observation | User impact to verify |
| --- | --- | --- |
| Refresh work | Home and Traffic fetch on focus and every 30 seconds. Traffic replaces the whole data object on every successful poll. | Avoid unnecessary list/map updates and battery/network work. |
| Navigation | Bottom navigation uses `router.replace()` for top-level destinations. | Test whether screen teardown/recreation, rather than the route call itself, is causing the perceived delay. |
| Map | The Leaflet WebView loads OpenStreetMap raster tiles without WebGL and identifies the app in tile requests. | Map tiles reveal the approximate area viewed and network IP; keep attribution visible, avoid bulk/offline requests, and retain a schematic fallback. |
| Typography | Several shared styles are 10–12 px, and BottomNav overrides its label to 11 px. | Improve legibility at normal phone distance without clipping controls. |
| Layout | The bottom navigation is absolute while individual screens reserve their own bottom space. | Standardise safe-bottom spacing so controls never disappear behind it. |
| Rendering | Repeated incident rows, custom `View`-based icons, and large screen components can cause extra layout work. | Optimise only after render/profile evidence identifies a hot path. |

### Non-negotiable constraints

- Keep live, reported, simulated, stale, estimated, and unavailable states visibly distinct.
- Location stays foreground-only and opt-in. Do not add background tracking, analytics SDKs, or silent network work.
- Keep the map privacy gate and its usable list/fallback state.
- Preserve existing API shapes, authorisation, report submission protection, and explicit alternative-route choice.
- Use existing Expo/React Native dependencies first. A dependency addition needs a concrete measured benefit and Docker-based verification.

## Success measures

Capture a baseline on one lower/mid-range Android phone and one iPhone or iOS simulator before Phase 1, then repeat it after every performance phase.

| Measure | Baseline | Target / guardrail | How to record it |
| --- | --- | --- | --- |
| Cold launch to usable Home | Record seconds | Improve or do not regress | Screen recording with timestamp / Expo performance tools |
| Top-level navigation response | Record Home → Traffic, Traffic → Planner | No visibly blank transition; no regression | Device recording |
| Traffic refresh | Record idle refresh and manual refresh | Unchanged data must not visibly re-render or reset selection | Device test plus targeted unit test for equality logic |
| List scrolling | Record on representative incident data | No sustained visible jank | Expo/React Native performance monitor on device |
| Map first-load and return | Record separately | Do not trade faster return for memory/privacy regression | Device recording and memory observation if available |
| Text and touch targets | Inspect 375 px and 390 px phones; tablet width | Body text readable; all primary controls at least 48 × 48 px | Device/simulator visual and accessibility inspection |

Do not invent a numerical frame-rate, startup, or accessibility claim if the device tooling cannot measure it. Record the observed device, OS, network condition, route, and limitation in `apps/mobile/docs/progress.md`.

## Work sequence

Each phase is one bounded change set and one scoped local commit only after its acceptance checks pass. Phase 0 is required before optimisation work; phases may stop after any verified improvement if the remaining work is not justified by evidence.

### Phase 0 — Baseline, screen inventory, and regression guardrails

**Purpose:** turn “slow” and “dumped” into reproducible observations before changing code.

1. Inventory each route: purpose, data source, primary action, loading/refreshing/empty/error/denied states, and bottom-navigation overlap risk.
2. Test Home, Traffic (map and list), Planner, Report, Workspace, Journeys, Login, and Register at 375 px, 390 px, and tablet width.
3. Record baseline launch, navigation, refresh, scrolling, map, keyboard, and readability observations in mobile progress; attach a short screen recording if the user can provide one.
4. Add focused tests only where an upcoming refactor needs a behaviour guard (for example, stable incident comparison or preserved selected incident).

**Exit criteria:** observed baseline and route/state inventory are recorded; no product behaviour changes are made.

### Phase 1 — Shared readability and layout foundation

**Purpose:** establish one readable scale and spacing system before polishing individual screens.

1. Extend `src/theme/tokens.ts` with semantic layout values: phone/tablet horizontal gutter, section gap, list/card gap, control gap, and a safe bottom-navigation reservation derived from the navigation component and safe-area inset.
2. Increase small shared text deliberately, starting with body, label, and status/badge styles. Proposed starting values are body small 13/18, body medium 15/22, label small 12–13/16, label medium 13–14/18, and code/status small 12/16. Verify actual clipping before finalising them.
3. Improve secondary and muted text contrast against the pale canvas and white cards. Verify contrast for the actual colour/background pairs; size alone does not establish WCAG conformance.
4. Remove component-level font-size overrides that defeat the shared scale, especially BottomNav labels and all-caps chips. Keep a compact style only when it remains readable and has enough padding.
5. Make every scrolling route reserve the same computed safe bottom space. Replace magic spacer views with the shared layout value.
6. Audit header safe-area treatment on real Android and iOS devices. Fix only confirmed status-bar overlap or excess height; do not assume an inset fallback is universally wrong.
7. Confirm 48 × 48 px touch envelopes for navigation, close/back, map controls, picker rows, and report category cells.

**Exit criteria:** no clipped text or hidden last action on the target widths; readable labels and status pills; all changed routes retain their working empty/error/auth states.

### Phase 2 — Screen hierarchy and visual decluttering

**Purpose:** make the app scan as a sequence of tasks rather than a dense collection of cards.

Apply the shared foundation route by route. Do not merge unrelated feature changes into this phase.

| Route | Planned organisation changes |
| --- | --- |
| Home | Align every section to one gutter; use a consistent section heading → supporting text → content pattern; make the four quick actions equal-height; limit secondary decorative content so the two primary paths remain dominant. |
| Traffic list | Use consistent card padding/minimum structure; clamp non-essential descriptions; keep evidence, freshness, and the primary action visible without relying on colour alone. |
| Traffic map | Bound and scroll the selected-incident sheet within the available viewport; keep close/avoid actions reachable above BottomNav; retain list view as the fallback. |
| Planner | Group origin/destination, route result, warning, and explicit alternative choice into distinct sections with a stable vertical rhythm. Make the picker modal feel intentionally sized and keyboard-safe. |
| Report | Give all category cells equal minimum height; make the currently selected category and the submit step unmistakable; keep permission/sign-in/error guidance close to the action it affects. |
| Workspace/Journeys | Prioritise current sharing/journey state and destructive stop-sharing action; keep privacy disclosure readable but secondary. |
| Login/Register | Use Android as well as iOS keyboard avoidance; ensure validation and submit controls remain visible. |

Use `useWindowDimensions` rather than a one-time `Dimensions.get()` calculation where tile width must react to rotation or split-screen.

**Exit criteria:** screen hierarchy and gutters are consistent, grids do not produce uneven controls, map sheets/modals/keyboard flows remain usable on target devices, and desktop/tablet width does not introduce awkward stretched content.

### Phase 3 — Data rendering and refresh efficiency

**Purpose:** remove avoidable work without hiding data changes or making freshness misleading.

1. Define and test a semantic equality helper for traffic data. It must compare every displayed field that can change, not merely incident IDs. If nothing visible changed, retain the existing state object and selected incident.
2. Keep last successful data while a refresh is pending. Distinguish initial loading, manual refreshing, background refresh failure, and stale data in copy and accessibility state.
3. Extract heavy incident/list card components and memoise them only after their props are stable. Use stable callbacks and keys; prefer `FlatList` if the measured list size/render work makes `ScrollView` unsuitable.
4. Memoise expensive derived presentation data (filtered incidents, labels, map payload) only when profiler evidence shows a benefit. Do not blanket-wrap every component in `useMemo`/`React.memo`.
5. Ensure polling runs only while the route is focused and has no overlapping requests. Cancel or ignore an obsolete response when a newer request supersedes it.
6. Add lightweight, non-deceptive skeletons only for initial loading where the final layout is known. Respect reduced-motion preferences or use a static placeholder when they are unavailable.

**Exit criteria:** unchanged polling does not reset selection or cause obvious list/map flicker; real updates still appear; loading/error/freshness messages remain truthful; targeted equality and refresh tests pass.

### Phase 4 — Navigation, map, and icon decisions based on measurement

**Purpose:** address the potentially expensive surfaces safely rather than assuming a migration solves them.

1. Compare current top-level navigation with Expo Router's recommended tab/screen-preservation pattern. Change route structure only if device evidence shows repeated teardown is the actual source of delay and route/back semantics remain correct.
2. Profile the map separately: explicit first load, map-to-list toggle, leave-and-return, network failure, and low-memory behaviour. Keep the privacy gate in every variant.
3. If remounting is confirmed as the problem, evaluate retaining the map only while the Traffic route stays mounted. Do not use a hidden always-running WebView by default; it can consume memory, network, and battery.
4. Keep custom vector icons unless visual consistency or profile evidence justifies replacement. If evaluating `@expo/vector-icons`, first confirm the Expo SDK-provided package is available in the Docker container, map every existing icon name, test missing-icon fallbacks, and verify baseline/loaded font behaviour on a real device.

**Exit criteria:** any navigation/map/icon change has a before/after device observation, retains privacy and failure behaviour, and produces no console/type errors or missing accessibility labels.

### Phase 5 — Interaction and state polish

**Purpose:** add feedback that makes the finished UI feel responsive without becoming visually noisy.

1. Standardise pressed, focused, disabled, and loading states in shared `Button`, `Card`, `FormField`, and navigation controls. Use short, restrained animations; never make animation the only confirmation.
2. Add input focus treatment with accessible contrast and visible error state.
3. Use a single subtle motion pattern for live updates or section arrival only if it does not mask changed/stale data and it can be disabled for reduced motion.
4. Improve offline/unavailable states using the existing `FeedbackBox`: plain-language cause, retained-data timestamp when applicable, and a clear retry action.
5. Test screen-reader labels, roles, selected/disabled state, and reading order for map controls, tabs, status pills, and destructive sharing actions.

**Exit criteria:** every interactive control provides immediate visible feedback; error/retry and accessibility paths work; no animation is required to understand data or complete a task.

## Verification and commit checklist

Run commands inside Docker, using the repository helpers. The exact minimal set depends on the changed surface:

```sh
just mobile-typecheck
docker compose exec app pnpm lint:mobile
just test
git diff --check
```

For map rendering/interaction changes, also run the configured map-browser check. For every visual phase, use Expo Go or the configured native device workflow and check the affected path plus all routes that share the changed component/state. Test loading, refresh, empty, offline/unreachable, unauthenticated/denied, validation, and error paths as relevant.

Before each commit:

1. Review the scoped diff and preserve unrelated working-tree changes.
2. Record actual device, automated-check, browser/map-check, and limitation evidence in `apps/mobile/docs/progress.md`.
3. Create one scoped local commit. Push only when explicitly requested.

## Suggested commit boundaries

```text
docs(mobile): record UI polish baseline and acceptance measures
fix(mobile): establish readable typography and safe screen spacing
fix(mobile): organise core screen layouts and keyboard handling
perf(mobile): avoid redundant traffic refresh rendering
perf(mobile): optimise measured navigation or map lifecycle bottleneck
polish(mobile): standardise interaction, error, and accessibility feedback
```

## Explicitly out of scope

- New push notifications, offline queues, background location, analytics tracking, or production/EAS rollout.
- Web UI, Supabase migrations/RLS/RPCs, or changes to API contracts.
- Pretending simulated corridor data, free-flow times, or community reports are verified live traffic.
- Replacing working mobile flows with static prototype screens.
