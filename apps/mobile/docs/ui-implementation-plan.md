# Mobile UI implementation and verification plan

## Purpose and governing sources

Use this plan to apply the supplied mobile design to the existing Expo app without discarding working features. It is an implementation roadmap and acceptance contract; actual progress, failures, device evidence, and commits belong only in [progress.md](progress.md).

Every task must follow the mandatory [mobile UI implementation rules](ui-implementation-rules.md). The visual source is [the mobile design specification](../design/trafficsense_mangaluru/DESIGN.md) and its adjacent screen exports. Use [Part A](part-a-mobile-device.md) for canonical screen/navigation intent and [Part B](part-b-mobile-logic-integration.md) for backend contracts and parity expectations.

Precedence is: privacy/authorization/truthfulness rules → existing backend and working user flow → this plan → visual reference. Never replace a functioning, server-backed interaction with a static design-only component.

## Scope and boundaries

The mobile app is the commuter client. Its core journey is:

`Home → Report or Plan route → Traffic/details → explicit alternative choice`

Signed-in commuters may also enter Workspace and Journeys. New supporting pages are allowed only for a real, reachable purpose such as detail, consent preview, or recovery; employer/authority dashboards, background tracking, offline queues, push notifications, and new backend schemas are out of scope unless separately approved.

All traffic/evidence/route wording must remain honest: reports are observations, server evidence is not proof of cause, route durations are free-flow estimates where stated, and simulated information remains labelled.

## Work sequence

### Phase 0 — inventory, contracts, and visual baseline

Before changing a screen:

1. Read the mandatory UI rules, the design specification, the current screen code, and the relevant API/client/shared type.
2. List the current actions that already work, their data source, protected/guest rules, refresh path, and error states. These are regression requirements.
3. Define the slice: route(s), components, tokens, API/RPC calls, navigation destinations, and state matrix.
4. Capture the current layout at phone width before material layout work when a device or supported render check is available.

**Exit criteria:** the slice has a written state matrix and test plan; no API/RPC/schema change is assumed without a separate backend task.

### Phase 1 — shared visual foundation and navigation shell

Refine the existing theme and reusable primitives before restyling individual screens.

- Align tokens to the mobile design: pale-lavender canvas, white structured cards, teal primary action, violet evidence/simulation treatment, semantic warning/error/success states, 16px phone gutters, and restrained elevation.
- Provide reusable screen, heading, card, button, status badge/chip, inline error, loading, empty, and retry primitives where repetition would otherwise drift.
- Ensure 48px touch envelopes, visible pressed/disabled states, labels for icon-only controls, text alternatives for colour, and readable type hierarchy.
- Preserve stack headers/back behaviour, safe return paths after sign-in, and private-route clearing on sign-out.

**Exit criteria:** existing screens can use the shared primitives without changing their backend behaviour; navigation has no dead ends; focused layout/token tests and mobile lint/typecheck pass.

### Phase 2 — public entry, authentication, and commuter workspace

Apply the design to the user’s entry and account boundaries.

- **Home:** clear civic purpose, Report, Plan route, Traffic, journeys/workspace access, and an accurate foreground-location/privacy note.
- **Login/register:** loading, validation, invalid-credential, confirmation, configuration, network, and safe return-path states; no role picker grants access.
- **Workspace:** signed-in identity/state, clear sign-out, and links only to reachable commuter actions.

**Backend wiring:** use the existing auth provider and session lifecycle. Do not store a client-selected role or retain private navigation after sign-out.

**Exit criteria:** guest browsing still works; sign-in replaces the auth screen; reload/account switch/sign-out clear or redirect private state; Android Expo Go authentication is exercised when a reachable Supabase instance is available.

### Phase 3 — report flow

Make reporting concise and safe without reducing validation.

- Keep category selection, optional note, submit confirmation, and a clear route to Traffic after a successful persisted report.
- Request foreground location only after the commuter chooses to submit; make denied, unavailable, inaccurate, unauthenticated, rate-limited, duplicate/rejected, timeout, and server-error outcomes explicit.
- Keep the report form focused on observation details. Do not claim that a selected category proves the cause or that a single report is verified.

**Backend wiring:** use the existing authenticated report contract and server response. Preserve server-derived evidence/reason and refresh Traffic after success; never fabricate a successful report locally.

**Exit criteria:** focused request/error tests cover the changed states; a real device path covers permission decision, authenticated submit, and subsequent Traffic refresh when the local LAN backend is available.

### Phase 4 — traffic map, list, and incident details

Use the map as a complement to an accessible traffic list, not as the only source of information.

- Keep the Map/List switch, refresh action, selected incident detail, evidence badge, freshness/provenance, and explicit last-good-data warning after a failed refresh.
- Match the design’s map overlays: teal recommended route, violet chosen alternative, red incident pins, green/orange simulated segment states, and a blue opt-in location indicator where supported.
- Keep attribution visible. Preserve the schematic/list fallback for blocked style/tiles, unavailable WebGL, no incidents, configuration error, and network failure.
- Add a detail screen only if the existing in-screen selection cannot communicate all server-provided fields accessibly; it must be reachable from both map and list and have a safe back path.

**Backend wiring:** use current public incident and traffic-segment clients; validate payloads; retain server evidence/freshness/provenance rather than inferring them from presentation.

**Exit criteria:** map/list/selection/fallback unit tests pass; supported map-browser checks cover normal, fallback, selection, and route overlay output; device testing confirms map interaction, list fallback, and refresh when possible.

### Phase 5 — planner and explicit route choice

Keep routing understandable and conservative.

- Present origin/destination controls, route request/loading/error states, primary route, incident relevance, estimated/free-flow duration, and a clear warning only for server-reported route incidents.
- Do not draw or recommend an alternative until the commuter explicitly chooses it. The choice, selected route, and related incident detail must remain consistent between cards and map.
- Include unavailable/partial-incident-data and no-clear-alternative states. Do not imply a guaranteed saving or safe route.

**Backend wiring:** call the existing route and public incident contracts; use server/contract route relevance, not client proximity guesses, as the decision source.

**Exit criteria:** tests cover primary-only rendering, explicit alternative selection, malformed/unavailable route data, and unrelated incidents; device testing covers one real LAN route response and map/list parity where available.

### Phase 6 — commuter journeys and consent sharing

Keep sharing separate from starting a journey and make its privacy boundary obvious.

- Present journey loading, no-active-journey, start, end, refresh, and failure states.
- Show a consent preview naming the recipient organisation and exact allowlisted summary fields before sharing. State clearly that coordinates, GPS points, route history, and device identity are not shared.
- Provide explicit confirm/cancel and stop-sharing actions, clear busy/error feedback, and refreshed state after each successful action.

**Backend wiring:** use the existing authenticated journey and sharing RPC/client calls. The server remains responsible for ownership, organisation membership, consent, expiry, and revocation.

**Exit criteria:** focused tests cover preview copy, safe protected return paths, failure handling, and no forbidden fields in rendered/client data; device or integration verification covers start → preview → share → stop share → refresh when the backend is reachable.

### Phase 7 — only approved supporting screens

Add a page only when a core flow requires it and its contract already exists. Candidate pages include an incident-detail screen, consent-confirmation screen, or a dedicated recovery/help screen. Each proposal must state:

- the user problem and source module;
- entry route and back/close destination;
- API/RPC/state source and authorization boundary;
- loading, empty, denied, stale, offline, and error treatment;
- focused tests and device checks.

Do not add employee/employer/authority administration, a report history, receipt issuance, background tracking, notifications, offline queueing, or a visual-only settings page without an approved product/API task.

### Phase 8 — end-to-end verification and release gate

Run this phase after a coherent group of screen changes, not after every typography adjustment.

| Area | Required evidence |
| --- | --- |
| Static correctness | Docker mobile typecheck, mobile lint, focused unit tests, and `git diff --check` |
| Contracts | Parsing/error tests; unauthorized, malformed, stale, and server-failure paths for changed requests |
| Map | Existing map-browser normal/fallback/selection checks after map changes; attribution and list fallback remain visible |
| Device | Android Expo Go first: launch, navigation/back, signed-out browsing, sign-in where reachable, location decision, report, Traffic refresh, route choice, and journey sharing/revocation as applicable |
| Layout/accessibility | 360–428px phone widths and tablet width: no clipping/overlap; 48px targets; screen-reader labels/states; colour-independent status text; pressed/disabled/loading feedback |
| Cross-surface regression | Recheck every screen using changed shared tokens, auth state, request helper, map component, or shared data after navigation and refresh |
| Full gate | Run the repository Docker check suite when shared contracts, dependencies, root scripts, or multiple mobile surfaces change |

Record passed, failed, blocked, and deferred evidence in [progress.md](progress.md). Device or provider limitations are not a reason to mark the corresponding acceptance check passed.

## Per-slice planning template

Before starting a UI change, record the following in the implementation task:

```md
### UI slice: <name>

- Routes/components:
- User outcome:
- Existing behaviour to preserve:
- Data/API/RPC and authorization boundary:
- States: loading / empty / denied / stale / offline / error / success:
- Navigation and back behaviour:
- Visual reference and tokens:
- Focused tests:
- Device/browser verification:
- Known dependency or blocker:
```

Use this plan with the UI rules for every design implementation task. Do not use it as a status report.
