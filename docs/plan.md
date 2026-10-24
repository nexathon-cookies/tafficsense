# TrafficSense — Project Plan

## Purpose and document ownership

**TrafficSense Mangaluru** is a bounded web demonstration of **REPORT → VERIFY → ALERT → ANALYSE**: explain road disruptions with visible evidence, help commuters avoid affected roads, support consent-based employer visibility, and identify recurring problems for investigation.

- This file holds scope, design decisions, proposed contracts, acceptance targets and research assumptions.
- [docs/implementation.md](implementation.md) holds the detailed phase-wise implementation plan, dependencies and exit checks.
- [progress.md](progress.md) is the sole record of implementation status, actual blockers, verification results, review and commit history.
- [Source coverage](README.md) maps the seven recommended modules to the unchanged [original PDF](Traffic_JAM.pdf).
- [Design reference](design/trafficsense/README.md) identifies the supplied UI and the rules for adapting it honestly.

Plan sequentially for one active human builder with AI assistance, using verified phases rather than fixed-day promises. Confirm any event deadline, daily capacity and submission rules before scheduling a release. The PDF is an AI-generated employer-informed product brief, not confirmed event rules or independently verified research.

## Product scope

| Recommended module | Planned bounded behavior |
| --- | --- |
| 1. Registration/login | Optional Supabase accounts plus a public guest entry; private commuter, employer, authority and admin actions remain server-authorized; commuter-only public registration |
| 2. GPS/traffic map | One simulated corridor, incident map/list/details, provenance and freshness; optional consented foreground GPS, not continuous tracking |
| 3. Incident reporting | Persisted guest/account reports with server-issued source identity, segment/direction, time, category including Unknown and provenance; guest-write policies and abuse controls must pass before guest submission is enabled; no photos/voice |
| 4. Verification | Explainable L1–L4 evidence indicators, separate cause assessment, freshness/recovery and a narrowly defined duplicate-report attack |
| 5. Alternative alert | One fixed primary route and precomputed alternative, relevance checks, qualified simulated estimates and abstention |
| 6. Employer dashboard | Employee-started, separately shared journeys; recipient-specific limited status, visible consent and stop/end enforcement |
| 7. Analytics/monthly reports | Deterministic dated synthetic hotspot and monthly views with defined units, recurrence and consistent totals |

A signed **Delay Receipt** is a planned extension to verification and employer sharing, not a replacement for these modules. Its minimum fields and prominence depend on employer feedback; absent feedback it remains a provisional synthetic demonstration. If included, every consent, integrity, recipient, expiry and revocation protection is mandatory.

### Optional sign-in and guest access

Sign-in is optional for entering the app and browsing public traffic/demo information. Provide a public `/demo` entry and guest navigation from home and authentication screens; browsing must not create an account, collect location or expose private records. Public map, incident-detail and route-alert pages should follow this policy when implemented.

Accounts remain necessary for private account/organisation data, saved personal journeys, employer sharing and restricted authority/admin actions. A public demo or role preview must never grant those privileges. Public traffic reads use explicitly allowlisted data and their own policies. The sole approved private-data aggregation exception is the bounded report-evidence reader below: it reduces private source relationships to per-segment counts inside the database, without exposing private records or giving the app a privileged key.

Guest reporting is planned without forcing registration, but requires a server-issued source identity, least-privilege write/ownership policies and abuse controls before it is enabled. Guest browsing alone does not start an anonymous auth session. A guest identity is not proof of an independent person. Defer guest writes until their Phase 4 checks pass rather than exposing anonymous database writes. Making sign-in mandatory later requires an explicit product decision; do not introduce a global login redirect now.

### Explicit limits

- Simulation is not a live traffic feed; retain **SIMULATED** on every synthetic observation and derived view.
- Distinct accounts do not prove independent witnesses. Slowdown does not establish an incident cause. A signature establishes integrity/origin, not GPS truth or lateness.
- No confidence percentages, guaranteed savings, legal-grade claims, or official authority confirmation without actual support.
- Defer photos/video, AI classification, voice, native/background tracking, SOS, prediction, full administration, general spoof detection, real routing and PDF export.
- Optional after core acceptance: CSV, simulated authority-confirm actions, Realtime, foreground GPS and richer animation. Explicit refresh with freshness timestamps is acceptable.
- Do not cut the core employer status view to preserve receipts. Any module reduction needs user approval and a documented coverage gap; never remove access controls, consent, negative tests or mobile verification to save time.

## Visual design contract

Use the supplied TrafficSense Mangaluru screenshot/HTML as the visual baseline: pale lavender surface, white cards, teal actions, violet simulation labels, structured navigation, split hero, feature cards and role sections. Use Plus Jakarta Sans headings, Inter interface text and JetBrains Mono technical details.

The [reference README](design/trafficsense/README.md) governs differences between the screenshot, HTML and design-spec prose. Adapt to mobile with readable labels, accessible focus, keyboard operation, text/icons alongside colour and minimum 44px controls. User review is required for material deviations.

The template is a visual reference, not functional or verified behavior. Replace placeholder links with implemented actions or explicitly unavailable states. Its map image is not an interactive map, and sample certificates/statistics are not real results. Correct unsupported privacy/security claims while preserving the design. Keep the main traffic goal prominent rather than presenting a receipt-only product.

## Technical approach and boundaries

| Area | Choice / limit |
| --- | --- |
| Application | One Next.js App Router application, TypeScript and Tailwind; no extra backend framework |
| Runtime/package manager | Docker-only development, package commands and checks; pinned pnpm and sole `pnpm-lock.yaml` |
| Auth/data | Supabase Auth/Postgres, migrations, RLS and server authorization; local Docker for development |
| Map | Non-WebGL Leaflet renderer in the Expo WebView with OpenStreetMap raster tiles; identify the app in tile requests, preserve attribution, avoid bulk/offline downloads, and keep list/schematic fallbacks |
| Routes/data | Deterministic corridor, segment/direction matching, synthetic scenarios and one precomputed alternative |
| State | Shared server-derived evidence/lifecycle/consent/history rules; explicit refresh allowed; no stale private data after account changes |
| Receipts | Proposed server-side Ed25519 canonical payload/version and protected keys; implement only with full validity/access checks |
| Hosting | Authorized familiar Node host or Vercel plus suitable database; provider terms/access and deployed verification are separate gates |

Define schemas just before each feature, not a large speculative database upfront. Conceptual responsibilities: profiles/organisations/memberships; corridor and segment data; observations/reports; incidents and evidence; owned journeys and private summaries; explicit shares/consents; optional receipts; minimal audit records; dated synthetic history.

The client submits observations, never trusted identity, roles, corroboration, delay or validity. The server validates input, derives decisions, enforces current permissions and persists before showing success. Use database constraints/transactions for concurrent mutations and retries. Normal application requests use policies, not privileged-key bypasses.

Map, list, details, alerts and receipt eligibility share incident/evidence rules. Employer list/detail reads share current consent and recipient rules. Hotspots/monthly totals share dated history. Store timestamps in UTC and explicitly define Asia/Kolkata display/analytics windows. Enforce freshness/expiry on reads even if scheduled cleanup is late.

### Public synthetic corridor contract

`/demo` remains a configuration-independent introduction linking to `/traffic`. The public traffic route reads only the owned synthetic corridor through one stable, security-invoker database snapshot; it never reads account cookies or starts an Auth session. The response contains explicit allowlisted fields and a database read timestamp. Invalid, denied, unavailable, unconfigured and empty data are distinct from a healthy snapshot.

One `?segment=` value controls list selection, map highlight and details, including direct links, history and refresh. Unknown, empty or duplicate IDs are explicit rather than silently replaced. Display UTC observations in Asia/Kolkata. Samples are recent only when their age is nonnegative and below twenty minutes; future and missing samples remain separate states. Refreshing does not change stored observation times. Scenario names are not congestion evidence.

Loading the optional background map requires an explicit action after an external-network privacy notice. Map failure must preserve the list/details and expose retry; hiding/unmounting releases map resources. No location request, navigation, incident cause, evidence promotion, delay calculation or route recommendation belongs to this foundation. Acceptance includes desktop/mobile keyboard and pointer selection, provider style/tile success and failure/retry, WebGL denial, backend outage/recovery, empty/stale/future/missing observations, public browsing during Auth failure and preservation of existing account sessions.

### Synthetic report submission contract

The first reporting slice persists manually located synthetic guest/account reports at L1 Reported, without incident grouping, location support, corroboration, recovery, alerts or receipts. Those remain separate phase requirements, not acceptance waived by submission success. No GPS, media, narrative or real-person data belongs to this slice.

- Prepare an explicit guest or current-account source; passive browsing creates no identity. Isolate guest/account cookies, prefer a verified existing account and never silently replace a failed account with a guest. Guest reporting access lasts 24 hours from preparation, independent of token refresh; private account routes and data remain unavailable to guests.
- Accept only source/request UUIDs, an exact directed segment, finite reported category and canonical UTC observation time. The database validates new observations within the preceding twenty minutes, derives identity/receipt time/provenance and atomically persists the private report plus minimal public projection.
- Bind each retry to its original owner, request and immutable content. Identical retries acknowledge the original; conflicting reuse never overwrites. Unknown transport outcomes retain a frozen browser draft for check/retry, and explicit discard is not deletion or cancellation.
- Serialize quotas: five new reports per source per rolling fifteen minutes, 300 per rolling hour globally, 2,000 retained reports and 5,000 sources. These limits do not prove independent witnesses or general spoof resistance. Keep the local reporting gate disabled by default and privileged operations outside the web app.
- Public snapshots contain only allowlisted report fields, never source/user/request identifiers. Map/list/details share direction-specific counts, explicit recent/stale labels and manual/simulated/unconfirmed provenance. Counts include repeated-source and stale reports; details may show the newest ten. Open tabs require refresh.
- Preserve report ownership/retry records across simulator replacement/reset through a durable segment catalog. An absent corridor hides unmatched reports and prevents new submissions. Expiry blocks guest access without depending on cleanup; synthetic records remain until explicit local dataset or expired-guest cleanup.

Acceptance includes actual guest/account authorization, anonymous exclusion from private policies, exact public projections, concurrent identical/conflicting retries, quota boundaries, expiry and account changes, database/Auth outages, committed-response loss, simulator preservation, and desktop/mobile submission-to-public-display flows in both local development and production. Hosted use and real-data retention require separate approval and verification. Operational contracts belong in [local reporting](reports.md); actual results belong in progress.

## Evidence and lifecycle contract

These thresholds are proposed demo assumptions, not calibrated field findings. Define exact eligibility and time boundaries in tests before implementation.

| Indicator | Implemented / Planned rule | Limit |
| --- | --- | --- |
| L1 Reported | Valid report tied to a server-issued guest or account source identity | Does not establish congestion/cause |
| L2 Location supported | Position overlaps selected segment with acceptable accuracy and explicit provenance | Location support only; simulated provenance stays visible |
| L3 Multiple sources | At least three eligible distinct reporting identities on the same segment/direction in the rolling interval `(read_at − 15 minutes, read_at]`; one contribution per source across the entire window | Distinct identities are not proven independent people; this does not establish location, congestion or cause |
| L4 Slowdown supported | At least three eligible synthetic sources below 40% of baseline speed for five minutes | Demonstrates a computable rule, not real-world truth |
| L5 Photo verified | Implemented via Google Gemini 2.5 Multimodal Vision API; analyzes scene authenticity and road hazards | Visual confirmation only; does not replace traffic telemetry |
| L6 Authority confirmed | Implemented in `/authority` dashboard; authorized municipal/police role action with immutable audit log | Never inferred from other indicators |

### Bounded report-group assessment

Group recent reports by exact corridor/segment/direction within `(read_at − 20 minutes, read_at]`, not category, distance or fixed quarter-hour buckets. This is a current report-group view, not a durable physical incident identity. Retained totals, recent reports and L3 eligibility are separate. A 17-minute-old report remains recent but cannot contribute to L3. Mixed categories and repeated fresh request keys never multiply a source's contribution; use observation time rather than receipt order. Guest evidence eligibility ends at absolute source expiry, while retained public reports remain until existing cleanup. Account roles add no weight; manual observations may predate source preparation. Simulator-device IDs are not reporting-source IDs.

The approved aggregate exception uses a dedicated read-only NOLOGIN/NOBYPASSRLS role, distinct from table owners and the writing executor, with column-limited private joins and explicit RLS. Its fixed, no-argument public function returns only per-directed-segment counts, threshold status and one reassessment deadline inside the same statement snapshot as traffic/report data. It cannot expose raw/hash/pseudonymous reporter identifiers, Auth owners, profile data, request keys, canonical payloads or per-source expiry lists. No application service key or client-controlled historical clock is permitted. Exact aggregate counts do not guarantee anonymity; this remains synthetic-only.

Assessments are labelled as of the database read. At their next time-dependent change, all shared displays must withdraw a positive current assessment and require refresh rather than invent a new private-source count. Handle delayed hydration, refresh timing and background-tab resumption conservatively without trusting device wall time. L2 remains unsupported for manual locations; losing L3 is not recovery or clearance. Persistent incident episodes, L4 slowdown, recovery lifecycle and delay remain separate Phase 4 requirements.

### Bounded L4 slowdown assessment

Derive L4 on the server from one validated public snapshot and its database read time; it requires no private reporter relationships or extra database privileges. For each directed segment, use the latest non-future sample time as the terminal window end. Require the same three or more synthetic sources at six synchronized timestamps exactly sixty seconds apart, spanning five complete minutes. Each complete source must have every required speed strictly below 40% of the unrounded baseline speed (`length_m / baseline_seconds × 3.6`). Extra off-grid observations within that window disqualify that source; never interpolate, carry forward values or ignore newer contradictory samples to select an older favorable window. Scenario labels and report/L3 counts do not determine L4.

Every required sample must lie in `(read_at − 20 minutes, read_at]`; a recent latest sample alone cannot validate a stale supporting window. Use exact stored timestamp/speed precision. Withdraw the current assessment at the earliest required sample's twenty-minute boundary or the next future sample becoming eligible, then require a fresh server read. Delayed hydration, request time, clock failures/skew and suspended tabs must not extend or recreate support. Future data never becomes supporting evidence from browser elapsed time alone.

Show complete synthetic-source counts, slowdown-supporting counts, sampled window and baseline assumptions consistently across map/list/details, separately from retained reports and L3 reporting identities. Missing, future, stale, insufficient and threshold-not-met states remain explicit. L4 is simulated slowdown support, not live/confirmed congestion, a confirmed cause, L2 location support or durable incident identity. Loss of L4, high-speed samples and fixture reset do not establish recovery/clearance. Delay stays unavailable without complete traversal records; persistent incidents, supported recovery and traversal-based delay remain subsequent Phase 4 requirements.

Keep reported categories separate from evidence of congestion; show Unknown when support is insufficient. Stale after 20 minutes without fresh corroboration; clear after five minutes of supported recovery above 70% of baseline. Any manual resolve needs defined authorization. Nearby parallel roads/opposite directions do not merge by radius alone.

**Attack:** repeated fabricated-cause reports from one source must not inflate eligible-source counts, promote corroboration or enable a traffic-supported receipt. Include concurrency/retries. This establishes only the tested duplicate-report control, not general Sybil or spoof resistance.

### Durable report-backed episode identity

Persist each accepted report's database-generated episode ID in its admission transaction, separately from directed-segment L3/L4 assessments. An episode groups reports, not confirmed physical incidents or causes. Group by exact durable corridor/segment/direction, never category, source identity, scenario name or geographic radius. Do not create slowdown-only episodes in this bounded slice; persisted speed-evidence ingestion, episode-specific corroboration, supported recovery/clearance and complete-traversal delay retain their separate Phase 4 acceptance gates.

Use observation-time continuity with frozen assignment intervals. The first episode has an unbounded lower interval boundary; the latest has no upper boundary and an observation high-water mark H. An observation t first joins any historical interval containing it; otherwise it joins the latest while t < H + twenty minutes. At t >= H + twenty minutes, freeze the previous upper boundary at H + twenty minutes and create a successor with that inclusive lower boundary. Intervals are lower-inclusive/upper-exclusive. Latest high-water marks only increase; historical boundaries and report memberships never move. Late reports never merge or split existing episodes. Arrival order can affect grouping; this is an explicit synthetic identity rule, not order-independent incident discovery. A grouping boundary is not clearance, and recent reports can belong to more than one retained episode.

Keep new-report admission, source eligibility and quotas unchanged. Identical retries return the original report and episode without allocation; conflicting retries reject. Serialize with the existing report/simulator lock and enforce directed foreign keys and one latest interval. Backfill retained reports in receipt-time/ID order without rewriting identities, payloads or timestamps. Public snapshots return episode IDs, directed references, creation time, retained-report count and first/latest retained observation times in the same statement as reports and traffic. Internal boundaries/high-water marks, owner/source/request identifiers and private payloads are not public. No public read repairs or mutates episode state.

Simulator replacement/reset preserves report memberships and episode metadata; absent segments hide unmatched rows, not clear them. Targeted source/Auth deletion removes its reports but retains minimal synthetic interval bookkeeping so surviving identities cannot change. Hide empty episodes. Full disabled reporting-dataset cleanup removes reports and all episode metadata atomically while preserving accounts and traffic fixtures. Cap episode bookkeeping at 2,000 rows; at the cap, joining/replaying existing episodes remains possible but allocating another returns rate-limited. This metadata-retention policy applies only to synthetic data, not approved real-person retention.

Acceptance covers exact twenty-minute/microsecond boundaries, late bridges, category/direction isolation, immutable retries, concurrent first reports, rollback, populated/empty backfill, metadata limits, direct privilege denial, source/Auth/full cleanup and reset/restoration. Map/list/details and report acknowledgement expose consistent unconfirmed episode references while retaining segment-scoped evidence labels. Verify desktop/mobile reporting, refresh/two tabs, stale/empty/error and account/privacy regressions in both development and production.

### Bounded recovery-evidence prerequisite

A pure internal recovery candidate is separate from persisted clearance. Evaluate an ordered twelve-timestamp proof on one directed segment: six synchronized one-minute samples strictly below 40% of the unrounded named baseline, immediately followed one minute later by six synchronized samples strictly above 70%. Both windows span five complete minutes; the whole proof spans eleven minutes. At least three identical bound synthetic sources must complete and support both windows. Missing, duplicate or off-grid rows within the proof disqualify their source; rotating cohorts and gapped transitions abstain. Compare thresholds using exact decimal cross-products, with equality failing. This adjacency/shared-cohort rule is a conservative demo assumption, not calibrated field evidence or the full future ingestion policy.

The recovery window must end at the latest non-future bound sample; do not cherry-pick an older favorable recovery. Abstain if another cohort of at least three complete sources still supports slowdown in that terminal window. All proof samples must lie in `(read_at − 20 minutes, read_at]`, preserving microseconds. The validity deadline is the earliest proof sample's expiry or the next future sample becoming eligible, conservatively floored to milliseconds. Missing, future, stale, invalid, incomplete, no-prior-slowdown, threshold-not-met, conflicting and noncontinuous-cohort states remain explicit. Scenario labels, reports, L3 and report episode IDs cannot establish this proof. Reuse the existing L4 evaluator without publishing historical slowdown as current support.

The internal result contains only directed reference, simulated provenance, proof windows, aggregate counts, finite state and deadline. It returns no source IDs, incident cause, episode association, durable cleared state or travel delay. No public read mutates state. Before exposing persistent clearance, separately specify immutable run/sample identities, authorized atomic ingestion, replay/conflict/late-evidence rules, retention, lifecycle-to-report association and slowdown-only visibility. Report assignment intervals remain immutable; replacement/reset is not recovery. These persistence and traversal-delay requirements remain required Phase 4 work before alerts.

### Immutable synthetic speed-evidence ingestion

Explicit local capture archives the current owned simulator generation under caller-retained run/batch UUIDs. It accepts no caller-provided speeds, baseline, provenance or acceptance clock. The first capture freezes the run's directed segment length/baseline seconds/label and synthetic source roster/bindings/labels. Later captures must match these descriptors; a change requires a new run. Scenario names, geometry, reports and account/private identities are excluded. The archive does not reference replaceable fixture rows, so simulator replacement/reset and report/Auth cleanup cannot cascade into it. Run-scoped source names establish no continuity or independence across different runs.

Samples are immutable by `(run_id, source_id, observed_at)` with exact persisted numeric speed and microsecond time, bound to the retained directed segment. Overlapping identical samples can appear in multiple batches without duplication; conflicting speed/binding/baseline or a reused batch ID with changed active content rejects the whole capture. Immutable batch membership, anchor, database acceptance time and internally computed SHA-256 canonical-content digest establish replay consistency, not a public signature or real-world authenticity. Identical batch replay returns original counts/acceptance before freshness/cap checks. A separate restricted check retrieves that acknowledgement even after replacement/reset; capture after changed input must not silently mean acknowledgement check.

New captures use the database clock after acquiring shared lock `(72861,3)` and require every sample in `(accepted_at − 20 minutes, accepted_at]`. No favorable subset is selected. New batch anchors within a run cannot regress; equal-anchor identical overlap is allowed. Late-arriving missing samples retain real acceptance metadata and do not retroactively create lifecycle transitions. Reject empty, future, stale or oversized generations. Per batch allow at most 50 segments, 500 sources and 5,000 samples; global bounds are 100 runs, 2,000 batches, 100,000 unique samples and 250,000 memberships. Check admission under the same lock; failures allocate nothing, no automatic eviction occurs, and original replay/check remain usable at capacity.

Ledger tables force row-level security and reject updates. A dedicated non-login, non-bypass executor has only needed synthetic-table reads and ledger inserts/reads/scoped deletion. Anon/authenticated roles cannot access the ledger or its RPCs; service maintenance may inspect rows and invoke capture/check/single-run cleanup, but cannot directly insert/update/truncate/delete ledger rows. Public readers and their privileges remain unchanged. Explicit confirmed run cleanup removes only its evidence and ends that run's retained replay guarantee; operators must never reuse deliberately deleted run IDs. This is immutable-while-retained synthetic evidence, not administrator-proof storage or persisted clearance.

Acceptance requires real database/API and rollback-only SQL tests for exact preservation, replay/conflicts, batch/sample identity, strict freshness/caps, concurrent capture, denied ordinary/direct service writes, immutable content, reset/cleanup survival and unchanged public projections. Test CLI guards, error sanitization and unknown-outcome check guidance. Lifecycle consumption, slowdown-only incidents, evidence-to-report association and complete-traversal delay remain separately required before Phase 4 completion.

## Delay and route-alert contract

Estimated segment delay is `max(0, complete observed traversal time − named baseline traversal time)`. Missing/partial observations or baselines return unavailable, not zero or a guessed number.

### Integrated persistent lifecycle and completed traversal contract

The separate prerequisites above compose into one Phase 4 public flow. Accepted retained batches process lifecycle atomically, independently of replaceable fixture reads. Persist slowdown-only incidents, strictly advancing support/withdrawal/clearance events, exact proof-sample references and a new successor UUID after recovery followed by renewed slowdown. Apply the same-run/direction exact L4 and ordered recovery rules above. Older/equal-terminal additions cannot rewrite history. Missing, stale or normal samples and simulator reset never clear incidents. Report-episode associations require full proof-window containment in immutable assignment intervals; cause remains unknown and segment-wide L3 remains distinct.

Generate explicit piecewise synthetic movement from distance zero to the full directed exit using the same authored schedule as sample generation. Persist only completed entry/exit observations, frozen source/batch/baseline references, full distance and database acceptance time. Entry must be strictly newer than acceptance minus twenty minutes; exit cannot exceed acceptance. Independently validate the exact first-microsecond exit against all contiguous retained source ticks, with at least six exact minute samples, piecewise-constant speeds and terminal continuation bounded by anchor plus twenty minutes; caller-supplied duration alone is insufficient. Stable completion UUIDs support immutable replay; conflicts reject atomically. Completed traversal capacity is 1,000 per run and 10,000 overall without eviction. Explicit speed-run cleanup cascades synthetic lifecycle/completion history and is never represented as clearance.

A new stable `read_traffic_phase4()` returns the original traffic envelope plus allowlisted incidents and per-direction traversal summaries from one database read clock. Restricted internal projectors may read synthetic history; public clients cannot supply clocks or run IDs, access private reporting identities or mutate state. Select the latest accepted batch's run for each exact direction before checking baseline compatibility or completion availability; never fall back to another run's favorable result. Historical clearance records its recovery observation end separately from database acceptance, so reopened observations are ordered against recovery end rather than arrival time.

List, loaded map markers, details and expandable history must agree on support, withdrawal, stale, historical clearance and reopening. Completed excess time expires at entry plus twenty minutes. Clock uncertainty, late delivery and tab suspension withdraw positive current claims without promoting future evidence. Reset hides absent directions; restoration reveals retained history without creating clearance. Test SQL/TypeScript rule parity, privileges, atomicity/retries/caps, whole-flow report/duplicate attacks, completed675−baseline180=495 seconds, zero and unavailable variants, and development/production desktop/mobile browser interactions before the Phase 4 exit gate.

Alert only for a corroborated incident affecting the selected primary segment/direction. Compare fresh compatible primary/alternative inputs. Show simulated estimated savings; abstain below five minutes, for missing/stale inputs or a known alternative hazard/closure. Test the exactly-five-minute boundary. A precomputed alternative is neither a safety guarantee nor a real routing engine.

### Integrated Phase 5 comparison and abstention

Keep the previous public RPC envelopes unchanged and add `read_traffic_phase5()` enclosing Phase4 plus an allowlisted comparison from one stable read clock. The fixed outbound memberships must remain exactly primary-west → primary-east and alternative-west → alternative-east; removing, substituting or reordering members must not redefine the comparison. Every directed segment in these fixed routes must select the same latest retained run and have an available completed traversal against the active frozen baseline. A newer incomplete/mismatched run causes abstention, never fallback to an older favorable run. Sum exact completed entry-to-exit microseconds for each route and subtract alternative from primary; neither latest-speed estimates nor baseline plus clamped excess replace actual completed durations. The sums represent independent synthetic segment traversals, not one observed end-to-end journey. Run, batch, source and private report identities stay internal.

The selected segment must be a primary member with a current supported, unexpired persisted incident from the same evidence context. L3 report counts or transient fixture slowdown alone cannot override absent, withdrawn, stale, historical or cleared lifecycle support. This supersedes the earlier parallel draft's L3-only/latest-speed approach while preserving its files unchanged. Compare the exact difference against300,000,000 microseconds before any presentation rounding. A current supported alternative incident, or a fresh directed alternative report categorized accident, road_repair, flood, landslide or road_closed, blocks recommendation. Report freshness is strictly newer than read minus twenty minutes and no later than read; a single such report may conservatively block but is never labelled a verified hazard.

Use explicit abstention reasons for unrelated selection, unavailable/incompatible/mixed-run inputs, unsupported lifecycle, alternative blockage and below-threshold difference. Share the decision and earliest incident/completion deadline across list, map and details. Clock uncertainty, delayed hydration, background suspension or expiry withdraws a positive alert; blocked/future/unavailable snapshots never promote merely through elapsed time. Refresh is required for recovery/withdrawal or changed-hazard updates. Alternative inspection changes the existing selection, without starting a journey or invoking a routing provider. No real-routing, road-safety or guaranteed-savings claim is permitted.

## Journey sharing, receipts and retention

### Active journey sharing

- Starting a journey is separate from consent to share. Preview exact fields and organisation before an explicit confirmation; show collection/sharing state and offer stop/end.
- Employer response allowlist: commuter reference, corridor label, normal/delayed/blocked status, estimated delay or unavailable, evidence summary and freshness. Name is optional only if explicitly selected/previewed.
- Never send employers raw coordinates, route geometry, home location, breadcrumbs, unrelated journeys or unrestricted history, including hidden response fields.
- Every read checks identity/role, current organisation membership, recipient, active consent and journey state. Stop/end removes subsequent server access; refresh/next update clears rendered data. Saved copies cannot be recalled.
- Refresh-based views state last updated and are not marketed as continuous live tracking. Stationary users/passengers are the intended reporting interaction context.

### Provisional receipt contract

Minimum payload: receipt ID, pseudonymous commuter reference, zone/segment, observation window, estimated delay or unavailable, baseline label, evidence summary, provenance, issuance/expiry, recipient organisation and signature. Any optional name must be previewed. Issuance requires an eligible owned journey and a corroborated incident relevant to that journey's segment, direction and observation window. Derive fields from that server-held evidence; an authenticated report or journey ownership alone is insufficient. Never sign arbitrary browser claims.

Canonical versioned signing, authenticated intended-recipient access, current expiry/revocation checks and minimal audit events are inseparable. Proposed access period is seven days. A receipt is an issuance-time snapshot, not evidence of current congestion; later clearance does not rewrite history.

Required limitation: “This summary reflects reported device observations and supporting traffic evidence. It does not prove who carried the device, when the journey began, or why a person arrived late.”

### Privacy defaults to finalize before real data

Core demonstration uses synthetic journeys. If optional real foreground GPS is added, collect only after an explicit action, process raw points locally/in memory without uploading them, and stop on end/permission withdrawal. A web app cannot promise reliable background tracking.

Proposed private-summary retention is up to seven days, distinct from receipt access duration. Define deletion/enforcement and retention separately for private summaries, receipt snapshots, consent/audit records and months of synthetic history before their implementation. No real-person data until notice, consent, access, retention/deletion and relevant legal review are approved. Coarse zone/time remains sensitive; consent does not eliminate workplace pressure or establish legal compliance.

## Analytics contract

Use deterministic dated synthetic incident/observation history for about five junctions across several months. Define working-day denominator, timezone/date boundaries, recurrence, unknown-cause handling and delay units before calculating cards/tables.

Rank hotspots and show cause mix, peak window, average/max delay, trends and monthly reason totals from common history. Define aggregate delay-hours using underlying observations if claiming commuter delay; do not relabel incident duration as total traveller delay. New demo incidents affect aggregates only inside the selected period; historical-only views explain their cutoff. “Suggested investigation” is the permitted conclusion, not an infrastructure prescription.

## Acceptance scenarios

These are targets, not results. Actual outcomes belong only in [progress](progress.md).

| ID | Scenario | Required outcome |
| --- | --- | --- |
| S1 | Genuine scripted slowdown | Explain eligible evidence; corroboration, map and details agree |
| S2 | Fabricated cause, repeated source and concurrent retry | No inflated eligible count or corroboration; no traffic-supported receipt when issuance exists |
| S3 | Missing/stale/malformed/insufficient observations | Explicit unsupported/unavailable state; no invented cause/delay |
| S4 | Expiry and supported recovery | Stale/cleared status consistent across current map/details/alerts |
| S5 | Known/missing baseline, partial traversal | Exact excess-time arithmetic or unavailable |
| S6 | Preview → consent → intended employer | Only selected allowlisted fields disclosed; provenance retained; receipt subcases in Phase 8 |
| S7 | Tampering, unauthenticated/wrong org/owner, altered role | Reject unauthorized access; no private content; receipt integrity subcases in Phase 8 |
| S8 | Receipt expiry/revocation, already-open view | Subsequent reads deny content; refreshed state clears it |
| S9 | Incident clears after receipt issue | Historical snapshot stays distinct; expiry/revocation still enforced |
| S10 | Empty, permission denial, provider/backend failure, session change | Clear states, no silent simulation fallback or previous-account data |
| S11 | Desktop/mobile/keyboard, direct links/history/refresh, two tabs | Usable complete flows, settled navigation and consistent shared readers |
| S12 | Affected/parallel route, threshold, stale/missing data, hazard | Relevant labelled estimate or abstention; no unrelated alert |
| S13 | Unshared/shared/stopped/ended journey, wrong org, open employer view | Only current authorized shares; stop/end denies next read and clears updated view; no geometry |
| S14 | History/empty period/unknown cause/date edge/new incident | Totals and recurrence reconcile with history; window inclusion explicit; CSV matches if built |

### Measurement targets

| ID | Target and qualification |
| --- | --- |
| M1 | All applicable enumerated scenarios pass; report failures individually |
| M2 | Zero promotions in enumerated duplicate-attack cases; report case count, not a general detection rate |
| M3 | Receipt access/integrity/lifecycle negatives pass and no forbidden employer fields when receipts are included |
| M4 | Proposed demo p95 report-to-map ≤3 seconds and receipt verification ≤1 second; record environment/sample count if measured |
| M5 | Exact fixture delay/savings arithmetic; unavailable without inputs |
| M6 | Proposed five-volunteer test: report within 20 seconds and at least four explain sharing correctly; never claim volunteers were tested unless run |
| M7 | Hotspot/recurrence/monthly totals equal independently computed fixture ground truth |

Use deterministic unit tests, real persistence/policy tests and end-to-end browser interaction. Field accuracy, general spoof resistance, calibrated precision/recall and battery impact are outside acceptance. Local production and hosted browsers are separate checks.

## Decisions and dependency gates

| Planning decision / unresolved dependency | Rule |
| --- | --- |
| Verified phases; one human plus AI | No assumed seven-day schedule or four parallel developers; small reviewed commits |
| Local Docker Supabase | Keep isolated development; hosted credentials/configuration require separate authorization |
| Supplied TrafficSense Mangaluru design | Follow visual baseline, correct claims, review material changes |
| Core seven modules before receipt extension | Preserve thin traffic/employer scope; explicit decision for any cut |
| Employer preference/minimum receipt fields | Ask whether limited status or receipts address the need; absent response, receipt remains provisional |
| Provider terms/keys/quotas/hosting | Confirm before dependent integration or deployment; never disable TLS/integrity checks to bypass failure |
| Privacy/retention/account policy | Approve/enforce before real data or public account use |
| Event deadline/timezone/rubric/pre-work/AI disclosure | Confirm before promising submission; product brief is not event rules |

User owns employer/event communication, access, final review and submission. AI implements bounded tasks under [the implementation workflow](implementation.md#rules-for-every-implementation-task). No implicit authorization to push, deploy to an unknown target, collect personal data or contact outsiders.

## Research and cost assumptions

These retained research notes are supplied context, not independently verified findings. Re-check primary sources, current prices, competitor features and legal dates before public claims. No “first,” “only,” winning-odds or adoption claim follows from this plan.

Crowd reporting, route alternatives and traffic analytics already exist. Employer transport tracking and Google trip sharing are substitutes. The possible differentiator is explainable evidence plus a minimal recipient-bound summary for self-commuters; one employer's problem statement does not validate adoption. A few searches not finding a direct receipt competitor is not proof of novelty.

### Retained source references

| Topic | Source / qualification |
| --- | --- |
| Roads analytics | [Google Roads Management Insights](https://mapsplatform.google.com/resources/blog/roads-management-insights-is-now-available-build-safer-smarter-and-more-efficient-road-networks/); [TraffiCure features](https://www.trafficure.com/features), [vendor webinar](https://www.trafficure.com/webinar/manage-your-city-traffic); vendor adoption claims need checking |
| Bengaluru tools | [IEEE](https://spectrum.ieee.org/bengaluru-traffic), [Arcadis ASTraM](https://www.arcadis.com/en/projects/asia/india/transforming-bengaluru-traffic-with-the-astram-initiative/), [reported app issues](https://www.deccanherald.com/india/karnataka/bengaluru/bengaluru-glitches-on-traffic-police-app-leave-users-frustrated-3690113) |
| Mangaluru context | [AI cameras/ITMS](https://newskarnataka.com/karnataka/mangaluru/mangaluru-smart-city-implements-advanced-traffic-management-technology/22052024), [signal trial](https://newskarnataka.com/mangaluru/trial-run-of-new-traffic-signals-in-mangaluru-creates-chaos-at-key-junctions/16092025/), [older road coordination report](https://www.deccanherald.com/india/karnataka/road-works8200dc8200tells-mcc-officials-coordinate-2049278); not proof of current analytics coverage |
| Employer transport | [MoveInSync](https://moveinsync.com/?p=34571), [Routematic context](https://www.cbinsights.com/company/1km-a-pied/alternatives-competitors); verify fleet versus self-commuter scope |
| Existing trip sharing | [Google Share trip progress](https://blog.google/products/maps/better-way-share-your-eta-google-maps/); compare current screens before positioning |
| Delay verification precedent | [NYC transit service](https://secondavenuesagas.com/2010/06/07/transit-unveils-online-delay-verification-app/), [lateness forms](https://paperform.co/templates/retail-store-employee-tardiness-report/); not validation of this road-receipt design |
| Crowdsourced trust | [SIH repository listing](https://github-redirect.dependabot.com/besthvr12/SIH-Hackathon), [UIC paper](https://www.cs.uic.edu/~jalowibd/uploads/ICM3423.pdf), [Sensors 2019 mirror](https://ltfe.org/reference/crowdsourced-traffic-event-detection-and-source-reputation-assessment-using-smart-contracts/) |
| Attack and open source | [99-phone precedent discussion](https://contrapunctus.codeberg.page/blog/traffic-data-for-osm.html), [Awaaz](https://fossunited.org/hack/fosshack26/p/90m5877fmp); investigate overlap rather than claim uniqueness |
| GPS/reports | [GPS accuracy](https://www.gps.gov/systems/gps/performance/accuracy/), [Waze classifier](https://www.mdpi.com/2078-2489/16/6/423), [snow-report research](https://arxiv.org/pdf/2311.10740), [coverage/timing study](https://dr.lib.iastate.edu/entities/publication/c399b90b-c4a9-410f-9600-ef8e655f91d3/full), [location matching](https://railroads.dot.gov/elibrary/evaluating-crowdsourced-data-waze-rail-safety); none is this application's benchmark |
| Legal context | [Hogan Lovells](https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-), [DSK](https://dsklegal.com/?p=26455), [Trilegal summary](https://trilegal.com/wp-content/uploads/2025/11/DPDPA.pdf); verify official obligations/effective dates, not legal advice |
| Costs/map limits | [Supabase pricing](https://supabase.com/pricing), [OSM tile policy](https://operations.osmfoundation.org/policies/vector/), [OSRM demo policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy); public demo endpoints are not assumed production services |
| Wider traffic context | [reported national congestion cost](https://www.newsbytesapp.com/news/india/bcg-analysis-says-delhi-mumbai-bengaluru-kolkata-lose-rs147lcr-annually/tldr), [mapping risks](https://restofworld.org/2025/google-maps-india-misdirection-fatal-accidents/), [Mappls comparison](https://www.digit.in/features/general/what-is-mappls-app-features-explained-how-is-it-compared-to-google-maps.html); verify originals before quoting, not Mangaluru measurements |

Optional validation work: ask the employer about receipt versus limited status; compare Google/Waze sharing/reporting screens; inspect Awaaz; ask 3–5 commuters what they would share; check local authority publications. Record replies and actual research only in progress, not as planned assumptions that became facts.

Goal: no cash cost for the synthetic demo, not a guarantee. Check hosting/database/tile terms, pause behavior and quotas. Preserve a labelled local fallback. Pilot arithmetic: 500 commuters ×22 working days ×2 trips =22,000 trips/month; 50,000 commuters is 100×. Illustrative payloads at 240×60-byte raw samples/trip are about 317 MB/month versus 20×100-byte summaries at about 44 MB/month, excluding overhead. This is an estimate, not permission to retain raw location.

Earlier illustrative routing cost assumed 24,200 monthly calls and third-party prices yielding about $190 or $70/month; Supabase Pro was reported as $25/month. Recheck official prices before budgeting; the core demo uses no routing API. Team time, hosting, tile egress and operations are not free by assumption. Validate possible manager time saved and disputes resolved rather than inventing impact figures.

## Planned demonstration and release

Demonstrate, in order: report and evidence; scripted duplicate attack; relevant alternative alert; explicit commuter sharing and employer stop/end; consistent hotspot/monthly history; optional receipt preview/verification/revocation. Explain simulated data and evidence limits throughout. Prepare a short narrative rather than promising unmeasured benefits.

Release requires the applicable checks in [Phase 9](implementation.md#phase-9--regression-release-and-handoff), user review and reproducible setup. Hosted acceptance needs authorized deployment and deployed browser tests. Confirm any event artefacts and deadline before scheduling submission; preserve a recovery buffer rather than starting new features immediately before it.
