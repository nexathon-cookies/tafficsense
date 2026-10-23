# Shared package progress

## Route contract — implemented, 21 Oct 2026

- **Implementation:** Added platform-neutral route coordinate, incident-warning, route-option and route-response types for the mobile client to consume the existing web route API.
- **Verification:** Mobile TypeScript checking passed in Docker; no backend or web behavior was changed.
- **Commit:** Pending.

Record shared-contract implementation updates, verification evidence, blockers, and commit records here.

Every cross-app change must link to the corresponding entries in [web progress](../../apps/web/docs/progress.md) and [mobile progress](../../apps/mobile/docs/progress.md).

## Mobile traffic contract — implemented, 20 Oct 2026

- **Implementation:** Added the platform-neutral `LiveIncident` and `ActiveIncidentsResponse` shapes used by the mobile public traffic client.
- **Verification:** Consumed by the mobile TypeScript build successfully. The corresponding mobile progress record contains the API and runtime evidence.
- **Commit:** Pending.
