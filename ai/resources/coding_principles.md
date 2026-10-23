# Coding Principles

## Solve the Current Problem

Build the plan's seven recommended modules thinly, one verified phase at a time for one active human with AI assistance, without a fixed promised date. Follow the phase order in `docs/implementation.md` and [architecture](architecture.md), using [docs/plan.md](../../docs/plan.md) for scope, design, and acceptance and [docs/progress.md](../../docs/progress.md) for actual status and results. Use [the source coverage reference](../../docs/README.md) to keep reporting, verification, alerts, employer visibility, and analytics aligned with the main goal. Receipt fields and prominence depend on employer input; the receipt extension follows the core traffic modules. Avoid speculative features, extra services, and deferred work. Record scope reductions in the plan rather than silently dropping a module.

## Prefer Readable, Focused Code

Use clear names and cohesive functions. Separate responsibilities when that improves understanding or testability, not to satisfy arbitrary file-size limits. Match established language and framework conventions.

## Make Claims Match Evidence

A low-speed phone does not prove a traffic jam. Multiple accounts do not necessarily represent independent witnesses. A photo does not establish its own time or location. Preserve these limitations in status labels and explanations.

A reported cause, corroborated congestion, and authority confirmation are different claims. Do not show confidence percentages in the demo, including percentages in supplied design examples. Show evidence indicators, source counts, freshness, and limitations instead; these are not calibrated probabilities.

## Privacy Is Part of Behavior

Collect the minimum location data needed. Explain active collection and sharing. Keep journey tracking explicitly controlled by the commuter. Employer views receive authorized summaries, not unrestricted travel histories. Consent does not replace server-side authorization.

## Test What Matters

Prioritize access control, incident lifecycle, route relevance, shared state, and failure handling. Use focused unit tests, integration tests for boundaries, and browser verification for user flows. Coverage numbers alone do not establish correctness.

## Keep the Demo Honest

Synthetic data is useful when clearly labelled. Distinguish measured results from estimates and intended future impact. Demonstrate limitations instead of hiding them behind fabricated live feeds or AI claims.
