# Testing and Browser Verification

Inspect `package.json`, the relevant test files, and [Docker commands](../../docs/docker.md) for the configured checks; do not assume tests are absent or that a script covers every verification layer. Run project tests and checks in Docker with the pinned pnpm version — use `just test` (unit tests), `just check` (full suite), `just lint`, or `just test-integration` from the repository `justfile`, or the raw `docker compose` commands documented in `docs/docker.md`. Consult [docs/progress.md](../../docs/progress.md) for actual results and blockers, not these instructions.

## Automated Tests

Test observable behavior rather than internal function-call sequences. Prefer real inexpensive dependencies and isolate external providers through controlled responses. Use synthetic fixtures without personal location histories. Control clocks for expiry tests rather than relying on arbitrary sleeps.

Prioritize these cases when the corresponding feature is implemented:

- Invalid coordinates, malformed timestamps, unsupported uploads, and missing fields are rejected.
- Duplicate reports and retried submissions do not inflate independent evidence.
- Congestion corroboration does not automatically confirm an accident or another claimed cause.
- Old or resolved incidents stop producing current alerts.
- A route intersecting a disruption is alerted; an unrelated or nearby parallel route is not incorrectly alerted.
- Incident updates remain consistent across all readers.
- Sharing requires an explicit action and exposes only the selected summary fields.
- Unauthorized users cannot access journeys, evidence, or employer summaries by changing IDs or opening direct URLs.
- Expired and revoked shares are denied by the server, not merely hidden in the interface.
- Provider failure remains distinguishable from an empty result and from simulated data.

Keep verification layers separate:

- **Unit:** deterministic rules and pure logic, including input validation, evidence, lifecycle, route relevance, and summary calculations.
- **Integration:** real persistence, authentication sessions, server authorization, and database row-level security against the configured test backend. Mocked provider responses verify handling, not the real provider.
- **Browser:** complete user interactions across affected routes, session changes, shared state, and responsive layouts. Unit or integration passes, successful builds, and healthy containers do not establish browser correctness.

Run relevant checks at each phase gate and record each layer's outcome separately in [docs/progress.md](../../docs/progress.md). A failed or blocked browser check remains unverified even when other layers pass. No universal coverage percentage is required.

## Mandatory Browser Workflow for Web Changes

1. Start the app using `just dev` (foreground) or `just up` (background), then open it with available browser tools.
2. Exercise the changed behavior as a user: click, type, submit, navigate, and inspect the actual outcome.
3. Visit every page or route sharing the changed components, state, or data. Verify consistency after navigation and reload.
4. Actively test affected edge states and surrounding existing flows. A screenshot or successful render alone is insufficient.
5. For layout or styling changes, check desktop and mobile widths, including overflow, overlays, and map controls.
6. Check console and network failures when tools permit, without exposing sensitive request contents.
7. Verify session changes across tabs and back/forward history after navigation has settled; check role/membership changes and expiry while views are open. Confirm complete keyboard form interaction, not only initial focus.
8. At phase gates, verify development and production-preview behavior separately. Hosted release needs another pass on the deployed origin; a local preview is not deployment.
9. Fix discovered problems and repeat the affected checks before declaring completion.

For the proposed reporting-to-sharing flow, verify report creation, supporting-evidence display, relevant and irrelevant routes, share preview, employer access, revocation, and incident clearance when those capabilities exist.

If browser tools are unavailable, use the closest available substitute, such as automated UI tests, rendering checks, or HTTP checks. Explicitly state which interactions and visual states remain unverified.

## Results

Report the commands and flows actually checked and their outcomes. Distinguish skipped, blocked, and failed checks. Never describe a mocked integration test as verification against a live provider.
