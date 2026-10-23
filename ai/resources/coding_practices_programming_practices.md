# Programming Practices

## Inputs and Contracts

Validate external input at boundaries, including coordinates, timestamps, enum values, upload types and sizes, and identifiers. Account for clock skew and distinguish client observation times from server receipt times.

Use explicit schemas and the chosen language's type system. The server owns authorization and privileged state changes; client validation is only a usability aid.

## Incident Evidence and Lifecycle

- Keep reported cause separate from evidence of congestion.
- Define grouping criteria using location, time, and relevant route or road information. Nearby parallel roads must not automatically become one incident.
- Handle duplicate submissions and retries without inflating evidence counts.
- Do not equate account count with independent witness count.
- Define freshness, expiry, conflict handling, and who may resolve an incident.
- Record the basis for status changes and propagate updates to every dependent view.
- Treat uploaded media and AI classifications as untrusted inputs. AI-generated text must not grant confirmation status.

## Client State and User Experience

Use one clear source of truth for shared server data. Refresh or invalidate dependent views after reports, incident resolution, sharing changes, and expiry. Avoid displaying cached private data after sign-out or account switching.

Handle loading, empty, stale, offline, permission-denied, and failed-request states. Avoid silent failures and optimistic success messages when persistence failed.

Provide accessible labels, keyboard interaction, visible focus, and status information that does not rely on color alone. Design reporting for passengers or stationary users, not interaction while driving.

## Location and Sharing

- Collect location only for an explicitly enabled purpose and stop collection when that purpose ends.
- Provide visible collection state and graceful behavior when geolocation is denied or unavailable.
- Make sharing a separate, informed action with a preview of the fields and intended recipients.
- Enforce recipient access, expiry, and revocation on the server, including direct-link requests.
- Apply authorization to media as well as API records. Do not expose private evidence through unrestricted object-storage URLs.
- Avoid sending full GPS histories to employer clients and merely hiding them in the UI.
- Set and document retention rules before retaining real journey data.

## Errors and Integrations

Catch errors where recovery or useful context is possible. Preserve causes internally while returning safe user-facing messages. Use timeouts and bounded retries for external services; retry only where the operation is safe or idempotent.

Cancel obsolete requests and release subscriptions, timers, and geolocation watchers. Validate provider responses. Keep simulated adapters explicit; never make an outage look like successful live data.

Keep secrets out of clients, source control, and logs. Use environment configuration and document variable names without values. Enforce abuse controls on exposed reporting and upload endpoints before public use.
