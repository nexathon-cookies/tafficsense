# Comments and Documentation

## Comments

Explain non-obvious constraints, assumptions, or reasons. Do not narrate obvious code. Remove obsolete comments and commented-out code rather than preserving it as informal history.

A TODO must describe a concrete missing behavior and its consequence. TODOs and suppressions are not substitutes for implementing the requested behavior.

Comment-only cleanup must not change behavior unless separately requested.

## API and Function Documentation

Follow the chosen language's documentation conventions. Document public contracts when callers need details that names and types cannot express, including units, coordinate order, side effects, permissions, expiry, and failure behavior.

Examples must match the actual implementation. Clearly label proposed interfaces and synthetic examples.

## Project Documentation

- Keep setup commands, environment-variable names, and verification instructions accurate.
- Document required providers and whether each integration is live, simulated, or unavailable.
- Explain retention, consent, sharing expiry, and revocation behavior when implemented.
- Record meaningful limitations, including browser geolocation/background restrictions when applicable.
- Keep `docs/plan.md` for scope, design decisions, and acceptance criteria; `docs/implementation.md` for the detailed phase roadmap; and `docs/design/trafficsense/README.md` as the supplied responsive UI design reference.
- Record all actual status, results, blockers, verification evidence, and commit records only in [docs/progress.md](../../docs/progress.md). Instructions and architecture describe durable guidance, not current completion claims.
- Keep the root README as a short orientation linking to those sources, not a duplicate status report.
- Update only documentation affected by a change; avoid duplicate progress narratives.
- Never include secret values, real personal journeys, or invented test results.
- Link to existing files and use consistent paths.
