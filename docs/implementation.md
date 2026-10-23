# TrafficSense Implementation Plan

This is the detailed phase-wise build plan. [Project scope and decisions](plan.md) define what to build; [progress](progress.md) records what actually happened. This file contains dependencies, planned work and exit criteria—not task status, results or commit history.

## Delivery approach

Build sequentially for one active human with AI assistance. Use **verified phases**, not an assumed seven-day deadline. Split each phase into small testable changes and reviewed local commits. Advance when exit checks pass; report a genuine blocker rather than silently weakening acceptance. Confirm any event deadline and submission rules separately.

The target is a working, responsive, synthetic web demonstration of **REPORT → VERIFY → ALERT → ANALYSE**, covering all seven [source modules](README.md). Complete the core traffic and employer flows before the receipt extension. Local completion and hosted release are different acceptance claims.

## Phase map

| Phase | Deliverable | Dependencies | Source modules / checks |
| --- | --- | --- | --- |
| 0 | Planning, design reference and AI alignment | User review | Shared documentation checks |
| 1 | Verified authentication and organisation boundaries | 0 | Module 1; relevant S7, S10–S11 |
| 2 | Supplied responsive UI integrated with existing flows | 1 | Shared UI; S10–S11 and auth regression |
| 3 | Deterministic corridor, simulator and map | 2 | Module 2; relevant S3, S5, S10–S11 |
| 4 | Persisted reports, evidence and incident lifecycle | 3 | Modules 3–4; S1–S5, S10–S11 |
| 5 | Relevant fixed-route alternative alerts | 4 | Module 5; S12 and shared lifecycle checks |
| 6 | Commuter-controlled journeys and employer sharing | 1, 4; execute after 5 | Module 6; S13, relevant S6–S7/S10–S11 |
| 7 | Authority hotspots and monthly analytics | 4; execute after 6 | Module 7; S14, M7 |
| 8 | Protected delay-receipt extension | 4, 6; core phases first | Extension to 4/6; S6–S9 and S2 receipt check |
| 9 | Full regression, release readiness and handoff | Core phases; 8 if included | All applicable S1–S14; measured metrics only |

Scenario and metric definitions remain in [plan.md](plan.md#acceptance-scenarios). A phase may satisfy only part of a scenario: do not claim receipt tests passed before receipts exist.

## Phase 0 — Align documentation and design references

- Keep `docs/plan.md` for scope, design decisions, contracts, acceptance targets and qualified research; use this file for execution sequence.
- Keep legacy task/results/history in dated `docs/progress.md` entries rather than the scope plan, preserving qualifications and avoiding duplicated records. Reconcile progress with code and actual command evidence.
- Preserve the supplied HTML, design specification and screenshot under [the design reference](design/trafficsense/README.md). Treat them as reference assets, not application behavior or a source of verified claims. Check secrets, asset provenance and third-party dependencies before reuse.
- Align `AGENTS.md`, the AI root rules, architecture, testing, principles, naming and commit guidance. Remove stale starter-only assumptions and fixed-day scheduling; preserve Docker, privacy and browser requirements.
- Synchronize README, source-module mappings and Docker/auth instructions. Keep the original PDF unchanged.

**Exit:** Markdown/local links, phase/scenario mappings and document ownership validate in Docker; the scoped diff is reviewed and locally committed. Preserve unrelated application work. Documentation verification does not establish application correctness.

## Phase 1 — Finish authentication verification

Reuse the existing implementation rather than scaffolding it again. Consult progress for outstanding failures and completed evidence.

- Diagnose any existing browser-navigation failure before a redesign: capture settled URL/page state, console/network errors and safe screenshots. Determine whether the application or driver is faulty; do not assume the cause or weaken assertions.
- Verify startup → migrations → synthetic seed → app startup, repeated setup/seed, and non-destructive stop/start. Check loopback ports, project/network isolation, non-root app, no app/seeder Docker socket and secret/build exclusions.
- Exercise public guest entry without cookies or backend configuration; keep private routes protected. Exercise optional registration, malformed/wrong credentials, login, every role, correct/wrong organisation, unassigned employer, direct links, reload, logout and account switching.
- Test forged session metadata, refresh/invalid refresh token, expiry around logout and missing-profile recovery. Distinguish forced cookie expiry from a genuinely expired signed token.
- Cover backend outage/recovery, role/membership removal during a session, two tabs, and back/forward after navigation settles. Test complete keyboard form interaction, not only initial focus.
- Run Docker unit/lint/type/build checks, real-session database tests and browser interactions on both development and production preview at desktop/mobile sizes. Verify missing configuration separately.

**Exit:** authentication, organisation isolation and recovery/negative flows pass end to end. Review and commit the auth slice separately from documentation and design changes.

## Phase 2 — Integrate the supplied responsive UI

- Convert the [supplied design](design/trafficsense/README.md) into React components using the existing Tailwind/CSS toolchain; no runtime Tailwind CDN or pasted HTML document.
- Normalize shared colour, typography, spacing, border, focus, card, badge, button and form styles. Use Plus Jakarta Sans, Inter and JetBrains Mono with supported loading and fallbacks.
- Match the homepage navigation, hero/map preview, feature cards, role sections and footer. Adapt desktop design for mobile navigation, readable labels and at least 44px controls; avoid overflow and clipped evidence text.
- Apply the style to login/register, account, employer organisation pages, authority/admin foundation pages, errors, access-denied and not-found states.
- Connect implemented actions only. Future screens show explicit planned/design-preview states, not `#` links, fabricated successful submissions or decorative “verified” certificates. Sign-in stays optional for guest/public browsing; public demo navigation cannot grant a private role. Keep `/demo` usable without backend configuration and route private account actions to authentication.
- Correct unsupported template claims while preserving visual intent. Keep traffic reporting, verification, alerts and analysis prominent; label receipts as an extension until implemented.

### Planned screen mapping

| Screen | Route / behavior |
| --- | --- |
| Landing / guest entry | `/` and `/demo`; public preview with optional sign-in, honest feature availability and no automatic account/location collection |
| Authentication | `/login`, `/register`; existing server-enforced auth |
| Account / commuter entry | `/workspace`; preserve role-aware navigation |
| Traffic | Proposed `/traffic`; map plus accessible list and incident details |
| Report | Proposed `/reports/new`; validated persisted submission |
| Journeys | Proposed `/journeys`; start/end, alerts and separate sharing controls |
| Employer | `/employer`, `/employer/[orgId]`; current membership plus explicit travel consent |
| Authority | `/authority`, proposed `/authority/analytics`; permitted evidence/history views |
| Receipts | Proposed `/receipts` and authenticated detail/verification routes in Phase 8 |
| Administration | `/admin`; restricted demo operations only, not full administration |

Finalize proposed route names and access contracts before wiring links; retain existing routes. Shared maps expose only permitted incident/demo data, never private journeys or account identities.

**Exit:** user reviews homepage/mobile direction; every existing route and auth flow still works; desktop/mobile behavior and layout checks pass. A screenshot match alone is insufficient.

## Phase 3 — Corridor, simulator and map foundation

- Define typed contracts and migrations for corridor/segments/directions, fixed primary and alternative routes, synthetic observations and provenance. Add constraints, RLS and indexes for actual reads.
- Seed one reproducible Mangaluru demonstration corridor, named baseline times, normal/slowdown/recovery scenarios and fixed synthetic sources. Baselines are demo assumptions, not measured city traffic.
- Use MapLibre with a policy-compliant OSM-derived tile source after checking terms, attribution, quotas and assets. Provider failure is explicit; keep an accessible data list, not a silent substitution with a fake live map.
- Build map/list/detail selection around common IDs with keyboard access, loading/empty/error states and timestamps. Public demo route geometry is separate from private journey responses.
- Keep simulation/reset local and privileged initially. Later browser controls require both server-enforced demo mode and admin authorization. Reset only owned synthetic data; never unrelated databases/projects.
- Simulation is the core input. Optional real foreground GPS is off by default and needs consent, visible state and denied/unavailable behavior; it does not block the core demo.

**Exit:** repeatable fixtures produce the same data; map/list and provider-failure recovery work on desktop/mobile; unauthorized simulation/reset is denied. Initial map fixtures are not evidence that report verification already works.

## Phase 4 — Reports, evidence and lifecycle

Deliver persisted reporting first, then corroboration/recovery and the attack demonstration.

- Write deterministic tests before mutations. Validate timestamps/category/segment/direction; derive source identity and receipt time on the server. Support guest submission without forcing registration only after server-issued guest identity, least-privilege write/ownership policies and abuse controls pass. Browsing alone creates no auth session. Persist before showing success and use safe retries.
- Keep reports, incidents, evidence, reported cause and lifecycle distinct. Use uniqueness/transactions to prevent concurrent retries inflating counts.
- Specify eligibility and exact timestamp boundaries before implementing the planned thresholds in [plan.md](plan.md#evidence-and-lifecycle-contract). Distinct accounts are not proven independent people.
- L1 is reported; L2 is eligible location support with provenance; L3/L4 are corroboration indicators. Cause remains reported/unknown without separate support. L5 is not collected; L6 is unavailable unless explicitly built as a labelled simulated action.
- Derive excess traversal time only from a complete observation and named baseline; missing/partial data is unavailable.
- Demonstrate repeated fabricated reports from one source without source-count inflation or corroboration. Test concurrency, parallel road, wrong direction, stale/future/malformed data, insufficient sources and missing baselines.
- Share server-derived assessment across map/list/details and future consumers. Enforce freshness on reads even if cleanup is delayed; use controlled clocks for expiry/recovery tests.

**Exit:** report → persistence → map/details → corroboration/stale/recovery works consistently after refresh. The specified duplicate attack fails without claiming general spoof resistance. Receipt ineligibility is tested later when issuance exists.

## Phase 5 — Alternative-route alerts

- Compare only fixed primary/alternative routes, using fresh comparable travel-time inputs and common incident assessment.
- Match the selected affected segment/direction; show estimated simulated savings with sources and freshness.
- Abstain for savings below five minutes, missing/stale inputs or a known alternative closure/hazard. Test the exactly-five-minute boundary explicitly. No guaranteed savings or road-safety claim.
- Clear/update alerts with incident expiry/recovery. Parallel roads and unrelated directions do not trigger them.

**Exit:** every S12 branch has rule tests and browser interaction, including abstention and shared map/detail refresh—not just a positive alert card.

## Phase 6 — Journeys and consent-based employer sharing

- Define ownership/lifecycle, private segment summaries, recipient-specific consent, employer response fields, expiry and retention before migrations.
- Starting a journey never starts employer sharing. Provide start/end, preview exact fields/organisation, confirm/cancel share, visible sharing state and stop-sharing.
- Send only allowlisted reference/corridor/status/estimated-delay/evidence/freshness fields for permitted active shares. Never deliver coordinates, geometry, route history, unrelated journeys or raw observations to employer clients.
- Check user/role/membership, intended organisation, current consent and journey state on every read. Stop/end denies subsequent reads; refreshed/updated views clear old rows. Explain refresh-based status and that saved copies cannot be recalled.
- Test ownership, unshared/wrong-org access, changed membership, account switching, cancellation, stop/read races and already-open list/detail pages. Inspect response shapes, not only what CSS shows.
- Use synthetic journeys. Define private-summary, consent/audit, receipt-snapshot and synthetic-history retention separately. Real-person collection waits for approved and enforced consent/deletion/access rules.

**Exit:** commuter-to-employer sharing works and stop/end removes future access across all readers; no forbidden location fields reach employer clients.

## Phase 7 — Hotspots and monthly analytics

- Seed deterministic history for about five junctions across several months, labelled simulated; PDF numbers are not data.
- Define UTC storage, Asia/Kolkata display periods, inclusive boundaries, working-day denominator, recurrence, unknown causes and delay units. Incident duration alone is not aggregate commuter delay-hours.
- Derive hotspot ranking, cause mix, recurrence, peak window, average/max delay, trends and monthly reason totals from the same history, not unrelated hardcoded cards.
- Build authority filters/list/table/details in the shared design with empty/error/provenance states. New incidents affect only matching windows; historical-only views explain their cutoff.
- Test date edges, duplicates, zero denominators, empty periods, unknown causes and independently reconciled totals. Verify filters keep cards and tables consistent.
- Outputs suggest investigation, not confirmed causes or infrastructure decisions. CSV follows required views if retained.

**Exit:** statistics reconcile with fixtures; every metric has a defined unit/window; filters, navigation and refresh preserve consistent browser state.

## Phase 8 — Protected receipt extension

Core modules take priority. Confirm employer preference/minimum fields before implementation; absent feedback, use the minimal contract explicitly as a provisional synthetic demonstration, not an employer-approved service. Any deferral is an explicit scope decision.

- Require an eligible owned journey and a corroborated incident relevant to its segment, direction and observation window before issuance. Test rejection of uncorroborated and unrelated evidence separately from signature validity and recipient authorization. Derive preview and receipt fields from that stored data; never sign browser-supplied delay, role, recipient or verification claims.
- Define canonical payload/version, server-held Ed25519 key, evidence snapshot, recipient binding, issuance/expiry/revocation and verification states before coding.
- Implement preview → consent → issue/share → intended-employer verification → revoke/expire. Authentication/current recipient access is required; a URL/signature alone grants no access.
- Test modification, wrong owner/org, invalid/expired/revoked records, signing/key failure, duplicate issuance, repeated-report ineligibility and already-open pages.
- Incident clearance changes current traffic, not the historical snapshot. Explain that recorded device observations and integrity do not prove GPS truth, who carried a device or why someone was late.

**Exit:** all S6–S9 protections and receipt-related S2 checks pass together; no decorative verification or cuts to consent, expiry or revocation.

## Phase 9 — Regression, release and handoff

- Re-run Docker unit/lint/type/build, real database policy/persistence tests and full browser scenarios against development and production preview. Audit dependencies and record unresolved findings without suppression.
- Cover desktop/mobile/keyboard, multiple accounts/orgs/tabs, direct links/history, sessions, backend/provider/network failures, freshness, stop/end and all shared readers. Inspect errors without logging secrets.
- Rehearse setup/seed/restart, narrowly scoped reset, migrations and rollback/recovery strategy. Obtain user design and end-to-end review.
- Confirm hosting/database/map access and terms. Separate local synthetic defaults from hosted HTTPS, secure cookies, origins, account policy, signup/report abuse controls and restricted demo tools. Public account use requires explicit email confirmation/recovery/delivery decisions and tests.
- Deploy only with authorized access and re-run the full flow on that origin. Local production is not deployment. Keep a labelled local/recorded fallback without concealing hosted failure.
- Prepare runbook, screenshots, architecture/scenario summaries, privacy limits and demo narrative. Event-specific artefacts wait for actual requirements. Push or submit only when explicitly requested.

**Exit:** a reproducible working build with disclosed limitations; hosted completion only after deployed verification. Record remaining dependencies in progress, not as passed gates.

## Rules for every implementation task

1. Read scope, this phase, design/contracts and progress; preserve unrelated work. Load only relevant AI resources.
2. Record task scope, source module, affected readers and acceptance checks in progress before implementation.
3. Write meaningful rule/policy tests first and build the smallest usable end-to-end slice.
4. Run all package/runtime/check commands in Docker with pinned pnpm. Use `just test`, `just check`, `just lint` (from the repository `justfile`) or raw `docker compose` commands. Keep one Next.js + Supabase app, no additional backend framework.
5. Exercise all affected browser readers and negative/recovery paths; check desktop/mobile for visual changes. A build, screenshot, stub or optimistic toast is not completion.
6. Fix and re-test failures; review diff, update technical docs/progress and make a scoped local commit. Obtain user review at phase/design boundaries; report the hash and never push implicitly.
7. Advance after exit checks or an explicit approved scope change. Unavailable browser tooling permits substitute checks with stated limits, not an invented browser pass.

## Dependency and scope policy

Provider access blocks only provider-dependent work; employer feedback gates final receipt claims, not traffic foundations. Real-person data requires approved privacy/retention rules. Event requirements gate submission promises, not local progress.

Keep explicit refresh, fixed routes and synthetic data. Optional work is CSV, simulated authority confirmation, Realtime, foreground GPS and richer animation. Defer receipts explicitly rather than sacrifice a core employer dashboard to preserve them. Every module cut needs user approval and a disclosed traceability gap. Preserve access controls, consent, evidence honesty, lifecycle tests and mobile usability throughout.
