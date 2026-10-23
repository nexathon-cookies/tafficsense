# TrafficSense — Plan of Action (to completion before the deadline)

Status: active working plan
Scope: close the gaps between Plan 4 (Revised, hackathon build) and the code, and make every claim match the evidence.
Deadline: about 21 Oct 2026. **Confirm the exact time, time zone and submission format today.**
Source of requirements: `Traffic_JAM.pdf` and `docs/plan-4-revised.md`.
Baseline: the snapshot `hackathon-main_5_.zip`, reviewed on 18 Oct 2026.

---

## 0. Rules for this plan

1. **No claim without evidence.** A row is "done" only when its acceptance test passes and the output is recorded in `docs/progress.md` with the command, result, date and commit hash.
2. **Label, don't fake.** If a feature cannot be made real in time, it is shown as "not measured", "planned" or "simulated". It is never shown with invented numbers.
3. **One work package per commit.** Keep commits small and reversible.
4. **Fix security before features that write data.** Items WP2 and WP3 come before any new write path.
5. **Each work package has a stop condition.** If its time budget is spent, stop, record the state, and move to the next package or the cut line (section 4).
6. **Follow `AGENTS.md`.** Browser checks at 1440 px and 390 px for any UI change. Tests first where logic changes.

---

## 1. Baseline: what is already true (from the review)

| Row | Current state | Target state for submission |
|---|---|---|
| Routing | OSRM demo server, planner page works | Real routes, any two points in the service area, honest errors |
| Reports | Real rows, clustering, 17 categories | Real rows, rolling-window limits, no public reporter data |
| Verification | L1/L3 counted via anonymous sessions; L2 client-trusted | L3 counts only non-anonymous accounts; L2 labelled self-reported |
| Re-routing | Picks an OSRM alternative with no incidents | Labelled honestly; no claim of a computed detour |
| Journeys | Hardcoded 480 s and L3 | Either real samples, or "not measured" and no employer share |
| Analytics | Live incidents get invented 20/30-minute delays | Counts only for real reports; delay "not measured" |
| Deployment | Not deployed | Deployed URL works on a phone |
| Docs | README says "live", "zero tracking", "160 tests" | Every claim matches section 7 |

---

## 2. Decision gate (today, 30 minutes)

Decide these four things and write them into `docs/progress.md`:

| Decision | Options | Recommendation |
|---|---|---|
| Deadline | Confirm date, time, time zone, submission items | Write the exact time. Aim to finish 1 day early |
| Journey feature | A: build real GPS sampling (6–8 h). B: hide the employer share and show "not measured" | **B** unless Day 1 finishes early |
| Routing provider | OSRM public demo (current) or OpenRouteService with a key | **OSRM** unless a key is ready and a 15-minute ORS test succeeds |
| Scope mode | Full (all WPs) or Honest-reduced (cut list in section 4) | **Honest-reduced** if Day 1 ends behind schedule |

**Exit condition:** all four decisions recorded. If the deadline cannot be confirmed, assume the earlier date.

---

## 3. Work packages

Each package lists the goal, the files likely involved, the steps, the acceptance test and the time budget.

### WP1 — Honest records (1 hour, Day 1)

**Goal:** remove claims the code cannot support.

Files: `README.md`, `docs/progress.md`, `src/app/about/page.tsx`, the landing page copy, `/authority` banner text.

Steps
1. Search for these terms and replace each with an accurate statement: "live", "zero tracking", "anti-spoofing", "single-device spam", "real-time", "160 unit tests", "live hotspot rankings".
2. Add a status table to `README.md` with the rows from section 1, marked real, partial, simulated or not built.
3. In `docs/progress.md`, correct any "verified" or "complete" entry that is not backed by a passing test and recorded output. Mark it "partial" with the gap.
4. Update the test count to the actual figure from the final run (WP9).

Acceptance
- `grep -rn -i "zero tracking\|anti-spoof\|live hotspot\|160 unit" README.md src docs` returns nothing that is still a claim.
- The status table matches the code (checked by reading each row against its file).

### WP2 — Stop public reads of reporter data (1.5 hours, Day 1, security gate)

**Goal:** the anon key can no longer read reporter identity, exact coordinates or fix times.

Files: `supabase/migrations/` (new migration), `tests/` (new SQL boundary test).

Steps
1. Reproduce first. With the local anon key, query `incident_reports` and record the result (it should return rows). Save the query and output.
2. Write a failing test: anon `select` on `incident_reports` must be denied for `reporter_id`, `lat`, `lng`, `gps_accuracy_m` and `gps_fix_at`.
3. New migration: revoke anon select on `incident_reports`. Create a view `public_incident_view` exposing only: `incident_id`, `category`, `level`, `status`, `first_reported_at`, and coordinates rounded to a grid of about 250 m.
4. Grant anon select on the view only.
5. Re-run the test. Confirm it passes.

Acceptance
- Anon select on `incident_reports` returns a permission error.
- Anon select on `public_incident_view` returns no `reporter_id`, no exact coordinates.
- Integration test recorded in `docs/progress.md`.

### WP3 — Verification that cannot be gamed by one person (3 hours, Day 1–2)

**Goal:** L3 counts only independent, non-anonymous accounts; caps are rolling, not lifetime.

Files: `src/app/api/incidents/` (or equivalent), `src/lib/incidents/server.ts`, `supabase/migrations/` (new), `tests/live-incidents.test.mjs`, new SQL boundary tests.

Steps
1. Reproduce: one device, clear cookies, submit three reports at one location. Record that L3 is reached (expected bug).
2. Write failing tests:
   - Anonymous-session reports do not count toward L3.
   - L3 requires at least 3 distinct non-anonymous `auth.uid()` values within 300 m and 15 minutes.
   - Report limits are rolling windows (for example 5 per user per hour), not lifetime totals.
3. Decide how anonymous visitors can report at all. Recommended: require sign-in (demo accounts are fine) to submit. Alternative: allow anonymous reports at L1 only.
4. Change the L3 query to count only non-anonymous accounts.
5. Replace the lifetime caps (2,000 reports, 5,000 sources) with rolling-window counts.
6. Label L2 as "self-reported" in the UI and in `docs/traffic.md`, because the client supplies the GPS fields.
7. Re-run the tests.

Acceptance
- Reproduction steps show L3 is no longer reachable by one device.
- Lifetime caps are gone from the SQL (grep).
- Rolling-window test passes.
- L2 is labelled self-reported wherever it appears.

### WP4 — Routing: honest, limited, and safe (2 hours, Day 1)

**Goal:** routes work for any two points in the service area; errors are visible; simulated data cannot change real routes.

Files: `src/app/api/route/`, `src/lib/routing/engine.ts`, planner page, `tests/routing.test.mjs`.

Steps
1. Run a real request for 5 pairs across Mangaluru. Record the status and response time for each.
2. Remove the simulator snapshot from `/api/route`. Only verified real incidents may affect routes. Write a test that a simulated slowdown does not change the response.
3. Add a per-user (or per-IP for anonymous) rate limit on `/api/route`, for example 30 requests per 10 minutes. Test it.
4. Replace silent error swallowing with a visible message: "No route found" or "Routing service unavailable". Test both paths.
5. Label every route "estimated, free-flow" in the UI.

Acceptance
- Recorded results for 5 real pairs.
- Test: simulated slowdown does not alter a route.
- Test: rate limit returns a clear error.
- No hard-coded segment IDs (grep).

### WP5 — Re-routing: say what it actually does (1 hour, Day 2)

**Goal:** the detour claim matches the code.

Steps
1. If a route passes a verified incident (L3 or higher, after WP3), the response shows the incident and offers the alternative route returned by OSRM, if that alternative does not pass the incident.
2. If no alternative avoids it, say "No alternative found that avoids this incident." Do not invent a detour.
3. UI copy: "Alternative route avoids the reported incident" (not "computed detour").

Acceptance
- Test: an L3 incident changes the recommendation only when an OSRM alternative avoids it.
- Test: an L1 incident does not change the recommendation.
- Test: when no alternative avoids the incident, the response says so.

### WP6 — Journeys and employer sharing (Option B: 1.5 hours, Day 2; Option A: 6–8 hours)

**Goal:** no fabricated delay reaches an employer.

#### If Option B (recommended)

Files: `supabase/migrations/20261018000200_journey_security_fixes.sql` (keep the security parts), `src/app/employer/`, commuter workspace, `tests/journeys.test.mjs`.

Steps
1. Remove the hardcoded `estimated_delay_seconds = 480`, `evidence_level = 'L3'` and `provenance = 'simulated'` from `start_commuter_journey`. Store `null` for delay and evidence.
2. Employer view shows: corridor name, status, and "Delay not measured" for every share.
3. Keep the security fixes: direct writes revoked, ownership and org-membership checks.
4. Add a banner on the commuter page: "Journey timing is not measured in this build."
5. Test: no employer response contains a number labelled as delay.

Acceptance
- Grep for `480` and `'L3'` in journey code returns nothing.
- Employer view test passes with "not measured".
- Ownership and membership checks tested at the SQL level.

#### If Option A (only if Day 1 is ahead of schedule)

Steps
1. Browser: sample position with `navigator.geolocation.watchPosition` only while the page is open and the user has pressed "Start". Show a sharing indicator and a stop button.
2. Request a screen wake lock where supported, and show a live sample count and "stalled" after 60 s without samples.
3. Server `add_sample` function: validate accuracy (≤ 30 m), speed plausibility, and timestamps. Store only segment-level or rounded values, not a full trail.
4. Server `end_journey`: compute `actual_duration_s` and `excess_s = max(0, actual − expected)`. Label it "time over free-flow estimate", never "delay caused by congestion".
5. Delete raw samples at journey end.

Acceptance
- Test with recorded sample fixtures.
- Employer view contains no coordinates (SQL test).
- Raw samples removed after end (test).

### WP7 — Analytics without invented numbers (2 hours, Day 2)

**Goal:** real reports are counted; no delay is made up.

Files: `src/components/analytics/authority-dashboard.tsx`, `src/lib/analytics/metrics.ts`, `tests/phase6-analytics.test.mjs`.

Steps
1. Remove the fixed 30-minute duration and the 20/10-minute delay assignment for live incidents.
2. Live incidents appear in counts by category and by hour, with the junction taken from the real coordinates (nearest known junction within a set radius, else "unnamed location").
3. Delay columns show "not measured" for any incident without linked journey data.
4. Hotspot ranking uses report counts for live data, and says so.
5. Keep the demo-history toggle off by default. When on, show a banner: "Simulated history is included. Not real reports."
6. Remove the phrase "alongside real reports" wherever it describes demo data.

Acceptance
- Test: a live incident with no journey link shows "not measured", not a number.
- Test: demo toggle off produces no simulated rows.
- Authority page browser check at 1440 px and 390 px.

### WP8 — Deployment (3 hours including fixes, Day 2 evening and Day 3 morning)

**Goal:** a public URL that works on a phone.

Steps
1. Create a hosted Supabase project. Apply every migration in order. Record the migration list and any errors.
2. Set environment variables in Vercel: Supabase URL, anon key, service key (server only), routing settings. Do not commit keys.
3. Deploy a minimal version first (Day 2 evening): the planner and the traffic page. Fix hosting problems now.
4. Deploy the full version on Day 3 morning.
5. Sign in as a test user on a phone (mobile data). Submit one report. Plan a route.

Acceptance
- Public URL recorded in `README.md` and `docs/progress.md`.
- Phone test recorded: screenshots of the planner and a submitted report.
- No secret appears in the client bundle (grep the built JS for the service key).

### WP9 — Verification run (2 hours, Day 3)

**Goal:** the claims are tested against the real database and the real UI.

Steps
1. `just check` in Docker. Record the summary.
2. `just test-integration` against local Supabase in Docker. Record the summary. If a suite fails, record it and fix or label it.
3. Browser scenarios on desktop (1440 px) and mobile (390 px) for: planner, report submission, authority page, employer page.
4. Production build (`just prod` or equivalent). Record the result. If it fails only because of network access, say so.

Acceptance
- Every result recorded with date, command, output summary and commit hash.
- Any failing suite is listed as a known gap in the README, not hidden.

### WP10 — Demo and fallback (2 hours, Day 3)

Steps
1. Write a seed script that creates test incidents and journeys marked `demo`, so every screen can be shown if live testing fails.
2. Record a short clip of the live path: plan a route, submit a report, see the incident on the map.
3. Write the 3-minute demo script from `plan-4-revised.md` section 13, changed to match what is real. Remove the employer delay step if WP6 is Option B.
4. Prepare the answer to "where does the data come from?": reports are real; speed data is simulated; journey timing is not measured in this build.

Acceptance
- Seed script runs on a fresh local stack.
- Clip recorded and saved.
- Demo script reviewed against section 7 so nothing is claimed that is not shown.

---

## 4. Schedule and cut line

| Day | Work | Checkpoint at end of day |
|---|---|---|
| Day 1 (18–19 Oct) | Decision gate, WP1, WP2, WP4 | Anon read blocked; routing honest; README corrected |
| Day 2 (19–20 Oct) | WP3, WP5, WP6, WP7, WP8 (minimal deploy) | Verification gate fixed; minimal deploy live |
| Day 3 (20–21 Oct) | WP8 (full deploy), WP9, WP10 | Verification recorded; clip recorded; submission ready |

**Go/no-go at the end of Day 1:** if WP2 is not finished, stop all feature work and finish WP2 first.

**Cut line, in this order, if behind schedule:**
1. WP6 Option A (already Option B).
2. Employer share polish (keep the security fixes).
3. Routing alternatives beyond one.
4. CSV export.
5. Demo-history toggle (keep it off and hidden if needed).

**Never cut:** WP1 (honest records), WP2 (anon read), WP3 (verification gaming), WP8 (deployment), WP9 (verification run).

---

## 5. Evidence template for `docs/progress.md`

Copy this for each work package:

```
## WP<N> — <name>
Date: <YYYY-MM-DD HH:MM timezone>
Goal: <one line>
Commands run:
  - <command>  → <result summary, e.g. "194/194 pass">
Tests added: <file names>
Reproduction (before fix): <what failed>
Fix (after): <what changed>
Commit: <hash>
Known gaps: <list or "none">
Verdict: passed / partial / not done
```

---

## 6. Risks

| Risk | Early sign | Response |
|---|---|---|
| Hosted Supabase migrations fail | Errors on first apply | Fix on Day 2 evening, not Day 3 |
| OSRM demo server unavailable on demo day | Route requests time out | Use the fallback route cached for the demo, labelled as cached |
| Anonymous reporting removed breaks the demo | Reports fail for judges | Use demo accounts; show sign-in as the step |
| Integration tests need Docker and time | Suites not run by Day 3 | Start `just test-integration` on Day 2 |
| Scope creep | New features appear in the list | Anything not in section 3 is out of scope |
| Phone GPS poor indoors | No location for report | Allow manual pin; label as "manual location" |

---

## 7. What the final submission may claim

Allowed, if the evidence is recorded:
- Real OpenStreetMap routing through the OSRM service for any two points in the service area, with alternatives, labelled estimated.
- Real citizen reports with server-side clustering and the 17 PDF categories.
- Verification levels L1 and L3 enforced in the database on non-anonymous accounts. L2 labelled self-reported. L4 simulated. L6 authority confirm with an audit trail.
- Authority analytics from real report counts, with demo history off by default and clearly labelled when on.
- Deployed URL and tested on a phone.

Not allowed unless built and tested:
- Live traffic speeds.
- Measured congestion delay.
- Journey timing shared with employers (unless WP6 Option A is complete).
- Zero tracking, anti-spoofing, or single-device protection claims.
- Any figure computed from simulated data and shown as real.

---

## 8. Instructions for the implementing agent

1. Read `AGENTS.md`, this file, and `docs/plan-4-revised.md` before starting.
2. Start with the decision gate. Do not start WP2 or later until the four decisions are recorded.
3. For each package, reproduce the problem first and record the output before changing code.
4. Do not mark a package done without the acceptance output recorded.
5. If a command cannot run in the environment (for example Docker or the browser), record that it was not run. Never write that it passed.
6. Stop and report to the project lead if a fix would need a new external service, a paid key, or a change in what the product claims.
