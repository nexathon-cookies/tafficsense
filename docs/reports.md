# Civic Incident Reporting & AI Evidence Verification

This reporting flow supports the foundational pillar of **REPORT → VERIFY → ALERT → ANALYSE**. Reports originate as **L1 Reported · unconfirmed**, bound to exact GPS coordinates or snapped to a directed corridor segment. When photo evidence is attached, the system automatically triggers **L5 Multimodal AI Verification** (via Google Gemini Vision models) to analyze the scene for authentic physical disruptions before elevating corroboration.

## How Reporting Operates

Start the dedicated backend and application using [Docker development](docker.md).

### 1. Web Reporting Interface (`/report`)
- **Direct Citizen Reporting**: Navigate to `http://localhost:3000/report`.
- **Location Precision**: Commuters can use browser GPS fix (`Capture Current Location`), choose from 10+ Mangaluru landmark presets (Pumpwell, Ambedkar Circle, KSRTC Bejai, Ladyhill, etc.), or select a directed arterial corridor segment.
- **17 Categorical Hazards**: Aligned with Traffic_JAM.pdf specifications (Accidents, Road Closures, Monsoon Waterlogging, Landslides, Heavy Volume, Vehicle Breakdowns, Fallen Trees, etc.).
- **L5 Photo Verification**: Upload JPEG/PNG road incident photos. The integrated Google Gemini 2.5 Vision API inspects the image for authentic vehicle damage, road barriers, or standing flood water, returning a confidence assessment and evidence breakdown.
- **Session Auth or Guest Entry**: Signed-in commuters bind reports to their cryptographic profile; guest submissions receive a transient server-issued session identity without surrendering personal privacy.

### 2. Route Planner Modal Reporting Dialog (`/planner`)
- Commuters planning routes in `/planner` can click **"Report Hazard"** to open a modern backdrop-blurred modal dialog.
- Quick-select buttons for frequent hazards (💥 Accident, ⛔ Road Closure, 🌊 Flood, 🚧 Road Repair, 🚙 Heavy Traffic, 🌲 Tree/Hazard).
- Instant landmark coordinate injection and non-blocking toast notifications.

## Durable report episode references

Accepted reports and their acknowledgements include a database-generated `episode_id`. Expand **Report episode history** on the matching traffic segment to see each retained episode's ID, creation time, report count and first/latest retained observation times. The list, marker accessible description and details use the same retained-episode count. These are unconfirmed groupings, not active-incident counts. L3/L4 continue to assess the directed segment, not each episode; an observation span is not incident duration or measured delay.

Episode assignment uses the exact directed segment and observation time, independent of category or source. A gap of at least twenty minutes from the latest episode's observation high-water mark creates a successor. Historical assignment intervals are lower-inclusive/upper-exclusive and then remain fixed. Late reports attach to their interval without merging episodes or moving previous memberships; arrival order can affect this synthetic grouping. Exactly twenty minutes belongs to the successor. An interval boundary, stale report, high speed or simulator reset never establishes clearance.

Admission, episode allocation and report persistence share one serialized database transaction. Retries keep the original report and episode IDs. The public snapshot remains one read-only statement, and strict parsers check directed membership, counts and exact observation extrema. Internal assignment boundaries and high-water marks are denied to browser roles; the web application has no privileged key. Targeted source/Auth cleanup retains minimal synthetic grouping metadata but hides empty episodes. Full disabled reporting cleanup removes that metadata. There is a separate 2,000-episode metadata cap: at the cap, allocation is rate-limited, while eligible joins and retries remain possible.

Apply the additive migration with `docker compose run --rm supabase migration up --local` and deploy the matching application parser together; old parsers deliberately reject the expanded projection. `bash scripts/local-supabase.sh test-episodes --backfill` is a rollback-only migration rehearsal for the pre-migration schema, not a command to rerun on an already migrated database. After application, `test-episodes` runs persistence and transactional boundary checks; `test-episodes --schema-only` performs the read-only projection probe. No reset or full cleanup is required to apply the migration.

## Current report-group assessments

Each active directed segment has one assessment in the same database snapshot as its public reports. The list, map marker and details distinguish:

- **Retained reports:** all matching public rows, including stale and repeated-source rows.
- **Recent reports:** coherent observations strictly newer than twenty minutes before the read, with observation and receipt no later than the read.
- **Eligible reports:** recent rows strictly newer than fifteen minutes before the read, linked to a source created no later than receipt. Guest sources must still be within their absolute lifetime; account sources have no guest expiry. A manually rounded observation may predate source preparation.
- **Eligible sources:** each reporting identity counts once across the entire rolling fifteen-minute window, regardless of category, request key or repeated submissions. Three or more yield **L3 Multiple sources**.

These are current segment/direction groups, not identified physical incidents. L3 does not mean independent witnesses, supported location, confirmed congestion or a confirmed cause. Reports remain L1 Reported with manually selected location and no L2 location support. Missing evidence never means the road is clear. Assessment uses all retained rows, not just the ten displayed reports.

Counts are labelled **as of data read**, not live. The database supplies the earliest time-driven change, including observation aging and eligible guest expiry. At that deadline all shared surfaces withdraw the current assessment and ask for refresh; the browser never guesses private source decrements. Timing includes navigation/request loading and hydration and is checked on focus/visibility changes. Unknown timing is historical until refresh. A conservative early expiry is possible after client navigation or a forward device-clock change. Future-dated observations remain future/unsupported until a new database read; conservative elapsed time can expire evidence but cannot promote it. Refresh reads the database again; it never makes an old observation recent. Source expiry removes eligibility without deleting retained public rows.

The sole privileged public-read exception is `read_report_assessments()`: a stable, no-argument, aggregate-only function owned by a read-only, non-login, non-owner, non-RLS-bypassing role. Its column grants allow only private report/source linkage and source kind/creation/expiry plus required public fields. It cannot read owner IDs, request payloads, Auth or profiles. Public output contains only segment/direction, retained/recent/eligible report counts, eligible source count, the multiple-source flag, deadline and simulated provenance. The outer `read_traffic_demo()` remains a single-statement security-invoker snapshot. Direct private-table access stays denied; no privileged application key is used.

## Synthetic slowdown evidence

L4 is derived on the server from the same validated public snapshot, without another RPC, private-source access or writes during reads. It is independent of L3 reporting identities and report categories. Source bindings, speed samples, baseline and database read time determine the result; scenario names do not.

For each directed segment, the latest non-future sample ends a five-minute window. The same three or more synthetic sources must each supply six synchronized timestamps exactly sixty seconds apart, with every speed strictly below 40% of the unrounded assumed baseline speed (`length_m / baseline_seconds × 3.6`). Exactly 40% does not qualify. Missing ticks, repeated/conflicting samples and extra off-cadence observations do not count as complete sources. No interpolation or older favorable-window selection is performed.

All six required timestamps must be newer than twenty minutes before the database read. The earliest required sample's expiry or the next future sample becoming eligible invalidates the assessment and requires refresh. Stored microseconds are preserved for cadence/freshness checks; display deadlines round down. The same conservative clock withdraws L3/L4 across map, list and details, including delayed delivery and suspended tabs. Complete synthetic-source counts remain separate from slowdown-supporting counts; stale windows retain their times but show zero eligible counts.

L4 means **simulated slowdown support as of a sampled window**, not live/confirmed congestion, location support, independent witnesses or a confirmed reported cause. Higher speeds, loss of L4 and simulator reset do not establish recovery or clearance. Durable incident lifecycle remains a separate step. Speed samples do not establish completed traversal time, so delay and route savings remain unavailable.

Run `bash scripts/local-supabase.sh test-slowdown` for real persisted-fixture checks. Use `SLOWDOWN_BROWSER=true` with the browser command below (instead of the report/evidence flag) for normal/slowdown/recovery inputs, strict threshold/cadence cases, shared L4 state, real report retries, L3/L4 independence, two-tab refresh and deadline/delayed-response/frozen-tab checks at 1440/390/320px. Run mutation/browser suites serially and repeat on rebuilt production.

## Identity and privacy

- Browsing `/`, `/demo`, `/traffic` or the initial report form neither creates an identity nor reads account data. Background map loading remains a separate explicit external-network choice.
- Explicit guest preparation creates a Supabase anonymous identity in an HTTP-only, same-site `trafficsense-report-guest` cookie namespace, separate from `trafficsense-auth`. Guest reporting access expires 24 hours after first preparation; refreshing a token does not extend that period.
- An existing account takes precedence. A broken account session never silently becomes a guest submission. Guest identities cannot read private account/organisation records or acquire private-route access, even if a malformed legacy profile exists.
- Every submission and acknowledgement checks the current verified identity against the prepared source. Logout, cookie loss, expiry or account switching does not transfer a pending draft to a new source.
- Public report fields are only `id`, `episode_id`, `segment_id`, `direction`, `category`, `observed_at`, `received_at`, `provenance` and `location_provenance`. Source/user/request identifiers and canonical retry payloads remain private. Observation and receipt times are public; use synthetic examples only.

The application uses the unprivileged API key and verified session. A dedicated non-login, non-RLS-bypassing database executor owns narrow functions but not their tables. Direct client writes and private-table reads are denied. Guest identities are excluded from account profile creation and account-only policies. Local anonymous signup is limited to 30 per hour per IP; this and source quotas do not establish person-level abuse resistance. Public deployment needs separate security, abuse and privacy review.

## Persistence and interrupted submissions

The database atomically stores a private immutable report and its minimal public projection. The prepared source and request UUID identify a retry: identical input returns the original acknowledgement, while changed content with the same key conflicts. Replay does not consume another quota reservation. The observation time is validated only for a new report, so an old accepted request remains replayable while its owner retains access and reporting is enabled.

Before dispatch, the browser saves the exact draft in session storage. A timeout or lost response is **unknown**, not proof of failure. Keep the draft and use **Check saved status** or **Retry unchanged report**. Reloading retains this reference in the same tab. Clearing storage or closing the tab can lose it; the public report can still exist. Explicit discard removes only the local reference and does not cancel or delete a report. Confirmed validation, segment or quota rejection allows correction; an uncertain outcome stays frozen.

New-report limits are five per source per rolling fifteen minutes, 300 globally per rolling hour and 2,000 retained reports, with a 5,000-source cap. Database serialization enforces limits during concurrent requests. These are local-demo limits, not general spoof or multiple-identity defenses.

The durable directed-segment catalog is independent of the replaceable simulator fixture. Resetting the simulator preserves reports and retry keys; an empty fixture hides unmatched reports and prevents new submissions. Restoring the corridor exposes matching reports again. Reports become stale at twenty minutes; a stale report is not a cleared incident.

## Disable and clean up

```bash
bash scripts/local-supabase.sh reports disable
bash scripts/local-supabase.sh reports cleanup --confirm
bash scripts/local-supabase.sh reports cleanup-expired-guests --confirm
```

Disabling blocks preparation, submission and acknowledgement checks but preserves public browsing and stored reports. Dataset cleanup requires reporting to be disabled and removes report rows, sources and all episode metadata; traffic fixtures and Auth accounts are preserved. It also removes retry records, so old references can no longer acknowledge earlier reports.

Expired-guest cleanup verifies each selected Auth user is still anonymous before deletion, processes at most 100 per invocation and cascades that guest's reports. It preserves unrelated accounts, traffic fixtures and minimal synthetic episode interval metadata; empty episodes are hidden, and remaining memberships never change. Guest expiry itself blocks access even before cleanup; no scheduled deletion or automatic retention period is claimed. Synthetic records otherwise remain until local cleanup. The local operator commands require the exact configured demo endpoint and receive privileged status only through stdin, never through the app environment. Errors can have unknown outcomes; inspect local state before retrying destructive operations.

## Checks

Run database-mutation/browser suites serially because they temporarily share the corridor and reporting gate. They restore the prior fixture/gate and remove only test-owned identities and reports. An interruption needs local inspection before another run.

```bash
docker compose run --build --rm checks
bash scripts/local-supabase.sh test-reports
bash scripts/local-supabase.sh test-evidence
bash scripts/local-supabase.sh test-slowdown
bash scripts/local-supabase.sh test-episodes
bash scripts/local-supabase.sh test-traffic
bash scripts/local-supabase.sh test
bash scripts/local-supabase.sh test-browser-recovery
DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)" docker compose run --rm supabase db lint --local --fail-on error
```

With local Chromium's debugging endpoint running on port 9333, run real report interactions in Docker:

```bash
set -euo pipefail
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose run --rm -T supabase status --output json |
  docker run --rm -i --init --network host --user 1000:1000 \
    --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
    -e APP_URL=http://127.0.0.1:3000 -e REPORTS_BROWSER=true -e TRAFFIC_NARROW=true \
    trafficsense-demo node tests/traffic-browser.mjs
```

Repeat with port 3001 after rebuilding production. Replace `REPORTS_BROWSER=true` with `EVIDENCE_BROWSER=true` for report-group, source-count and expiry interactions at 1440/390/320px. The evidence fixtures require no pre-existing recent reports on their controlled segments and refuse to remove unrelated rows. `test-evidence` includes real account/guest API checks and rollback-only SQL tests for exact time boundaries and column grants. Run without either browser flag for the existing traffic regression suite. The recovery wrapper runs account, traffic and report suites against isolated development/production fault services, then missing-configuration apps; it forwards `CHROMIUM_DEBUG_URL` when using another local Chromium endpoint. Its test-only proxy can discard a real submission response after the backend commits, allowing browser verification that retry creates no duplicate. No runtime fault-control endpoint is added to the application. Screenshots contain synthetic traffic/report surfaces and are stored in ignored `supabase/.temp/browser/`.
