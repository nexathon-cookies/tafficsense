# Remaining mobile app tasks

This checklist covers work still required for the mobile client. It is derived from the mobile plan, the repository implementation roadmap, and the current mobile progress record. A task is not complete until its implementation and required verification are recorded in [progress.md](./progress.md).

## 1. Close the current device-verification gap

- [ ] Open the app in Expo Go SDK 57 on a phone using the LAN URL.
- [ ] Verify local Supabase sign-in with a seeded commuter account.
- [ ] Verify session restoration after closing and reopening Expo Go.
- [ ] Verify sign-out clears the protected workspace and cached private state.
- [ ] Submit a report with location permission granted.
- [ ] Verify location-denied and location-unavailable states.
- [ ] Verify the submitted report appears after navigating to Traffic and refreshing.
- [ ] Verify the report screen does not request location before submission.
- [ ] Verify the flow on a small phone viewport without clipped controls or horizontal overflow.
- [ ] Record device model, Expo Go version, LAN configuration, and results in [progress.md](./progress.md).

## 2. Finish authentication hardening

- [ ] Verify invalid credentials, malformed input, duplicate registration, and missing configuration states.
- [ ] Verify expired or invalid sessions return the user to sign-in without exposing private data.
- [ ] Verify account switching does not retain the previous account's private state.
- [ ] Verify network outage and recovery during sign-in, session restoration, and sign-out.
- [ ] Confirm commuter-only actions remain server-authorized and cannot be enabled by client navigation.
- [ ] Add focused mobile tests for auth state transitions and protected-route behavior where practical.

## 3. Complete mobile reporting and verification

- [ ] Add a mobile report history/status view for the signed-in commuter. (Deferred: no per-commuter read contract exists yet.)
- [ ] Show the user's submitted report separately from public active incidents.
- [ ] Show report lifecycle state, freshness, evidence level, and plain-language reason.
- [ ] Show that a report is an observation and does not prove its reported cause.
- [ ] Handle duplicate, rate-limited, expired, resolved, and server-rejected submissions explicitly.
- [x] Refresh or invalidate report and traffic data after a successful submission.
- [ ] Confirm coordinates, timestamps, category values, and notes are validated by the server.
- [ ] Ensure no private report details or account identity are exposed in public traffic responses.

## 4. Add route relevance and alerts

- [x] Define the mobile route-alert contract using the existing server route-relevance rules.
- [x] Add a commuter route or corridor selection screen without requiring continuous tracking.
- [x] Show an alert only when an active incident is relevant to the selected route.
- [ ] Distinguish active, stale, resolved, and expired incidents.
- [x] Require an explicit commuter choice before presenting an alternative route.
- [x] Label free-flow or estimated durations honestly; do not invent measured delay savings.
- [ ] Add loading, empty, stale, offline, and failure states for route alerts. (Loading, empty, stale and failure states are in code; offline storage is not.)
- [ ] Verify unrelated and parallel routes do not receive false alerts.

## 5. Add commuter journeys and consent-based sharing

- [x] Add commuter-controlled journey start/end actions.
- [ ] Show journey state and retention/expiry information. (State and times are shown; retention/expiry is not yet.)
- [x] Keep location collection foreground-only unless a separately approved native feature is implemented.
- [x] Add an explicit sharing preview before any employer sharing action.
- [x] Let the commuter choose what summary fields are shared and with whom.
- [x] Add stop-sharing and revocation controls.
- [ ] Verify revoked, expired, and unauthorized shares are denied by the server.
- [ ] Ensure employer views receive summaries only, never unrestricted GPS histories.

## 6. Add analysis and authority-facing mobile surfaces, if included

- [ ] Define whether authority analytics are mobile scope or remain web-only.
- [ ] If included, add permitted hotspot and monthly analytics views.
- [ ] Show date windows, source/evidence boundaries, and empty states.
- [ ] Avoid exposing private commuter journeys or account identities.
- [ ] Keep authority actions server-authorized and separate from commuter reporting.

## 7. Native extensions after core flows

- [ ] Add push notification permission and token registration only after alert contracts are stable. (Deferred.)
- [ ] Add notification preferences, revocation, and provider-failure handling.
- [ ] Decide whether foreground location is sufficient; do not add background tracking by default.
- [ ] Add offline retry/recovery only for operations that are safe and idempotent. (Deferred; last-good data is kept on screen.)
- [ ] Define local-data retention and clear private cached data on sign-out.
- [ ] Prepare EAS configuration and development builds only after Expo Go flows pass.
- [ ] Verify Android and iOS permission wording and native behavior if both platforms are targeted.

## 8. Release and regression checks

- [x] Resolve the remaining full-lint error in `apps/mobile/app/traffic.tsx` without weakening lint rules (lint runs via `pnpm lint:mobile`; passes).
- [ ] Add or update focused unit/integration tests for validation, authorization, duplicate handling, lifecycle, route relevance, and sharing.
- [ ] Run the Docker mobile type-check and the full repository test/lint/build checks.
- [ ] Verify the development and production-preview API behavior separately.
- [ ] Verify Expo SDK 57 compatibility after every dependency change.
- [ ] Check Android and iOS bundle/configuration output as applicable.
- [ ] Review permissions, environment variables, secrets, and production configuration.
- [ ] Review mobile accessibility: labels, readable status messages, focus/press states, and touch targets.
- [ ] Record all passed, failed, blocked, and deferred checks in [progress.md](./progress.md).
- [ ] Create a scoped commit for each verified implementation slice.

## Deliberate exclusions until approved

- [ ] Do not add background or continuous location tracking.
- [ ] Do not expose private journeys to employers or public traffic screens.
- [ ] Do not treat a single report as verified proof.
- [ ] Do not add delay receipts before the core REPORT -> VERIFY -> ALERT -> ANALYSE flow is complete.
- [ ] Do not claim hosted-device or production verification from local Docker results.
