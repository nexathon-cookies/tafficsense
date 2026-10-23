# TrafficSense — Plan 2: Modification

Status: proposed
Scope: UI quality, map visibility, PDF alignment, and the "Smart Mobility & Traffic Intelligence" problem statement
Relation to repo docs: this is a planning document. Per AGENTS.md, scope and acceptance live in `docs/plan.md`, and implementation status, blockers and verification evidence live in `docs/progress.md`. Once approved, the phases below should be split into those files.

---

## 1. Goal

Make TrafficSense look and feel like a finished product that a judge can understand in under 30 seconds, while covering the core requirements of `Traffic_JAM.pdf` and the problem statement:

- Incident detection
- Congestion verification
- Route intelligence
- Analysis of recurring road problems

Every change must keep the existing honesty rules: simulated data is labelled simulated, and no claim goes beyond what the system actually does.

---

## 2. Current state (verified)

### 2.1 What works
- 160 unit tests pass in Docker. Lint, type generation and the production build succeed (`just check`).
- Route-alert logic, the 300-second threshold, hazard and slowdown abstention, and the employer allowlist are implemented and tested.
- Authority analytics (hotspots, cause mix, CSV export) exist and render.
- Reporting, guest identity and the employer consent view exist.

### 2.2 What is broken or weak in the UI

| # | Page | Problem | Evidence |
|---|------|---------|----------|
| U1 | `/traffic` | The map is off by default (`useState(false)` in `traffic-explorer.tsx`) and sits behind a "Load map" button with a network-consent notice. The first screen is text. | Screenshot: "Load map" button |
| U2 | `/traffic` | When the map does load, the background shows no streets (blank canvas with numbered markers only). | Screenshot: map area is empty |
| U3 | `/traffic` | Segment cards are dense grey text. Nearly every card reads "Stale", "unavailable" or "no route alert", so the page looks empty. | Screenshot: segment column |
| U4 | `/traffic` | The disclaimer appears about 9 times across the page. | Code count in `traffic-explorer.tsx` |
| U5 | `/` | The hero has a "Corridor view" illustration, but the rest is text cards. The illustration is labelled "not a live map". | Screenshot |
| U6 | `/demo`, `/reports/new` | Text-only. The privacy caveat is repeated in three paragraphs before the form. | Screenshots |
| U7 | `/authority` (desktop) | Clear and strong. Footer shows "Phase 7", an internal label. | Screenshot |
| U8 | `/authority` (mobile) | The hotspot table and incident log are cut off horizontally, "Primary Cause" is truncated, and the Export button crowds the period filter. | Mobile screenshot |
| U9 | `/employer/[orgId]` | Shows a "Member verified" badge on a simulated organisation. This overstates what is verified. | Screenshot |
| U10 | All pages | A red "1 Issue" badge is visible. This is the Next.js development error indicator. It must not appear in a presented build. | Screenshot |
| U11 | Mobile (390px) | Body text on `/reports/new` and `/demo` is covered by the dev indicator. | Mobile screenshot |

### 2.3 What is missing against `Traffic_JAM.pdf`

See section 4 for the full matrix. In short: the incident taxonomy is incomplete, verification is L1–L4 where the PDF defines L1–L6, there is no confidence or "reason" line, recurrence analysis ("congested on N of the last 30 working days") is not implemented, and real traffic data is not connected.

---

## 3. Principles

1. **Visual first.** Each screen opens with a map, a chart or a status graphic. Text supports the visual; it does not replace it.
2. **One disclaimer, placed well.** A single banner on each page states what is simulated. Detailed rules move to a `/about` methodology page.
3. **No fake precision.** If a value cannot be computed honestly (for example a confidence percentage), show "not computed" instead of a made-up number.
4. **Labelled provenance.** Every value shows SIMULATED or LIVE. Nothing is presented as real traffic unless it is.
5. **Shared components, shared checks.** Changes to shared components are verified on every page that uses them (AGENTS.md).
6. **Small, committed steps.** Each phase below is one or more scoped commits, each with a verification record in `docs/progress.md`.

---

## 4. PDF and problem-statement coverage matrix

| Requirement (source) | Current status | Action | Phase |
|---|---|---|---|
| Live traffic map with segments and direction (PDF §13) | Map exists but is hidden by default and shows no basemap | Show map by default, fix basemap | 1 |
| Direction toggle, inbound/outbound (PDF §13) | Data has both directions; toggle not confirmed in the browser | Verify in browser; add a visible toggle if missing | 1 |
| Incident types, 17 categories (PDF §2) | About 10 categories exist (including landslide, festival, strike) | Compare against the PDF list and add missing types with icons | 5 |
| Incident reporting with category and location (PDF §11) | Implemented; location is manual, no photo | Keep; add icons and a short form | 3 |
| Photo/video evidence (PDF §11) | Not implemented | Defer; list as planned (see 6) | — |
| Verification levels L1–L6 (PDF §4) | L1, L3, L4 implemented under the repo's own definitions; L2 is "planned"; L5 and L6 absent | Align the scheme with the PDF. Implement L2 (location support) if feasible. Show L6 as an authority action only if built. | 4 |
| GPS verification of a user's speed and location (PDF §4) | Synthetic speeds only | Real GPS needs consent flow and a device source (Phase 7) | 7 |
| Reason and confidence (PDF §1, §3) | No reason line or confidence number | Show "reported cause" with a count of agreeing reports; no percentage unless defined | 5 |
| Alternative route with time saving (PDF §3, problem statement "route intelligence") | One fixed route pair; 300 s threshold; abstention rules | Keep; show it visually as a route comparison bar | 2 |
| Multiple alternative routes (PDF §3) | Not implemented | Document as out of scope for this round | — |
| Hotspot ranking (PDF §7) | Implemented (authority page) | Keep; fix mobile table; add map view of hotspots | 6 |
| Recurring-problem analysis, e.g. "18 of last 30 working days" (PDF §9; problem statement "analysis of recurring road problems") | Not implemented | Add weekday × hour recurrence heatmap and a day-count statement | 6 |
| Monthly statistics by reason (PDF §8) | Implemented for monthly hotspots; cause mix exists | Add per-reason table with incident count and hours | 6 |
| Daily → annual aggregation (PDF §17) | Monthly only | Add weekly and daily views if time allows; otherwise document as planned | 6 |
| Permanent-solution report (PDF §10) | Not implemented | Document as planned; not required for this round | — |
| Employer dashboard with consent (PDF §5–6) | Implemented; consent-based; sharing shown | Keep as a small supporting feature; fix "Member verified" label | 3 |
| Notifications (PDF §16) | Not implemented | In-app alert card only; push deferred | 2 |
| Admin dashboard (PDF §14) | Minimal admin page | Keep minimal; out of scope for UI polish | — |
| Business model (PDF §20) | Not applicable to the demo | Do not present | — |
| Passenger mobile app (PDF §3, §18) | Web app only, responsive | Responsive web is the deliverable; native app out of scope | — |

---

## 5. Phases

Each phase lists the files likely to change and its acceptance criteria. Test string updates are part of each phase, because presentation tests assert exact wording.

### Phase 0 — Baseline and cleanup (½ day)

Tasks
- Capture desktop (1440px) and mobile (390px) screenshots of `/`, `/traffic`, `/demo`, `/reports/new`, `/authority`, `/employer/[orgId]` with the capture script, and store them in `supabase/.temp/browser` (git-ignored).
- Count words per page and count disclaimer sentences per page.
- Run `just test-integration` and the browser scenarios. Record results in `docs/progress.md`.
- Remove the "Phase 7" label and the "Member verified" wording (U7, U9).
- Confirm the "1 Issue" indicator is a dev-only artefact. Check it does not appear under `just prod` (U10).

Acceptance
- Baseline record in `docs/progress.md` with word and disclaimer counts.
- No "Phase N" labels or "Member verified" text on any page.

### Phase 1 — Map first (1–2 days)

Files: `src/components/traffic/traffic-explorer.tsx`, `traffic-map.tsx`, `traffic.module.css`, `public/map-notices.txt`

Tasks
- Set the map visible by default (`mapEnabled` true). Remove "Load map" and "Hide map" controls.
- Keep a one-line notice under the map: "Background roads: OpenStreetMap via OpenFreeMap. Coloured lines are schematic." Link to the existing notices file.
- Diagnose the blank basemap (U2). Check the tile request, the style URL, the content-security policy and the network in the browser console. If the external style cannot load in the demo environment, add a fallback: a bundled simplified GeoJSON basemap of the corridor, labelled as schematic.
- Make the map the hero: full width, about 520px tall on desktop and 300px on mobile. Segment list sits beside it on desktop and below it on mobile.
- Show a four-chip legend (primary, alternative, opposite direction, selected) instead of a sentence.
- Add a visible direction toggle (outbound / inbound) if not already present (verify first).

Acceptance
- On `/traffic`, desktop and mobile, the map and streets are visible on first load with no click.
- Selecting a segment highlights it on the map and in the list.
- Browser check of both widths; screenshots stored.
- Map tests updated; no console errors except the known dev indicator.

### Phase 2 — Visual status instead of text (2 days)

Files: `traffic-explorer.tsx`, `traffic.module.css`, `src/lib/traffic/presentation.ts`, `src/lib/evidence/slowdown-presentation.ts`, `src/lib/route-alerts/presentation.ts`

Tasks
- Replace each segment card's paragraph block with: direction arrow, name, one state chip (Clear / Slowdown L4 / Reported L1 / Multiple L3 / Alert / No data), a delay figure in minutes or "—", and an age dot (green fresh, amber stale, grey none).
- Add a corridor strip above the map: segments in route order with colour per state, and the alternative route below it.
- Move details (segment ID, assumed length, baseline, sampled window, provenance text) into a "Details" disclosure on each card.
- Show the route comparison as a two-bar visual (primary vs alternative minutes) when an alert or abstention applies, with the reason as one short line.
- Use short state labels from a single mapping table, so the wording is defined once.

Acceptance
- A visitor can read the state of every segment from the strip and chips without opening any card.
- Card text on the default view is under 25 words per card.
- Presentation tests updated to the new labels; all 160 tests still pass.

### Phase 3 — Cut the text (1–2 days)

Files: `traffic-explorer.tsx`, `src/app/page.tsx`, `src/app/demo/page.tsx`, `src/app/reports/new/` components, new `src/app/about/page.tsx`

Tasks
- Show one banner on each public page: "SIMULATED · Demo with synthetic data · Not an official traffic service." The banner links to `/about`.
- Move the methodology (L1–L4 rules, sample windows, clearance rules, route-alert conditions, privacy rules) to `/about`, grouped under headings with short bullets. Remove repeated sentences from the main pages.
- Home page: keep the hero and the three pillar cards; cut each card to one sentence and one visual.
- Demo and report pages: merge the three privacy paragraphs into one line plus an info link. Keep the form.
- Target: fewer than 3 disclaimer sentences on `/traffic`, and under 150 words of body text above the fold on `/` and `/traffic` at desktop width.
- Check mobile: no text covered by the dev indicator (U11).

Acceptance
- Word counts recorded before and after in `docs/progress.md`, with the target met.
- `/about` contains every rule that was removed from the main pages (nothing lost).
- Browser check, desktop and mobile.

### Phase 4 — Verification ladder aligned with the PDF (2 days)

Files: `src/lib/evidence/*`, `src/lib/reports/*`, `src/components/traffic/*`, new `src/components/traffic/verification-ladder.tsx`, relevant migrations only if L2 needs storage changes

Tasks
- Define one scheme in `docs/traffic.md` that maps the PDF levels to the implementation:
  - L1 Reported (implemented)
  - L2 Location support: a report whose segment matches the user's selected location. Implement as manual confirmation of the segment, not GPS, and label it that way. If it cannot be done in this phase, keep it marked planned.
  - L3 Multiple sources (implemented)
  - L4 Speed slowdown (implemented, simulated)
  - L5 Photo evidence: planned, not built
  - L6 Authority confirmation: an authority action that records a confirmation. Implement only if time allows; otherwise show as planned.
- Build a vertical ladder graphic showing L1–L6 with the current level of each segment highlighted and unbuilt levels greyed and labelled "planned".
- Replace "L1–L4 badges" language on the map with the ladder's wording.

Acceptance
- A judge can see the six levels, which are active, and which are planned, without reading any paragraph.
- No level is shown as active unless the code implements it.
- Tests cover the level mapping.

### Phase 5 — Incident types, reason and confidence (2 days)

Files: `src/lib/reports/rules.ts`, `src/app/reports/new/`, incident presentation files, `src/lib/analytics/*`

Tasks
- Compare the category list in code against the PDF's 17 types (PDF §2). Add missing types to the allowlist, with labels and an icon for each. Confirm a database migration is needed for new categories and add it if so.
- Show "Reported cause" on each incident with its count of agreeing reports (for example "Reported as Accident by 3 of 4 reports"). This replaces any confidence figure.
- Do not show a confidence percentage unless a formula is documented in `docs/traffic.md` and tested. If it is added, use the formula, not a fixed number.
- Keep "Unknown — reported, unconfirmed" as the default reason.

Acceptance
- Category allowlist matches the PDF list or documents each intentional omission.
- Reason line appears on every incident card, with an agreement count.
- No invented percentages anywhere in the UI (grep check in tests).

### Phase 6 — Recurring-problem analysis and authority view (2–3 days)

Files: `src/lib/analytics/history.ts`, `metrics.ts`, `src/components/analytics/authority-dashboard.tsx`, `src/app/authority/page.tsx`, seed data scripts if more history is needed

Tasks
- Add a recurrence heatmap for one junction: rows are weekdays, columns are hours (for example 07:00–11:00 and 16:00–20:00 in 30-minute steps), colour is the number of incidents in that slot across the analysis period.
- Add a plain-language recurrence statement, computed from the data, in the form "Congested on N of the last M weekdays between HH:MM and HH:MM." Compute N and M from the data; never type them in. Show the sample size.
- Add a per-reason table with incident count and total delay hours, as in PDF §8.
- Make the authority hotspot table responsive: on mobile, each row becomes a card with rank, junction, delay hours and peak window. No horizontal scroll.
- Make the Export button sit on its own row on mobile.
- Show a map view of hotspot ranks as numbered markers on the corridor.
- Replace the "Phase 7" footer label (done in Phase 0).

Acceptance
- The recurrence statement matches the underlying counts (test with a fixed fixture).
- Authority page passes browser checks at 1440px and 390px, with no clipped table.
- Historical data remains labelled SIMULATED.

### Phase 7 — Real data (optional, after Phases 1–6 are stable)

This phase changes the nature of the product. It only starts once the earlier phases are complete and verified.

Options (choose one)
- **A. Traffic-flow API** (for example TomTom or HERE) for corridor speeds on the existing segments. Requires an API key, a terms-of-use review and a rate-limit plan. Feeds the existing L4 logic in place of synthetic speeds. Label the source as LIVE with the provider name.
- **B. Device GPS speed samples** from a consented journey, sent from the browser while the page is open. Requires an explicit start control, a visible "sharing location" indicator, a stop control, and no background tracking. Speeds are aggregated server-side before use.

Acceptance (either option)
- Consent is explicit and reversible, and the data policy is written in `docs/auth.md` or a new privacy note.
- Live values carry a LIVE label and a timestamp.
- The simulated path still works and stays labelled.
- Negative tests: no data leaves the device without consent; stale live data abstains.

---

## 6. Explicitly out of scope for this round

- Photo and video evidence (L5). Shown as planned.
- Authority confirmation as a working workflow (L6), unless Phase 4 has time left.
- Passenger native mobile app (Flutter or React Native). The responsive web app is the deliverable.
- Push notifications (FCM). An in-app alert card covers the demo.
- AI image classification and traffic prediction (PDF §19). Listed as future work.
- Business model, pricing and API integrations (PDF §14, §20).
- Permanent-solution engineering report (PDF §10). Listed as future work.
- Multiple alternative routes across the city. The fixed pair remains.

Each of these must be listed as "planned" in the UI where it would otherwise be expected, so nothing looks broken or missing by accident.

---

## 7. Testing and verification

For every phase:

1. Write or update tests first where logic changes (AGENTS.md). Presentation tests that assert wording are updated in the same commit.
2. Run `just test` and `just check` in Docker.
3. Browser check the affected flows at 1440px and 390px. Include other pages that share the changed component (for example the segment card is used on `/traffic`, and the reports page links to it).
4. Store screenshots in `supabase/.temp/browser`.
5. Record the commands, results, screenshot paths and commit hash in `docs/progress.md`.
6. Create a scoped local commit. Do not push unless asked.

Integration and browser scenario suites (`just test-integration`, the `*-browser-scenarios.mjs` files) run before the demo freeze.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The external basemap does not load on the demo machine | Map blank again (U2) | Bundled schematic fallback in Phase 1 |
| Wording changes break presentation tests | Phases stall | Update tests in the same commit; keep wording in one mapping table |
| L2 and L6 need storage changes | Scope grows | Mark planned if not done by Phase 4 |
| New incident categories need a migration | Database risk | Small migration with its own integration test |
| Real data source has terms or cost limits | Demo fails on the day | Keep the simulated path working; live is optional |
| Judges read the code and find overclaims | Credibility loss | Keep the "planned" labels; match `docs/progress.md` to the UI |

---

## 9. Definition of done

The round is complete when all of the following are true:

- `/traffic` shows a visible map with streets on first load, on desktop and mobile.
- A visitor can read the state of every segment from the visual strip and chips, without opening a card.
- Each public page has one disclaimer banner, and the methodology is on `/about`.
- The verification ladder shows L1–L6 with active and planned levels clearly marked.
- The incident categories match the PDF list, or each omission is documented.
- Each incident shows its reported cause with an agreement count, and no invented percentage appears.
- The authority page has a recurrence heatmap and a computed recurrence statement, and its tables work on mobile.
- No "Phase N" labels, "Member verified" overclaims or dev-only indicators appear in the production build.
- `just check` passes; integration and browser scenarios pass; results are recorded in `docs/progress.md`.
- Every simulated value is labelled SIMULATED, and every planned feature is labelled planned.

---

## 10. Suggested order if time is short

1. Phase 1 (map visible) and Phase 0 cleanup
2. Phase 2 (visual status)
3. Phase 3 (text cut)
4. Phase 6 mobile table and recurrence heatmap
5. Phase 4 ladder graphic
6. Phase 5 category alignment
7. Phase 7 only if everything above is stable
