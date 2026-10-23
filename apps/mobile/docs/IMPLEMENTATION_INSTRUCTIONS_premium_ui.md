# Implementation instructions: apply the Premium UI to the Expo mobile app

Scope: `apps/mobile` only. Restyle the existing screens to match the premium design (`stitch_trafficsense_premium_ui_redesign`). No behaviour, data, API, routing logic, or backend changes.

Read first: `AGENTS.md`, `ai/ai_agent_root_rules.md`, `apps/mobile/ai/rules.md`, `apps/mobile/docs/ui-implementation-rules.md`, `apps/mobile/docs/ui-polish-plan.md`.

---

## 0. The rule that overrides everything

The premium screens are visual references. Several of them show features that do not exist in the app, and some would break the repo's privacy and truth rules. Implement the look and the layout. Do not implement the features shown in the screenshots.

- Keep every existing function, hook, effect, poll, handler, API call, parser, validation rule, router call (except the bottom-nav label text), auth guard, and consent flow exactly as it is.
- Keep the existing Mangaluru content and data model: the NH 66 / Mangaluru labels, evidence levels L0–L3, `SIMULATED FLOW` / `SIMULATED DATA` badges, freshness chips, and "Still there?" / "Cleared" confirmations. The premium screenshots use Bay Area sample text (I-280, Palo Alto, SF). Do not copy that text into the app.
- If a premium element needs data or a feature the app does not have, leave it out. Do not add a placeholder, a dead button, or a fake value.

Allowed changes: `StyleSheet` values, token values in `src/theme/tokens.ts`, presentational JSX wrappers (`View`, spacing, grouping), and visible copy that changes wording without changing meaning.

Forbidden changes: anything under `src/lib/`, `src/providers/`, `src/map/` logic, `src/components/traffic-map.tsx` and `schematic-map.tsx` logic, the bodies of existing handlers, `useState` / `useEffect` / `useFocusEffect` / `setInterval` code, and the `Supabase` / `api.ts` client code.

---

## 1. Decisions to confirm before coding

These conflict between the premium files and the repo. Pick one per row and record the choice in `docs/progress.md`. The defaults are the recommended choices.

| # | Topic | Premium says | Repo says | Default |
|---|---|---|---|---|
| D1 | Primary teal | `#00665E` (DESIGN.md, Stitch tokens use `#004C46` on-primary) | `#005C55` (`tokens.ts`, `ui-implementation-rules.md`) | Use `#00665E`. Changing one token later is cheap. |
| D2 | Canvas | `#F8FAF9` (DESIGN.md "Neutral Canvas"); Stitch tokens and screenshots use mint `#EFFCF9` | Pale lavender `#FAF8FF` | Use `#F8FAF9`. |
| D3 | Violet | No violet anywhere in the premium design. Alternative routes use slate `#94A3B8`. | Violet `#6616D7` is required for evidence, simulation, and derived or proposed information. | Keep the `evidence` token (`#6616D7`) only for those labels. Use teal/slate everywhere else. Removing it would break the truthfulness rules. |
| D4 | Font | Inter | System font; `expo-font` not installed | Keep the system font unless the team approves adding `expo-font` and `@expo-google-fonts/inter` (dependency addition needs measured benefit per `ui-polish-plan.md`). |
| D5 | Minimum label size | `label-sm` is 11px | Polish plan says do not go below readable sizes; target 12px minimum | Use 12px minimum. Do not use 11px. |
| D6 | Bottom-nav labels | Explore, Traffic, Report, Plan, Me | Home, Map, Report, Plan, Me | Use the premium labels. Routes stay `/`, `/traffic`, `/report`, `/planner`, `/workspace`. Update `accessibilityLabel` to match. |
| D7 | Report FAB icon | Warning triangle | `add` icon | Use `warning` (already in `Icon.tsx`). It is a report action, not a create action. |
| D8 | Logo / wordmark | Image/mark next to "TrafficSense" | No asset in repo | Text wordmark only, using `typography.headlineSm`. Do not copy the screenshot image. |

---

## 2. Design source housekeeping (do first)

1. Copy `stitch_trafficsense_premium_ui_redesign/trafficsense_precision_mobility/DESIGN.md` and each screen's `screen.png` into `apps/mobile/design/trafficsense_precision_mobility/`. Do not copy `code.html` (it loads Tailwind and Google Fonts from CDNs, which the app must not do).
2. Update `apps/mobile/ai/rules.md` and `ui-implementation-rules.md` to name the premium DESIGN.md as the visual baseline, and note the decisions from section 1.
3. Commit this on its own.

---

## 3. Token and primitive slice (commit 1)

Update `src/theme/tokens.ts` only. Keep existing key names so call sites do not change. Add new keys rather than renaming.

| Token | Value |
|---|---|
| `colors.background` | `#F8FAF9` (D2) |
| `colors.surface` | `#FFFFFF` |
| `colors.surfaceContainerLow` | `#F8FAF9` (inset rows, no shadow) |
| `colors.border` | `#E5EAE8` (was lavender) |
| `colors.primary` | `#00665E` (D1) |
| `colors.primaryPressed` | Use overlay `rgba(0,0,0,0.10)` on primary, per premium button spec |
| `colors.text` | `#172321` |
| `colors.textMuted` | `#77817F` |
| `colors.textSecondary` | `#3E4947` (keep for body copy contrast) |
| `colors.secondary` (alt routes) | `#94A3B8` |
| `colors.warning` / `warningAccent` | `#D97706` (moderate delay, upcoming hazard) |
| `colors.error` | `#DC2626` (closure, severe congestion, reroute trigger) |
| `colors.evidence` / `evidenceSurface` | Keep `#6616D7` / `#F3EDFF` for evidence and simulated labels only (D3) |
| `radius.card` | `16` (was 14; spec says 16 for containers and sheets) |
| `radius.control` | `12` |
| `radius.pill` | `9999` |
| `layout.gutterPhone` | `16` |
| `layout.gutterTablet` | `24` |
| `layout.bottomNavHeight` | `64` plus safe-area inset |
| `shadows.card` | Level 2: `shadowOffset {0,4}`, `shadowRadius 20`, `shadowOpacity 0.06`, plus `elevation 2`, with 1px `#E5EAE8` border |
| `shadows.floating` | Level 3: `shadowOffset {0,8}`, `shadowRadius 24`, `shadowOpacity 0.10`, `elevation 4`, with 1px border. Replace the current teal-tinted floating shadow. |

Typography, using Inter-equivalent weights and sizes from the spec, but with the system font (D4) and the 12px minimum (D5):

| Token | Size / line / weight |
|---|---|
| `headlineLg` | 24 / 32 / 600 |
| `headlineMd` | 20 / 28 / 600 |
| `headlineSm` | 18 / 24 / 600 |
| `bodyLg` | 16 / 24 / 400 |
| `bodyMd` | 14 / 20 / 400 |
| `bodySm` | 12 / 16 / 400 |
| `labelLg` | 14 / 20 / 500 |
| `labelMd` | 12 / 16 / 600 |
| `labelSm` | 12 / 16 / 600, tracking `0.02em` (not 11) |

Add `numeric: { fontVariant: ["tabular-nums"] }` and apply it to every ETA, minute count, distance, and count that updates.

Primitives:

- `Button.tsx`: primary = filled `#00665E`, white text, 48px height, min width 120, pressed overlay. Secondary = white, 1px `#E5EAE8` border, `#172321` text, pressed `#F8FAF9`. Keep props and `accessibilityState` as they are.
- `Card.tsx`: 16px radius, 1px `#E5EAE8` border, level-2 shadow. Keep `onPress`, `accessibilityRole`, and `elevated`.
- `Badge.tsx`: pill, padding `6px 12px`. Standard = `#F8FAF9` background, `#E5EAE8` border, `#00665E` bold text. Warning = `#D97706` tint. Danger = `#DC2626` tint. Evidence = violet tint (D3). Always keep the text label; never color alone.
- `FormField.tsx`: 48px height, 12px radius, 1px border, focus border 1.5px `#00665E`, no glow.
- `FeedbackBox.tsx`: keep its props. Restyle only.
- `BottomNav.tsx`: apply the D6 and D7 changes. Center FAB 56px circle, `#00665E` (or the warning-triangle icon on primary, per D7), 1px white ring. Labels use `labelSm` at 12px. Keep all `router` calls, `session` checks, and the `me` login redirect exactly as they are. Only the `accessibilityLabel` text and visible labels change.
- `AppHeader.tsx`: wordmark (D8), avatar on the right. Keep the back-button behaviour exactly.
- `Icon.tsx`: add no new icon names unless a required premium icon is missing from the list. Prefer the existing names (`warning`, `directions_car`, `construction`, `flood`, `traffic`, `shield`, `my_location`, `layers`, `tune`, `search`, `mic` only if an existing voice flow exists).

Acceptance for commit 1: `just mobile-typecheck`, `docker compose exec app pnpm lint:mobile`, `git diff --check`. Open Home, Traffic, Planner, Report, Workspace, and both auth screens in Expo Go. Nothing should clip at 375px or 390px. Every nav tab, the FAB, and the back control must be at least 48×48px.

---

## 4. Route-by-route instructions

Use the premium screenshot as the layout target. Use the repo's real data and states. The premium element on the left is what to aim for. The "Keep / Drop" column says what stays in the app.

### 4.1 Explore → `app/index.tsx` (commit 2)

| Premium element | Implement as | Keep / drop |
|---|---|---|
| Eyebrow "LIVE CORRIDOR RADAR" + "Good morning, Alex" | Keep `Good morning, Commuter` greeting. Use the eyebrow only for real live-status text (for example "LIVE" or the existing freshness timestamp). | Drop the invented "radar" product name. Keep the greeting text exactly as the app has it. |
| "Normal flow" pill | Use the existing traffic-status label from data, if one exists. | Keep `SIMULATED DATA` / `SIMULATED FLOW` pill whenever the data is simulated. |
| Commute card (route name, time, delta vs usual, route bar, Start commute) | Use the existing route/ETA data from the planner or journeys client. Show segmented bar for real flow levels. | Drop "Start commute" unless it calls an existing function. Use the existing "Plan my route" action instead. Drop "3 min faster than usual" unless computed from real data. |
| Mini map with "Clear up to Exit 24" | Use the existing `traffic-map` / `schematic-map` component in read-only mode with a "View map" tap target to `/traffic`. | Drop the fake overlay label. |
| 2×2 tiles: Saved Places, Incidents, Transit Sync, Cameras | Saved Places and Incidents only, and only if the data exists. Incident count comes from the live incident list. | Drop Transit Sync, Cameras, and the "Corridor Dry 61°F" weather card. The app has no data for them. |
| Live Corridor Feed (incident rows, timestamps, evidence chips, impact chips) | Map the existing incident list rows, keeping evidence level, freshness chip, and category label. | Keep L0–L3 wording and freshness text exactly. |
| Bottom nav | Per D6/D7. | — |

Quick actions: keep the existing tiles. Make them equal-height. Use the same primary/secondary styling as the rest of the app.

Keep the 30-second polling and `useFocusEffect` exactly as they are.

### 4.2 Live traffic map → `app/traffic.tsx` + `src/components/traffic-map.tsx` (commit 3)

- Floating search pill: keep it only if it filters existing incidents or corridors. If it does not, do not render it. Do not render an input that does nothing. Use the same visual style as the premium pill.
- Filter chips: "All Incidents" plus the existing category filters. Premium "Speed Cameras" is dropped. "Road Hazards" maps to existing categories.
- Floating map controls (locate, layers, fullscreen): keep only the controls that already have handlers. Keep the existing 48px round style with the level-3 shadow.
- Bottom sheet (`Downtown & Bay Area` header): use the existing area name from the app. Keep the sheet's freshness line ("Real-time sync · 10s ago") only if it reflects the real last-sync time. Keep the existing Refresh button and its handler.
- "Average corridor speed" and "Active bottlenecks" tiles: drop unless the data model has those fields. The traffic payload from `api.ts` is the source of truth.
- Active alert card: keep the card style. Show the real incident from the list. The "Still there?" and "Cleared" confirmations currently live in `app/index.tsx`. Keep them where they are and keep their behaviour and gating exactly as implemented; do not add them to traffic.tsx unless they already exist there.
- Sheet drag handle: 36×4px, `#E5EAE8`, 8px from the top. Keep the existing expand/collapse behaviour and keep its accessibility role.

The map privacy gate and list fallback are unchanged. Do not pre-load the map.

### 4.3 Route planner → `app/planner.tsx` (commit 4)

- Origin / destination card: same two-row card with a leading dot. Keep the existing picker modal and the swap control handler.
- "Leave now" selector: keep only if an existing departure-time control exists. Otherwise drop.
- Mode segmented control (car, transit, bike): keep only modes the planner API returns. The app currently has a "Prefer public bus corridor" switch. Keep that switch. Do not add bike mode.
- Suggested routes list: the recommended route gets a 2px `#00665E` border and a 4% teal tint, with a "Recommended" or "Fastest" badge only when the data says so. The alternative route gets a 1px `#E5EAE8` border and muted slate text. Keep the explicit "Select this" choice (the rules require an explicit alternative choice).
- Route metrics (distance, duration, tolls, toll-free, traffic delta): show only fields the parser provides. `formatDistance` and `formatEstimatedDuration` stay.
- "Start Navigation" button: rename to the action the button actually performs today. The app does not do turn-by-turn navigation. Do not use the label "Start navigation" unless it starts navigation.
- "EV Fast Charger" card: drop.
- "Live telemetry" / "Live" label: use the existing "Checked HH:MM" footer. Do not use the word "Live" unless the data is live.

Keep the `REFRESH` control, `plan.kind` loading and empty states, and the detour recommendation logic exactly as they are.

### 4.4 Report hazard → `app/report.tsx` (commit 5)

This is the highest-risk screen. The submit path, L5 photo analysis, and draft preservation must not change.

- Header: back/close button, title "Report hazard", step indicator. Keep "Step X of 3" (the app has 3 steps, not the premium's 2).
- Category grid (2 columns, equal height, 48px+ cells). Map the premium categories to the backend enum. Do not add enum values.

| Premium label | Backend `ReportCategory` | Notes |
|---|---|---|
| Accident | `accident` | — |
| Traffic Jam | `heavy_traffic` | — |
| Hazard on Road | `road_closed` or `other` | Choose one and label it truthfully. |
| Road Work | `road_repair` | — |
| Flood / Weather | `flood` | Label "Flood / waterlogging" as in shared labels. Drop "Weather / Fog". |
| Police | `police_restriction` exists in shared labels | Keep only if the existing report screen already offers it. Otherwise drop. |

- Location card: keep the map preview and the GPS accuracy indicator, using the real accuracy value from `report-location.ts`. Keep the "Refine" action, which must use the existing location flow. Remove "Auto-detected · Tap to refine" wording unless location is actually auto-detected. Location is foreground-only and explicit (rules).
- Lane / direction / "Heading North" controls: drop. They have no data model.
- Note field: keep the existing description field and its validation. Drop the mic icon unless voice input already exists.
- Photo / attachment area: keep the existing `expo-image-picker` flow. Keep the permission guidance next to it.
- Submit: keep the existing handler and its disabled/loading logic. Do not add the "3 sec auto" countdown or any auto-submit. The app must never auto-submit (rules).
- Footer copy: drop "Verified by real-time community sensors". Use truthful copy that matches the existing review/verification wording.
- Keep the draft preservation through sign-in or permission prompts.

### 4.5 Workspace / Me → `app/workspace.tsx` (commit 6)

- Header: avatar, name, role line from the real session/profile. Drop "Level 4 Contributor", "98% Report Accuracy", and "Trusted reporter" unless the API returns them.
- Stat row (miles tracked, saved reroute time, valid reports): show only values the app actually computes. Drop anything hard-coded.
- Commute velocity chart: drop. No data source.
- Priority corridor card: keep only if a saved corridor exists in the app's data. Show its real name and toggle.
- Delay receipts and reroute savings: drop. The repo marks receipts as a proposed extension and not part of the current scope.
- Sensor telemetry and consent section:
  - Keep only consent controls that exist in the app today.
  - Drop "Background Hazard Sensing", "Anonymous Traffic Contribution", and "Live Audio Alerts". Background tracking is forbidden by the repo rules, and the other two have no implementation.
  - Keep "My journeys & employer sharing" and its revoke/stop-sharing action exactly as implemented. Put the destructive action in its own section with a 48px touch target and a clear label.
- Export CSV: drop.
- Bottom nav: per D6/D7.

### 4.6 Journeys, login, register (commit 6, styling only)

These screens are not in the premium set. Apply the token and primitive changes only:
- Keep the current structure.
- Apply 16px gutters, 16px cards, 12px control corners, and the same button and form field styles.
- Login and register: use `KeyboardAvoidingView` behaviour on both iOS and Android, and keep the validation messages visible above the submit button.

---

## 5. Shared states that must still work

For each restyled screen, confirm these states still render and still say the same thing:

- Loading (initial), refreshing (existing refresh), empty, stale (freshness), offline / unreachable, unauthenticated / denied, validation error, server error.
- Simulated data pill and evidence labels (never drop them).
- Keyboard: inputs stay visible with the keyboard open on Android and iOS.

Skeleton shimmer is optional. Add it only where the layout is known, and respect reduced motion.

---

## 6. Accessibility checks

- Every icon-only control has `accessibilityLabel` and `accessibilityRole`.
- Tabs use `accessibilityRole="tab"` and `accessibilityState.selected`.
- Status pills and evidence badges include their text. Do not rely on colour.
- Map markers and map controls keep their existing labels.
- Touch targets: at least 48×48 for nav, FAB, close/back, map controls, picker rows, and report category cells.
- Test with VoiceOver and TalkBack on one screen per commit.

---

## 7. Process

Slice order and one commit per slice, as the repo requires:

1. Design source housekeeping (section 2)
2. Tokens and primitives, including BottomNav and AppHeader (section 3)
3. Explore (`index.tsx`)
4. Traffic (`traffic.tsx`, `traffic-map.tsx` styling only)
5. Planner (`planner.tsx`)
6. Report (`report.tsx`)
7. Workspace, Journeys, Login, Register

Per slice:

1. Write a short plan in the task: route, data source, states, actions, and test checks.
2. Make the change.
3. Review the diff. Check that no line changed hooks, handlers, API calls, router calls (other than labels), or `src/lib/`. Use:
   `git diff --stat` and `git diff -- apps/mobile/src/lib apps/mobile/src/providers apps/mobile/src/map` (must be empty).
4. Run checks in Docker:
   ```
   just mobile-typecheck
   docker compose exec app pnpm lint:mobile
   just test
   git diff --check
   ```
   Run the map-browser check after any change near `traffic-map.tsx` or `schematic-map.tsx`.
5. Run in Expo Go (`just mobile-up`, or `just mobile-lan <ip>` on a phone). Check the screen at 375px, 390px, and tablet width. Check the states in section 5.
6. Record results, screenshots, device/OS, and any limits in `apps/mobile/docs/progress.md` only.
7. Commit with the verification record. Report the hash. Do not push unless asked.

Limits to state honestly: TypeScript, lint, and bundle checks do not verify native rendering. Say so if Expo Go was not run.

---

## 8. Done when

- Every screen in sections 4.1–4.5 matches the premium layout, using real data.
- No feature listed in section 9 appears in the app.
- The diff contains no logic, data, API, routing, or state changes.
- Typecheck, lint, tests, and `git diff --check` pass.
- Expo Go checks at 375px, 390px, and tablet width are recorded.
- `progress.md` records decisions D1–D8 and every dropped element with its reason.

---

## 9. Do not implement (shown in the premium screenshots, not in the app)

Background hazard sensing; anonymous traffic contribution toggle; live audio alerts; speed cameras; transit sync; EV charger; weather card; delay receipts and reroute-savings ledger; CSV export; "3 sec auto" submit; auto-detected location as a default; lane impact and direction controls; "Step 1 of 2"; "98% report accuracy"; "Level 4 Contributor"; "Miles tracked" and "Commute velocity" charts; "Priority corridor" unless real; "Verified by real-time community sensors"; "Start navigation" unless it navigates; the "Police" and "Weather / Fog" categories unless the backend has them; any hard-coded number, time, or place name from the screenshots.

Reason: several of these would collect background data, make unsupported claims, or show success or verification the server did not produce. The repo rules forbid all three.
