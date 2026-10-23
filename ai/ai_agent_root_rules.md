# AI Agent Root Rules

These guidelines apply to the traffic hackathon project. They are adapted from the Silent Seal guideline structure; Silent Seal's modules, Python-only assumptions, cryptography requirements, and repository settings do not apply here.

## Core Rules

- Implement the current plan's thin seven-module scope one task at a time, not the entire product brief at once. Map each task to [the source coverage reference](../docs/README.md); record omissions and coverage gaps in the plan. Keep REPORT → VERIFY → ALERT → ANALYSE as the main goal; receipts support it.
- Read existing code and relevant documentation before changing behavior.
- Keep changes focused, understandable, and reversible.
- Distinguish proposed, implemented, and verified behavior in code documentation and responses.
- Never claim tests, integrations, browser checks, or deployment succeeded without evidence.
- Never fabricate live traffic, incident causes, authority confirmation, or measured travel-time savings. Do not show confidence percentages in the demo; use evidence indicators and explain their limits.
- Obtain explicit consent before sharing commuter information. Employer access must not imply continuous location tracking.
- Do not copy secrets, personal travel histories, or credentials into source files, fixtures, logs, or documentation.

## Resource Loading

For implementation and architectural work, first read:

1. [Coding principles](resources/coding_principles.md).
2. [Architecture](resources/architecture.md).

Then load only the resources relevant to the task:

| Task | Resource |
| --- | --- |
| Naming modules, functions, data, or tests | [Naming](resources/coding_practices_naming_guidelines.md) |
| Comments and documentation | [Comments and documentation](resources/coding_practices_comments_and_doc.md) |
| Application logic, APIs, state, integrations, or privacy | [Programming practices](resources/coding_practices_programming_practices.md) |
| Logs, diagnostics, or error reporting | [Logging](resources/coding_practices_logging_guidelines.md) |
| Behavior changes and verification | [Testing](resources/coding_practices_testing.md) |
| Classes, interfaces, and dependency abstractions | [Object-oriented programming](resources/coding_practices_object_oriented_programming.md) |
| Git commits, branches, or pushes | [Commit and push conventions](resources/skills_commit_push.md) |

Documentation-only reviews do not require the full implementation workflow or application tests.

## Work Process

### Before implementation

1. Read the root README and any existing README or instructions in affected directories.
2. Check the current files and working-tree changes. Preserve unrelated user work.
3. Identify the requested behavior, source module, affected surfaces, and acceptance checks using [docs/README.md](../docs/README.md). Consult the linked PDF pages when interpreting the brief; do not mistake its examples for live data or event requirements.
4. Read [docs/plan.md](../docs/plan.md) for scope, design decisions, and acceptance criteria; `docs/implementation.md` for the detailed phase roadmap; and [docs/progress.md](../docs/progress.md) for actual implementation and verification status. Keep all actual task updates, results, blockers, verification evidence, and commit records only in `docs/progress.md`, including the current task and acceptance checks before implementation. Do not put transient status in instructions, the plan, or the roadmap. This division supersedes older documentation and scheduling directions. For multi-step work, also maintain a short task list.
5. Use the selected Next.js + Supabase TypeScript stack with pnpm inside Docker (pinned in `package.json`); use the repository `justfile` (`just up`, `just test`, `just check`, `just status`, etc.) or follow [Docker commands](../docs/docker.md), preserve `pnpm-lock.yaml`, and avoid host installs or npm/yarn lockfiles. Leave unrelated Docker projects untouched. Confirm unresolved provider access before dependent work. Plan sequentially for one active human with AI assistance, using [docs/implementation.md](../docs/implementation.md) as the authority for phase order and dependencies, not a fixed promised date. Finish required acceptance checks before advancing, or obtain an explicit user-approved scope change to defer optional work without marking its checks passed; implementation alone is not verification. Employer feedback gates final receipt fields and prominence, not the preceding core traffic phases.
6. For UI work, consult the applicable app's AI rules and design reference. For web work, use `docs/design/trafficsense/README.md`; for mobile work, use the mobile app's own rules and design plan. Preserve working behaviour, accessibility, privacy, truthful evidence labels, and explicit simulated states rather than copying unsupported claims from visual examples.

### During implementation

- Prefer existing patterns and dependencies over new frameworks or abstractions.
- Validate external data and enforce authorization on the server.
- Keep sign-in optional for guest/public browsing. Require authorization for private account/organisation data and restricted actions; never turn a demo selector into role access. Guest reporting needs explicit source-identity, write-policy and abuse-control checks before implementation, not a blanket anonymous grant.
- Keep incident evidence, interpretation, and lifecycle state separate.
- Keep shared state consistent across map/details, alternative alerts, commuter and employer views, and historical analytics within their stated date windows.
- Write relevant tests before behaviour, implement one bounded task, run checks and browser verification, then review the diff and commit the checked step under the commit rules.
- Make loading, empty, denied-permission, stale-data, and failure states explicit.
- Keep demonstrations clearly labelled when data or integrations are simulated.

### Verification

- Run configured checks relevant to the change; report failures and blockers accurately.
- Add tests for meaningful logic, especially consent, access control, incident expiry, duplicate handling, and route relevance.
- For web changes, use available browser tools to click, type, submit, and navigate the changed flow end to end.
- Visit every route sharing changed components, state, or data, and look for regressions.
- Check desktop and mobile viewports after layout or styling changes.
- Exercise affected edge states, not only the happy path. Fix discovered regressions and verify again.
- If browser tools are unavailable, use the closest available substitute and say exactly what remains unverified.

### Documentation

Update documentation when a change makes it inaccurate. Keep the root README as a short orientation linking to the plan, phase roadmap, design reference, and progress record, not a duplicate status summary. Put detailed module behavior or run instructions in the affected module's README or docs when those exist; all actual status and results stay in `docs/progress.md`.

Do not create repetitive progress reports for every task. Do not invent completion percentages or test results. Review-only tasks need no project edits unless requested.

## Conflicts and Maintenance

Higher-priority session instructions and applicable nested project instructions take precedence. Within this guideline set, root rules take precedence over resources; task-specific resources take precedence over general coding principles for their domain. Surface any unresolved conflict instead of silently weakening privacy or verification requirements.

Keep resource links, source coverage, and architecture synchronized when scope or boundaries change. Inspect current source and configured scripts, and consult `docs/progress.md` for implementation and verification status instead of embedding scaffold, integration, or test-availability claims in instructions. Read version-specific Next.js documentation bundled under `node_modules/next/dist/docs/` in the container before framework changes.
