# Logging Guidelines

Use the application's configured logger once one exists. Avoid ad hoc console output for production diagnostics; normal CLI output is a separate concern.

## Useful Events

Log relevant outcomes such as report acceptance or rejection, incident status changes, integration failures, and notification delivery results. Use structured fields with non-sensitive identifiers, outcome, and duration where useful.

- Debug: development diagnostics, disabled or limited in production.
- Info: meaningful successful operations, not every GPS update.
- Warning: degraded behavior or recoverable external failures.
- Error: operations that failed and require investigation.

Log an error once at the boundary responsible for handling it. Include diagnostic context after sanitization; exception messages and provider responses may themselves contain sensitive data. Bound retry logs to avoid flooding output.

## Excluded Data

Never log credentials, access tokens, share tokens, raw GPS traces, home/work addresses, uploaded media, voice transcripts, or complete request/response bodies containing personal data.

Do not expose logs or stack traces to users. Use a safe error message and a non-sensitive reference identifier when support needs correlation.

An audit record of consent or incident-status changes is distinct from diagnostic logging. Define access and retention explicitly; ordinary logs must not become an alternative location-history database.
