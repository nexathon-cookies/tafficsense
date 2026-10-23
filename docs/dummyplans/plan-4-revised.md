# TrafficSense — Plan 4 (revised): One Working System (Hackathon Build)

Source of truth for requirements: `Traffic_JAM.pdf` (Smart Mobility & Traffic Intelligence).
The earlier long-form draft of Plan 4 (self-hosted Valhalla, probe pipeline) is kept as the long-term roadmap (section 14), not as the build.

Date written: 18 Oct 2026. Deadline: about 21 Oct 2026 — **confirm the exact time, time zone and submission format today** (repo link, deployed URL, video, form). Builder: one person plus an AI coding agent.

---

## 1. Goal in one sentence

A user opens the app, picks **any** start and destination in Mangaluru, gets **real routes** on a real map, can **report an incident at their real location**, sees it **verified by rules the server enforces**, gets **re-routed around verified incidents**, can **consent to share a real journey time-over-estimate with an employer**, and an authority can see **hotspots computed from the stored data**.

If a feature does not serve that sentence, it is out of scope.

## 2. What is real and what is not (say this in the demo)

| Part | Status | Label in UI |
|---|---|---|
| Map, roads, places | Real (OpenStreetMap via hosted services) | OSM attribution on every map |
| Routes and alternatives | Real routing, **free-flow estimate only** | "Estimated, no live speeds" |
| Incident reports | Real rows from real users at real GPS points | Verification level shown |
| Verification L1–L4, L6 | Real rules run on the server | Level + reason shown |
| Journey time over estimate | Real trip time minus the free-flow estimate, computed on server. Includes lights, stops and rider pace, so it is **not** a congestion measurement | "Time over free-flow estimate" |
| Live speed for every road | **Not available** (needs many users or a paid feed) | Never claimed |
| 12 months of history | **Not available** | Optional "Demo history" toggle, clearly labelled |
| Photo evidence (L5) | Stretch only | — |

Rule: every number shown carries a provenance label: `measured` (e.g. trip duration), `reported`, `estimated`, `demo`. The app never states a cause for a journey's extra time unless a verified incident is linked.

## 3. Scope mapped to the PDF's 7 MVP modules

| # | PDF module | What gets built | Must / Stretch |
|---|---|---|---|
| 1 | Registration and login | Already done (roles: passenger, employer, authority, admin) | Done |
| 2 | Live GPS + traffic map | Planner: search or tap for start/end, "my location", route + alternatives, incident markers | Must |
| 3 | Incident reporting | Report form with all PDF categories, GPS and time attached automatically | Must |
| 4 | Incident verification | Levels L1–L4 and L6 enforced in the database | Must |
| 5 | Alternative route alert | Verified incident on route → re-route avoiding it, with the reason named | Must |
| 6 | Employer dashboard | Consent-based shared journeys showing time over free-flow estimate | Must (cut line, see 11) |
| 7 | Analytics and monthly report | Hotspots, causes, delay hours, recurrence from stored rows, CSV export | Must |

Also from the PDF if time allows: voice or photo report (stretch), emergency SOS (out of scope), notifications (in-app banner only).

## 4. Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Existing Next.js + Supabase + MapLibre | Keep |
| Map tiles | OpenFreeMap (already used) | Fine for a demo; show attribution |
| Routing | OpenRouteService (free API key), called **from a server route only** | Supports alternative routes and `avoid_polygons`. Verify current limits and terms. Fallback: public OSRM demo server (no avoid support, so avoidance would be approximated by picking another alternative) |
| Geocoding | ORS geocoding or public Photon | Verify usage policy. Debounce and cache searches |
| Database | Supabase Postgres + PostGIS extension | For distance queries |
| Hosting | Vercel + hosted Supabase | Deploy by Day 3 morning |

Never expose the ORS key to the browser. Add a per-user rate limit on the route API.

## 5. Data model (new tables; leave the old simulation tables alone)

All tables have RLS on. Clients get no direct write access except where stated; writes go through `security definer` functions with `search_path = ''`.

- `incidents` — one row per real-world incident (a cluster of reports): `id`, `category`, `lat`, `lng`, `geom`, `first_reported_at`, `last_confirmed_at`, `status` (open, resolved, expired), `level` (1–6, computed by the server), `level_reason`, `authority_confirmed_by` (nullable).
- `incident_reports` — one row per report: `id`, `incident_id`, `reporter_id` (user or anonymous id), `category`, `lat`, `lng`, `gps_accuracy_m`, `gps_fix_at`, `submitted_at`, `note`. Unique per reporter per incident.
- `journeys` — `id`, `user_id`, `route_summary` (distance, expected_duration_s, taken at start), `started_at`, `ended_at`, `status`, **`actual_duration_s`, `excess_s` (time over free-flow estimate), `evidence_level` (set only by the server)**.
- `journey_samples` — `journey_id`, `lat`, `lng`, `speed_kph`, `accuracy_m`, `at`. Raw samples are deleted when the journey ends, after aggregates are stored.
- `journey_aggregates` — `journey_id`, `min_speed_kph`, `slow_minutes`, `linked_incident_id` (nullable). No coordinates.
- `journey_shares` — `journey_id`, `org_id`, `user_id`, `status`, `shared_at`, `stopped_at`.
- `demo_history` — seeded incidents for the hotspot charts, `provenance = 'demo'`, never mixed into real totals unless the toggle is on.

### Security rules (suspected holes found by reading the current SQL; reproduce each with a failing test first, then fix)

1. Commuters **cannot** update `excess_s`, `evidence_level`, `actual_duration_s` or `expected_duration_s` on `journeys`. Only `start_journey`, `add_sample` and `end_journey` functions write them.
2. A share is allowed only if the journey belongs to the caller **and** the caller is a member of that organisation (or has explicitly selected an org the employer registered them to).
3. Employers read only an allowlisted view: category, time over estimate, status, evidence level, shared_at. No coordinates, no samples.
4. Incident `level` and `status` are never client-writable. Authority confirmation is a role-checked function that writes to `audit_log`.
5. Report submission is rate-limited per reporter (for example 5 per hour) and rejects coordinates outside the service-area bounding box.

## 6. Verification ladder (thresholds are config values, fixed before testing)

| Level | Meaning | Rule the server checks |
|---|---|---|
| L1 | User reported | Report accepted |
| L2 | GPS confirms location | Reporter's GPS fix is under 2 min old, accuracy ≤ 50 m, and within 200 m of the incident point |
| L3 | Multiple users | ≥ `L3_MIN_SOURCES` (= **3**, same as the existing repo and README) distinct reporters, same category, within 300 m and 15 min |
| L4 | GPS speed confirms congestion | ≥ `L4_MIN_JOURNEYS` (= **2** distinct journeys by different users) each show speed < 8 km/h for ≥ 3 min within 200 m of the incident in the last 30 min |
| L5 | Photo / video | Stretch, out of the must list |
| L6 | Authority confirmed | Authority-role function, audited |

All thresholds live in one config table (`verification_config`) and in one TypeScript constants file; tests read the same values, and the existing tests that assume 3 sources stay valid. Anonymous accounts are cheap to create, so reports are also limited per device/IP, and L4 needs *different users*, not different sessions of one user. With only 2–3 testers, L4 is reachable only at `L4_MIN_JOURNEYS = 2`; say this in the demo and raise it if more testers join.

Routing effect: only **L3 or higher, or L6**, changes a route. L1–L2 show on the map labelled "unconfirmed".
Expiry: an incident becomes `expired` after 3 hours without a new report or confirming sample (per-category values in config), and `resolved` when an authority marks it.

## 7. Routing and re-routing

1. User picks start and end (search, map tap, or "my location" with permission, used for that request only).
2. `POST /api/route` (server) loads open incidents of level ≥ 3 near the corridor, calls ORS for the fastest route plus up to two alternatives.
3. If a returned route passes within about 150 m of a verified incident, the server calls ORS again with `avoid_polygons` around that incident and returns that as the recommended route.
4. Response per route: distance, expected duration, `free-flow` label, list of incidents on it (with level and category), whether it avoids one, and the estimated delay with its provenance.
5. Estimated delay: if the incident is L4, use the measured slow minutes; otherwise show a **range** from a per-category assumption, labelled "assumed".
6. If ORS fails, show a clear error. Do not invent a route.

UI shows first: duration, delay, and data source. "Avoid this route" button swaps to the avoiding route and says why ("Avoiding accident near Pumpwell, verified L3").

## 8. Journeys and employer sharing

- Start: the user starts a journey on a chosen route. The server stores the expected duration.
- During: samples are sent every 10–15 s **only while the page is open and the screen is on**. Phones pause web pages when the screen locks or the app is switched, so the app requests a screen wake lock where the browser supports it (verify), tells testers to keep the screen on, and shows a live sample count and last-sample time. If no sample arrives for 60 s the journey shows "stalled"; gaps lower the journey's evidence level. A visible "sharing" indicator and a stop button are always shown. No background tracking.
- End: the server computes `actual_duration_s`, `excess_s = max(0, actual − expected)`, `slow_minutes` and, if the slow stretch was within 200 m of an open incident, links it. Raw samples are deleted. `excess_s` includes signals, stops and the rider's own pace, so it is shown as "time over free-flow estimate", never as congestion delay.
- Evidence level of a journey: `L2` if GPS samples exist, `L4` if they show a sustained slowdown, shown with its reason.
- Sharing with an employer is a separate explicit action per journey, per organisation, revocable. Employer sees the allowlisted summary only.
- The employer's sentence is generated from stored data: "Trip took 35 min more than the free-flow estimate. Evidence: GPS shows a sustained slow stretch (L4)." If a verified incident is linked, add "Verified [category] incident (level N) was open on the route." Otherwise add "Cause not determined." No coordinates shown.

## 9. Analytics (authority role)

Computed from stored rows:
- Incidents per category, per month, per hour of day.
- Hotspots: incidents grouped by place (reverse-geocoded name or ~250 m grid cell), count, total and average time over estimate from linked journeys (only journeys linked to an incident).
- Recurrence: "congestion incidents on N of the last M weekdays" for a hotspot, with sample size shown.
- Monthly report page and CSV export (keep the existing UI and export, change the data source).
- "Show demo history" toggle adds `demo_history` rows, with a banner. Off by default so real counts are never inflated.
- Wording: outputs say "suggest investigation". Engineering decisions stay with the authority.

## 10. Privacy and consent

- Location sharing is opt-in, visible and stoppable. No pre-ticked boxes.
- Raw samples deleted at journey end. Route requests are not stored with identity by default.
- Employers cannot see anything the traveller did not share for that journey.
- Users can see and delete their journeys and shares.
- Not an official traffic service. State this on the about page. OSM attribution on every map.
- A real launch would need legal review (Digital Personal Data Protection Act, 2023, and Indian geospatial rules). For the hackathon, invited testers only.

## 11. Schedule (3 working days, plus buffer on deadline day)

**Day 1 — real map and routes**
- First 30 minutes: make one real ORS request each for (a) alternative routes, (b) `avoid_polygons`, and (c) both together, using your key. Record the status, limits seen and the decision (use avoidance, or fall back to picking another alternative) in `docs/progress.md`. Do not rely on memory for this.
- Do the security fixes in section 5 on the existing journey tables (about 1 hour).
- Server route `/api/route` with ORS, geocoding search, planner page (search, tap, my location), routes and alternatives drawn on the map with duration, distance and "estimated" label.
- Checkpoint tonight: any two points in Mangaluru return a drawn route. If this fails, switch to OSRM and continue.
- Evening: deploy a minimal version to Vercel + hosted Supabase (apply all migrations there, set env vars, sign in once). This finds hosted-migration and env problems on Day 1, not on the last day.

**Day 2 — incidents, verification, re-routing, journeys**
- Migration: new incident tables, `submit_incident`, level computation L1–L4, L6 authority function, expiry.
- Report form with GPS and all PDF categories, markers on the map with level labels.
- Re-route around verified incidents.
- Journeys: start, samples, end with server-computed time over estimate, employer share with the allowlisted view.
- Checkpoint: two phones, report an incident on one, see it and the re-route on the other.

**Day 3 — analytics, deploy, demo**
- Authority analytics from real rows plus the demo-history toggle, CSV export.
- Redeploy the full version in the morning. Test on a phone outdoors.
- Record the demo video. Update README with what is real and what is not.

**Decision points:** end of Day 1 — if routing is not working, drop employer sharing now. Midday Day 2 — if incidents + L3 + re-routing are not working, drop L4 and journeys polish now. Do not wait for Day 3.

**Cut line, in order, if time runs short:** drop employer sharing polish → drop L4 (keep L1–L3, L6) → drop alternatives beyond one → drop CSV. Never drop: real routes, real reports, server-enforced verification, re-routing, analytics from real rows, deployment.

## 12. Acceptance checks (keep tests small and focused)

- Any two points in the service area return a route or a clear "no route" message.
- A report at a real GPS point creates an incident at L1; two nearby reporters raise it to L3; a test slow journey raises it to L4.
- An L3 incident changes the recommended route; an L1 incident does not.
- A commuter cannot edit time-over-estimate or evidence level, and cannot share to an organisation they are not allowed to (SQL boundary test for each).
- Employer view contains no coordinates.
- Raw samples are gone after a journey ends.
- No hard-coded segment IDs in the new code (grep).
- Works on a phone browser and a 1440 px desktop.

## 13. Demo script (about 3 minutes)

1. Pick two places in Mangaluru, show real routes and alternatives, with the "estimated" label.
2. Friend A reports an accident at their real location (L1, L2).
3. Friend B reports the same one (L3). The map and route banner update: "Avoiding accident, verified L3". Press "Avoid this route".
4. Friend C starts a journey, slows through the area, ends it. The server shows time over the free-flow estimate and the evidence level.
5. C shares with the employer. Employer view shows the summary without coordinates. C stops sharing and the entry disappears.
6. Authority page: hotspots, causes, delay hours, recurrence, CSV. Toggle demo history and show the label.
7. Close with the roadmap slide: from this build to live probe speeds (section 14).

**Fallback if friends or GPS are not available:** a seed script creates test incidents and journeys marked `demo`, so every screen can be shown. Record a short clip of the live path (report → L3 → re-route) as soon as it works once, and keep it for the video even if the final take fails.

## 14. Roadmap (from the earlier long-form Plan 4 draft, not part of this build)

Self-hosted OSM extract, Valhalla routing and map matching, Photon, PMTiles; probe pipeline with 5-minute aggregation and 90-day profiles; accuracy measurement with observer trips; photo evidence with moderation; legal review before public launch. Things to verify before committing: how Valhalla accepts live traffic (it may use traffic tiles rather than per-request overrides), and how to obtain a Karnataka-only OSM extract (the Geofabrik India split may be by zone, which you would clip yourself).

## 15. Risks and fallbacks

| Risk | Fallback |
|---|---|
| ORS limits, key issues or alternatives not returned | OSRM public demo; pick the second alternative as the "avoid" option |
| Geocoder rate limits | Cache results, debounce typing, allow map tap only |
| GPS poor indoors during testing | Test outdoors, show accuracy, allow a manual pin for L1 |
| Too few testers for L3/L4 | Use 2–3 friends and real roads; say so in the demo |
| Old simulation code conflicts | Keep it as a separate "Simulation mode" page, clearly labelled |
| Time overrun | Follow the decision points and cut line in section 11 |
| Screen locks during a journey | Wake lock, keep-screen-on instruction, sample counter, "stalled" state |
| Deadline or submission format unclear | Confirm today; plan to submit a day early |

## 16. Definition of done

- Deployed URL works on a phone.
- Real route between any two points in the service area, with alternatives.
- A real report is verified by server rules and visibly changes a route.
- A real journey produces a time-over-estimate figure that an employer sees only after the traveller shares it, worded without claiming a cause.
- Authority analytics are computed from stored data, with sample sizes and a labelled demo toggle.
- The known security holes in section 5 are fixed and tested.
- README states what is real, what is estimated and what is simulated.