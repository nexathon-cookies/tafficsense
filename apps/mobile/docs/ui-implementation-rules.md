# Mobile UI implementation rules

This is the mandatory implementation contract for AI and developer work on the Expo mobile app only. It does not govern the Next.js web app or its web design reference.

The goal is to improve presentation and complete intentional mobile screens without breaking the working commuter loop: **REPORT → VERIFY → ALERT → ANALYSE**. A visually complete screen is not complete until its real state, server contract, and failure behaviour work together.

## Required references and precedence

Before changing a mobile UI, read this document, the mobile AI rules, and the current screen/component code. Use these sources in order when they disagree:

1. Repository safety, privacy, truthfulness, authorization, and scope rules.
2. The existing server/API contract and current working mobile behaviour. Do not replace a working flow with a static mockup.
3. The mobile UI design source: [mobile design specification](../design/trafficsense_mangaluru/DESIGN.md), its adjacent screen references under [`apps/mobile/design/`](../design/), and the [Part A screen plan](part-a-mobile-device.md).
4. The integration contract in [Part B](part-b-mobile-logic-integration.md), followed by the mobile [implementation and verification plan](ui-implementation-plan.md).

The design files are visual references, not proof of live data, working routes, permissions, or backend behaviour. Preserve their clean civic style, but correct unsupported copy and never introduce a fake success state just to match a screenshot.

## Required workflow

For each mobile UI slice:

1. Identify the affected route(s), existing user flow, backend/API or Supabase contract, and smallest useful acceptance checks.
2. Inspect the current implementation before styling it. Preserve working navigation, refresh behaviour, authorization, state handling, and data labels unless a separate approved task changes them.
3. Write a small implementation plan in the task: screen purpose, data source, states, actions, navigation destinations, and tests. Record actual results only in [progress.md](progress.md).
4. Build or refine reusable mobile tokens/components. A new page is allowed only when it has one clear purpose, a reachable navigation path, a safe back/close destination, and real state or an explicit unavailable state.
5. Wire the screen to the existing backend contract. Validate responses at the client boundary, render server-derived evidence/authorization results, and refresh dependent views after mutations.
6. Verify the changed flow and every mobile screen sharing its state or components. Fix regressions before calling the slice complete.

Do not change Supabase migrations, RLS, RPCs, web behaviour, or API response shapes merely to make a mobile mockup easier. Surface a missing contract and plan that backend work separately.

## Design system to preserve

Use the mobile design source as the visual baseline. Keep the current token implementation aligned with it rather than adding one-off values.

- Pale-lavender canvas (`#FAF8FF` / existing equivalent), white cards and sheets, subtle lavender dividers, dark readable text.
- Deep coastal teal (`#005C55`) for the primary action; pressed state `#004741`; white action text.
- Civic violet (`#6616D7`) only for evidence, simulation, and clearly labelled derived/proposed information.
- Warning, error, and success colours communicate a state but never carry the meaning alone; pair them with a readable label/icon.
- Single-column, thumb-friendly layouts: 16px phone gutters, 24px tablet-width gutters, 12–16px intentional vertical spacing, 14px card corners, 12px control corners, and pill badges.
- Interactive controls need a minimum 48×48px touch envelope with visible pressed, focus, disabled, and loading states.
- Prefer crisp borders, surface contrast, and restrained shadows over heavy visual effects. Keep text legible in daylight and on narrow screens.
- Keep frequent actions and confirmation controls reachable in the lower portion of the screen; keep map status and urgent evidence visible without obscuring controls.

Do not blindly copy the design-export HTML, remote CDN scripts, screenshots, map images, unsupported fonts, or marketing assertions. Use project-supported Expo/React Native components and dependencies.

## Mobile navigation and data rules

- Keep one canonical mobile route for each feature. The baseline journey is Home → Report or Plan route → Traffic/details → explicit alternative choice; authenticated commuters may enter Workspace and Journeys.
- Every child screen has a visible title and working back behaviour. After sign-in, replace the auth route; after sign-out, clear private routes and return to Home.
- Preserve safe draft input when permission or sign-in interrupts a flow. Never auto-submit after returning.
- Do not create a dead-end page, duplicate report/traffic/route flow, placeholder action, or UI-only role selector.
- Treat the server as authoritative for identity, role, membership, evidence level, incident state, route relevance, consent, and delay measurement. Reuse the implemented mobile clients and shared types; do not guess fields or hard-code success.
- Keep live, estimated/free-flow, simulated, reported, corroborated, stale, resolved, and unavailable data distinct in copy and visuals.
- Request location only for an explicit foreground action. Never add background tracking, raw journey-history exposure, privileged keys, or client-side authorization checks as a substitute for server enforcement.

## State, accessibility, and verification

Each data-bearing screen must intentionally cover loading, refreshing, empty, denied/unauthenticated, stale, offline/unreachable, validation, and server-error states as relevant. State text must explain what happened and offer a safe next action.

Use React Native accessibility labels, roles, states, and hints for icon-only controls, map controls/markers, status pills, and destructive/revocation actions. Do not rely on colour, gesture-only interaction, hover, or a map pin alone to convey important information.

Plan verification before implementation and record only observed outcomes in [progress.md](progress.md):

- Add focused tests for changed parsing, state transitions, navigation guards, route relevance, consent/revocation, and error handling.
- Run the mobile typecheck/lint and focused tests through Docker; run the repository check suite when a shared contract, dependency, or broad mobile surface changes.
- Run the supported map-browser check after map rendering/interaction changes.
- Test the affected path in Expo Go or a configured device build; do not claim native verification from a TypeScript, bundle, or browser-only pass.
- Check phone and tablet/narrow widths for clipping, overlays, touch targets, and accessible status text.

A mobile UI slice is ready for review only when it has a reachable route, real or explicitly unavailable data behaviour, relevant states, truthful labels, server-authorized actions, focused tests, and recorded verification/limitations.
