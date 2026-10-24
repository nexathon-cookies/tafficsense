# Local synthetic traffic data

This foundation supplies module 2's public corridor data, module 5's fixed route definitions and inputs for module 4's later evidence rules. See [phase order](implementation.md), [scope](plan.md) and [verification status](progress.md). Synthetic inputs alone do not establish corroboration, cause, travel delay or route savings.

## Run locally

Use Docker and the dedicated local Supabase backend described in [Docker development](docker.md). Apply migrations with `bash scripts/local-supabase.sh start`. These commands replace only the owned `mangaluru-central-v1` dataset:

```bash
bash scripts/local-supabase.sh simulate normal
bash scripts/local-supabase.sh simulate slowdown
bash scripts/local-supabase.sh simulate recovery
bash scripts/local-supabase.sh simulate slowdown 2026-10-15T04:00:00.000Z
bash scripts/local-supabase.sh simulate reset
```

The default anchor is **2026-10-15T04:00:00.000Z**, never the machine's current clock. An explicit anchor must be a canonical millisecond UTC timestamp in 2000–2099. Fixed historical timestamps are not fresh traffic. The public reader compares observation times with its database read timestamp, then advances freshness conservatively in an open page, including after background suspension. Reset removes this corridor and its dependent synthetic rows, not accounts, organisations or unrelated corridors. Replacement and reset serialize through a transaction lock; a failed replacement rolls back to the previous dataset. Separate HTTP reads can cross a replacement boundary; `read_traffic_demo()` returns the public fields and `read_at` in one stable, security-invoker SQL statement instead.

The command requires `DEMO_MODE=true`, the exact internal local Supabase URL and local CLI status supplied through stdin. Privileged keys remain in the process, never command arguments or output. Requests have a 15-second deadline. A timeout or transport failure leaves the outcome unknown; inspect the dataset before retrying rather than assuming rollback. Database functions require the service role; even the signed-in demo admin cannot call them. There is no browser simulation/reset endpoint. A future browser control requires server-enforced demo mode **and** admin authorization, with separate tests.

## Contracts and limits

- `src/lib/traffic/simulator.ts` exports the typed fixture and a pure `createTrafficFixture(scenario, anchor)` generator. Identical inputs yield identical fresh object graphs.
- Dedicated `demo_traffic_*` tables hold corridors, directed segments, routes, ordered route segments, segment-bound sources and observations. Guests and authenticated roles can read these synthetic tables without an auth session; normal clients cannot mutate them.
- Coordinates use GeoJSON `[longitude, latitude]` order. Hand-authored lines near Mangaluru are schematic, not surveyed roads or navigation guidance. Lengths and baseline traversal seconds are named assumptions, not measured city traffic or geometry-derived distances.
- Two outward routes share endpoints. A separate reverse-direction segment prevents its samples being treated as outward traffic. Segment and source IDs are stable within the corridor.
- Each fixture has five segments, three labelled sources per segment and twelve one-minute samples: **180 observations** over eleven complete minutes ending at the anchor.
- Normal speeds come from assumed length/time. Slowdown affects only `primary-west`, at 8 km/h for the last seven samples (six complete minutes). Recovery begins with six low-speed samples, then six samples at 28 km/h (five complete recovered minutes). Nearby alternative and reverse-direction segments remain unaffected.
- Observations store km/h, UTC time and simulated provenance. Composite foreign keys bind each sample to its corridor, segment, source and anchor; unique keys reject duplicates. Geometry, baseline, speed, direction and time-window constraints reject malformed data.
- All rows are public synthetic demonstration material. Never put private journeys, account identities, real GPS observations or reported incident evidence into these tables. Later private data needs separate schemas and authorization. Replacement retains only one synthetic scenario, not historical analytics.

## Retained synthetic speed evidence

`speed-evidence` is an explicit, local operator archive separate from the replaceable public fixture. Apply migrations first. Generate and retain a lowercase UUID for the run and another for the batch **before** capture; set them as `RUN_ID` and `BATCH_ID` below. A UUID is a synthetic archive reference, not an account, report episode or real incident identity. The default fixed simulator anchor is historical and will fail new-capture freshness admission. To demonstrate capture, explicitly install a current synthetic generation:

```bash
bash scripts/local-supabase.sh simulate recovery "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
bash scripts/local-supabase.sh speed-evidence capture "$RUN_ID" "$BATCH_ID"
bash scripts/local-supabase.sh speed-evidence check "$RUN_ID" "$BATCH_ID"
```

Capture accepts only these IDs, copying the current owned database fixture while holding the same transaction lock as replacement/reset. It stores exact baseline components/label, directed segment and synthetic source bindings/labels, sample times/speeds, batch membership and database acceptance time. It does not ingest scenario names, geometry, reports, private identities or derived clearance/delay. First capture freezes the run's complete descriptor/source roster. A changed baseline, direction, source binding or roster requires a new run. Same source names in different runs never establish continuity or independent witnesses.

An identical retained batch replay returns its original acknowledgement without allocating rows, including after its observations become stale. Overlapping batches share identical sample rows; conflicting speeds or changed descriptors reject atomically. A changed active generation with a reused batch UUID is a conflict, not a retry acknowledgement. **After a timeout, use `check` with the original IDs first**, including after fixture replacement/reset. A missing acknowledgement means none is currently retained; it is not proof that a deliberately deleted run never existed. Never silently generate replacement IDs to retry an unknown outcome. All requests have a 15-second client deadline, and credentials remain in process stdin/memory rather than arguments/output.

New batches require every sample strictly newer than acceptance minus twenty minutes and no later than acceptance; exact timestamps are preserved. Anchors cannot regress within a run. Partial/off-grid sample collections may be retained when otherwise valid; storage is not proof of supported slowdown or recovery. Per batch limits are 50 segments, 500 sources and 5,000 samples. Global limits are 100 runs, 2,000 batches, 100,000 unique samples and 250,000 batch memberships. Capacity rejection allocates nothing and never evicts data; existing replay and check still work. An internal SHA-256 digest checks canonical replay content, not authenticity or a public signature.

The `speed_evidence_*` archive is private to trusted local maintenance: ordinary guest/account roles cannot read it or invoke its RPCs. The service role can inspect records and call capture/check/scoped cleanup, but cannot mutate ledger tables directly. The dedicated executor uses forced row-level security; accepted rows reject updates. This is immutable **while retained**, not tamper-proof against database administration. Simulator reset/replacement, report cleanup and Auth deletion preserve retained evidence. Deliberate removal is a separate single-run action:

```bash
bash scripts/local-supabase.sh speed-evidence cleanup "$RUN_ID" --confirm
bash scripts/local-supabase.sh test-speed-evidence
```

Cleanup preserves other runs, live fixtures, reporting settings, reports/episodes and Auth. It deliberately removes that run's derived incident history and completed traversals and ends its replay guarantee; **never reuse a deliberately deleted run UUID**. Public reads never mutate the ledger or disclose run/batch/source identities from it. See the [ingestion design and acceptance contract](plan.md#immutable-synthetic-speed-evidence-ingestion) and [actual verification status](progress.md).

## Persisted incident lifecycle

Accepted batch membership atomically processes the retained same-run, exact-direction evidence. At least three synthetic sources, each with six exact one-minute samples spanning five minutes strictly below 40% of the frozen baseline speed, can create an incident without a report. Later strictly advancing terminal windows can update support or withdraw it. Missing, incomplete, stale or merely normal-speed evidence is not clearance. Equal-terminal late additions do not rewrite prior transitions; a newer terminal is required for a new positive transition. Read-only revalidation can withdraw a current claim contradicted by newly accepted samples, and later favorable additions at that same terminal cannot promote it again.

Clearance requires the same three or more sources across adjacent six-tick slowdown and recovery windows. Every recovery sample must be strictly above 70% of the baseline; a qualifying conflicting terminal slowdown cohort blocks clearance. Clearance records its historical evidence and acceptance time. A subsequent qualifying slowdown opens a new incident UUID referring to the earlier cycle. This never claims a real incident cause or current road safety.

Report episodes remain separate immutable groupings. Temporal associations require the entire proof window to fit their immutable directed assignment interval; associations neither verify the reported cause nor turn segment-wide L3 into episode-specific corroboration. Cleanup of reports hides their public association without erasing retained transition evidence.

## Verification evidence ladder (L1–L6)

Aligned with the product brief §4, TrafficSense classifies segment corroboration into six hierarchical verification levels. Active implemented rules are strictly separated from baseline expectations:

- **L1 — Reported (Active)**: A citizen or demo user submits a problem report with an explicitly selected segment or snapped GPS coordinate (`/report`). This tier indicates user awareness but carries unconfirmed evidential weight.
- **L2 — Location support (Active / Snapped)**: Spatial verification matching the reporter's coarse or device position to the corridor segment without storing personal track logs or background GPS.
- **L3 — Multiple sources (Active)**: Corroboration threshold requiring $\ge 3$ independent source reports on the same directed segment within a rolling 15-minute window (`assessSegmentReports()`).
- **L4 — Speed slowdown (Active / Telemetry)**: Quantitative speed proof requiring $\ge 3$ continuous sources across a 5-minute rolling window falling strictly below 40% of the baseline traversal speed (`evaluateSlowdown()`).
- **L5 — Photo/video verified (Active / AI Multimodal)**: Citizen-submitted photo evidence analyzed by Google Gemini 2.5 Multimodal Vision API (`verify-incident-photo.ts`) for authentic road obstacles, flooding, or collision damage.
- **L6 — Authority action (Active / Official)**: Official on-site confirmation, police dispatch, or verified clearance logged by authorized public bodies through the `/authority` review panel with immutable audit logging.

Each level represents independent qualification; achieving L4 does not imply L5 or L6. Completed and active tiers display solid badges with status labels, while unverified states display transparent warning indicators across the UI and technical disclosures.

## Completed synthetic traversal delay

The local operator generates explicit piecewise forward motion from entry distance zero to exact segment exit using the authored schedule validated against a retained batch. A speed change integrates both motion intervals. A partial journey is not a completion; length divided by the latest sample is never substituted. Completion ingestion freezes exact entry/exit timestamps against the retained source, direction, full segment distance and named baseline. The database independently integrates the referenced batch/source's entire contiguous schedule (at least six exact one-minute samples), holding each speed until the next sample and the last speed only through anchor plus twenty minutes. It accepts only the exact first microsecond reaching the exit. Forged durations, stationary/incomplete/gapped/off-grid schedules and incompatible legacy completions cannot become available delay.

```bash
bash scripts/local-supabase.sh traversals generate "$RUN_ID" "$BATCH_ID" "$SOURCE_ID" "$TRAVERSAL_ID" "$ENTERED_AT" "$UNTIL"
bash scripts/local-supabase.sh traversals check "$TRAVERSAL_ID"
bash scripts/local-supabase.sh test-lifecycle
bash scripts/local-supabase.sh test-traversals
bash scripts/local-supabase.sh test-phase4
bash scripts/local-supabase.sh test-phase4-browser
```

Use explicit UTC timestamps and stable UUIDs; check the original traversal UUID after an unknown outcome rather than allocating another ID. Credentials arrive through the same local-only stdin guard as speed capture. Partial generation exits without ingestion. Retained completions reject updates and conflicting retries; capacity is 1,000 per run and 10,000 overall, with no eviction. Run cleanup cascades completions.

Excess time is `max(0, exited_at − entered_at − baseline_seconds)` using exact microseconds until presentation. The example of a 675-second completed simulated traversal against the named 180-second baseline yields 495 seconds. Normal/faster completed travel yields zero; absent, partial, stale, future, invalid or incompatible evidence yields unavailable, never zero. This is one synthetic traversal, not personal lateness, incident-caused delay, route savings or an average commute.

## Coherent public evidence read

`read_traffic_phase4()` encloses the unchanged `read_traffic_demo()` traffic envelope with allowlisted `incidents` and one `traversals` row per active direction. All data uses one stable SQL snapshot/read clock. Internal timestamp-accepting projection helpers are inaccessible to anonymous, authenticated and service-role clients. The dedicated public reader has no write privileges or private report/source access.

For each direction, the most recently accepted retained batch selects the run; baseline incompatibility and missing completions never fall back to older favorable records. Historical clearance remains historical. Simulator replacement/reset does not process or clear incidents. Reset hides history while the corridor is absent; restoring it makes retained compatible history visible again. The map marker labels, list, details and incident disclosures share one server result and conservative elapsed clock. Support and traversal delay expire on time or clock uncertainty without inventing recovery; a refresh is required for new positive evidence.

## Fixed alternative-route alerts

`read_traffic_phase5()` encloses the unchanged Phase 4 snapshot and an allowlisted comparison at the same database clock. Both fixed outbound routes must retain their exact ordered membership: primary west/east and alternative west/east. Missing, substituted or reordered members cannot shorten the comparison or omit a hazard. Every segment must select one identical latest retained run with fresh, compatible completed motion. Missing, stale, future, invalid, incompatible or mixed-run evidence yields explicit abstention without substituting baseline times or older favorable completions.

The comparison sums actual entry-to-exit microseconds for each route, then subtracts the alternative sum from the primary sum. The difference must reach **300,000,000 microseconds** before display rounding. These are independent synthetic segment traversals, not one continuous end-to-end trip, measured commuter savings, navigation or a safety guarantee.

An alert also requires a current supported persisted incident on the selected primary direction, privately bound to that run. Report counts and transient fixture slowdown cannot replace it. A supported alternative incident or a recent alternative report categorized accident, road repair, flood, landslide or road closed blocks the alert. Report timestamps use exact microseconds in `(read − 20 minutes, read]`; the reported hazard remains unconfirmed.

List, map accessible labels and selected details use the same decision and conservative expiry clock. **Inspect fixed alternative** changes only the existing segment selection and browser history; it starts no journey, tracking or sharing. Positive alerts expire at the earliest supporting incident/completion deadline. Abstentions never become alerts merely because a report ages out; explicit refresh is required for changed evidence.

```bash
bash scripts/local-supabase.sh test-route-alerts
bash scripts/local-supabase.sh test-route-alerts-browser
```

Apply migrations before using the reader. The database suite exercises exact thresholds, fixed membership, latest-run selection, unavailable states and restricted privileges. The browser suite requires local development and rebuilt production previews plus Chromium on port 9333; it runs serially at desktop/mobile widths and restores owned fixture/report/evidence mutations. Run it separately from other database or browser fixture suites. See [progress](progress.md) for results rather than inferring a pass from these commands.

## Public browsing and optional map

Open `/demo` and choose **Browse synthetic traffic**, or open `/traffic` directly. A single `?segment=` parameter selects the same directed segment in the accessible list, details and optional map. Browser history and refresh preserve the selected ID; invalid or duplicate selections are explicit. Data refresh rereads the database but does not generate samples or change their timestamps. No sign-in, anonymous Auth session, location permission or private-table access is needed.

The stored scenario is separate from sample freshness. Timestamps display in **Asia/Kolkata**. Samples at least twenty minutes old are stale; future-dated and missing samples have their own labels. Baselines and geometry are assumptions. Colours identify routes/direction, not congestion severity; synthetic sources are not independent witnesses. L3 report counts and L4 slowdown support remain separate indicators, not confirmation of a real incident or cause. Persisted synthetic recovery, completed-traversal excess time and qualified fixed-route comparisons use the retained evidence described above; report counts alone cannot produce a route alert.

**Load map** opts into external requests to OpenFreeMap and its delivery providers, following a privacy notice. MapLibre GL JS 6.14.0, CSS and the worker are bundled with the app; no runtime script CDN or API key is used. The Liberty background uses OpenStreetMap/OpenMapTiles data. Attribution remains below the canvas at narrow widths; `/map-notices.txt` contains the renderer license and provider/data/style notices. Provider terms and privacy are linked there. No offline/bulk download is implemented. The service has no uptime guarantee; failed provider requests or unavailable WebGL show **Retry map** while the list/details remain usable. **Hide map** releases map resources.

Unconfigured, unavailable/denied, invalid and empty backend responses never substitute hardcoded healthy data. The static home/guest introduction remains available independently. Simulator commands are operator-only local tools, never public browser actions.

## Verification commands

```bash
docker compose run --build --rm checks
bash scripts/local-supabase.sh test
bash scripts/local-supabase.sh test-traffic
```

Seed local demo accounts before integration tests. The traffic suite exercises public reads, all account roles, denied writes/functions, rollback, concurrent replacement and scoped reset; it restores any prior owned fixture and removes its unrelated sentinel. Run it serially with other traffic mutations and account-changing tests. Database checks do not replace browser or later evidence acceptance.

With the local Chromium debugger on port 9333 (see [authentication browser setup](auth.md)), run the traffic browser suite separately for development and a rebuilt production preview:

```bash
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose run --rm -T supabase status --output json | docker run --rm -i --network host --user 1000:1000 \
  --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
  -e APP_URL=http://127.0.0.1:3000 -e TRAFFIC_NARROW=true \
  trafficsense-demo node tests/traffic-browser.mjs
bash scripts/local-supabase.sh test-browser-recovery
```

Use port 3001 for production. The traffic suite uses real CDP pointer/keyboard input, network completion checks, provider style/tile blocking and WebGL denial; default widths are 1440/390px and `TRAFFIC_NARROW=true` adds 320px. It replaces/resets the owned synthetic fixture during checks and restores the prior fixture in cleanup. Run serially with database mutations. Screenshots stay in ignored `supabase/.temp/browser`; account forms are not captured. The recovery runner includes traffic database/Auth failures on isolated ports 3002/3003 and unconfigured browsing on 3004/3005, then removes those test services.
