import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { routeAlertFixture, completeRouteAlertEvidence } from "./route-alerts.integration.test.mjs";
import { traversalTimestampMicros } from "../apps/web/src/lib/traffic/traversals.ts";

export async function runRouteAlertScenarios(tools) {
  const { base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList,
    keyboardSelect, loadMap, mapState, providerEvidence, refresh: refreshTraffic, screenshot, snapshot, replace } = tools;
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(status.API_URL).hostname), "Route alert fixture operations must remain local.");
  const primary = "primary-west", east = "primary-east", parallel = "alternative-west", opposite = "primary-west-inbound";
  const minute = 60000, q = JSON.stringify, iso = value => new Date(value).toISOString();
  const normalize = value => value.replace(/\s+/g, " ").trim();
  const runs = new Set(), sources = new Set(), users = new Set(), privateIds = new Set(), credentials = new Set([status.SERVICE_ROLE_KEY]);
  const serviceClient = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const original = await snapshot();
  assert.ok(original.fixture, "The harness must install the owned corridor first.");
  let fixtureTouched = false, reportingTouched = false;
  async function service(path, method = "GET", body, publicRead = false) {
    const key = publicRead ? status.ANON_KEY : status.SERVICE_ROLE_KEY;
    const response = await fetch(`${status.API_URL}/${path}`, {
      method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `Route alert fixture request failed (${response.status}); response and credentials withheld.`);
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  const rpc = (name, body = {}, publicRead = false) => service(`rest/v1/rpc/${name}`, "POST", body, publicRead);
  function privateFree(text) {
    for (const id of privateIds) assert.ok(!text.includes(id), "Public traffic never exposes private run, batch, report-source, request or account identities.");
    for (const key of credentials) assert.ok(!text.includes(key), "Maintenance and guest credentials never reach public traffic responses.");
  }
  async function phase5() {
    const result = await rpc("read_traffic_phase5", {}, true);
    assert.deepEqual(Object.keys(result).sort(), ["phase4", "route_comparison"]);
    assert.deepEqual(Object.keys(result.route_comparison).sort(), ["alternative_duration_us", "alternative_route_id", "alternative_segment_ids", "direction",
      "primary_duration_us", "primary_route_id", "primary_segment_ids", "provenance", "savings_us", "status", "supported_incident_ids", "valid_until"]);
    privateFree(JSON.stringify(result));
    assert.equal(result.route_comparison.provenance, "simulated");
    return result;
  }
  async function capture(run, fixture) {
    const batch = crypto.randomUUID(); privateIds.add(batch);
    fixtureTouched = true; await replace(fixture);
    const accepted = await rpc("capture_speed_evidence", { p_run_id: run, p_batch_id: batch });
    assert.equal(accepted.status, "accepted", "Fixture samples must pass real retained-evidence admission.");
    assert.equal(accepted.run_id, run); assert.equal(accepted.batch_id, batch);
    return batch;
  }
  async function prepare(savingsUs = 300000000, { complete = true, anchor, nearDeadline = false } = {}) {
    const fixture = routeAlertFixture(savingsUs, anchor ?? iso(Date.parse((await snapshot()).read_at) - 5 * minute));
    // Keep the exact helper motion, but omit already-stale pre-entry samples for the near-deadline capture.
    if (nearDeadline) fixture.observations = fixture.observations.filter(row => Date.parse(row.observed_at) >= Date.parse(fixture.corridor.anchor_at) - 6 * minute);
    const run = crypto.randomUUID(); runs.add(run); privateIds.add(run);
    const batch = await capture(run, fixture), context = { run, batch, fixture, savingsUs };
    if (complete) context.completions = await completeRouteAlertEvidence(serviceClient, context);
    return context;
  }
  async function available(savingsUs = 300000000) {
    const data = await phase5(), comparison = data.route_comparison;
    assert.equal(comparison.status, "available");
    assert.equal(comparison.primary_duration_us, 420000000 + savingsUs);
    assert.equal(comparison.alternative_duration_us, 420000000);
    assert.equal(comparison.savings_us, savingsUs, "The real completed-motion difference retains exact microseconds.");
    assert.deepEqual(comparison.primary_segment_ids, [primary, east]);
    assert.deepEqual(comparison.alternative_segment_ids, [parallel, "alternative-east"]);
    return data;
  }
  function incident(data, segment = primary) {
    const rows = data.phase4.incidents.filter(row => row.segment_id === segment && row.is_current);
    assert.equal(rows.length, 1, "Exactly one incident belongs to the latest owned run for this direction.");
    assert.equal(rows[0].cause, "unknown");
    return rows[0];
  }
  async function missing() {
    const comparison = (await phase5()).route_comparison;
    assert.equal(comparison.status, "missing");
    for (const field of ["primary_duration_us", "alternative_duration_us", "savings_us", "valid_until"]) assert.equal(comparison[field], null);
    assert.deepEqual(comparison.supported_incident_ids, []);
  }
  async function publicPrivacy(page) {
    await privacy(page);
    assert.equal((await page.cookies()).length, 0, "Public route browsing creates neither guest nor account cookies.");
    assert.equal(page.requests.some(request => /\/auth\/v1\//.test(new URL(request.url).pathname)), false);
    privateFree(await page.evaluate("document.documentElement.outerHTML"));
    const responses = page.requests.filter(request => request.completed && request.status === 200
      && new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic");
    assert.ok(responses.length, "Inspect actual public document or RSC responses, not only visible text.");
    for (const request of responses) {
      const response = await page.call("Network.getResponseBody", { requestId: request.requestId });
      privateFree(response.base64Encoded ? Buffer.from(response.body, "base64").toString() : response.body);
    }
  }
  async function sameCanvas(page) {
    assert.equal(await page.evaluate("window.__routeAlertCanvas?.isConnected && window.__routeAlertCanvas === document.querySelector('[data-map-state] canvas')"), true,
      "Refresh, selection and expiry retain the already-loaded map canvas.");
  }
  async function refresh(page, map = true) {
    await refreshTraffic(page); await ready(page);
    if (map) { await mapState(page, "ready"); await sameCanvas(page); }
  }
  function noTrafficRead(page, start) {
    assert.equal(page.requests.slice(start).some(request => new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic"), false,
      "Selection, elapsed expiry and unchanged snapshots do not silently reread traffic.");
  }
  async function surfaces(page, segment, state, { reason, seconds, map = true } = {}) {
    await selected(page, segment);
    const selectors = [`[data-route-alert-segment="${segment}"]`, `[data-route-alert-details="${segment}"]`, `[data-map-segment="${segment}"]`].slice(0, map ? 3 : 2);
    await page.waitFor(`(${q(selectors)}).every(selector => document.querySelector(selector)?.dataset.routeAlertState === ${q(state)})`, `shared ${segment} route alert ${state}`);
    const labels = await page.evaluate(`(${q(selectors)}).map(selector => {
      const element = document.querySelector(selector);
      return element.hasAttribute('data-map-segment') ? element.getAttribute('aria-label') : element.innerText;
    })`);
    assert.ok(labels.every(label => typeof label === "string" && label.length > 0));
    assert.equal(normalize(labels[0]), normalize(labels[1]), "List and details show the identical route alert label.");
    if (map) { assert.ok(normalize(labels[2]).includes(normalize(labels[0])), "The marker accessible name includes the identical label."); await sameCanvas(page); }
    assert.equal(await page.evaluate("document.querySelectorAll('[data-inspect-alternative]').length"), state === "alert" ? 1 : 0,
      "Only a positive selected route alert permits alternative inspection.");
    if (state === "alert") {
      assert.match(labels[0], /simulated.*estimated.*difference/i);
      assert.match(labels[0], /not.*end-to-end.*not guaranteed/i);
      assert.ok(labels[0].includes(`${seconds ?? "300"} seconds less`), "Presentation preserves the expected exact difference.");
    } else {
      assert.doesNotMatch(labels[0], /\d[\d,.]* seconds less/);
      assert.match(labels[0], state === "expired" ? /expired.*refresh.*historical/i : /No route alert/i);
    }
    if (reason) assert.match(labels[0], reason);
    await layout(page);
  }
  async function openMap(page) {
    await page.go("/traffic?segment=unknown-segment"); await ready(page); await page.text("Segment not found");
    assert.equal(await page.evaluate("new URL(location.href).searchParams.get('segment')"), "unknown-segment");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-route-alert-details], [data-inspect-alternative], [data-segment-list] [aria-current=\"true\"]').length"), 0,
      "An invalid selection must not borrow a primary alert or offer inspection.");
    await selectList(page, primary);
    const start = page.requests.length;
    await loadMap(page); await providerEvidence(page, start); await mapState(page, "ready");
    await page.evaluate("window.__routeAlertCanvas = document.querySelector('[data-map-state] canvas')");
  }
  async function selectionCases(page) {
    const data = await available();
    assert.equal(incident(data).state, "supported");
    assert.equal(data.phase4.incidents.some(row => row.segment_id === east && row.is_current && row.state === "supported"), false);
    await surfaces(page, primary, "alert");
    const start = page.requests.length;
    await keyboardSelect(page, east); await surfaces(page, east, "abstain", { reason: /No current supported incident/i });
    for (const segment of [parallel, opposite]) {
      await page.click(`[data-map-segment="${segment}"]`);
      await surfaces(page, segment, "abstain", { reason: /not on the affected primary route and direction/i });
    }
    await selectList(page, primary); await surfaces(page, primary, "alert");
    const history = await page.call("Page.getNavigationHistory"), entry = history.entries[history.currentIndex];
    await page.click("[data-inspect-alternative]");
    await surfaces(page, data.route_comparison.alternative_segment_ids[0], "abstain");
    const next = await page.call("Page.getNavigationHistory"), alternative = next.entries[next.currentIndex];
    assert.notEqual(alternative.id, entry.id, "Inspection pushes selection history rather than replacing it.");
    await page.call("Page.navigateToHistoryEntry", { entryId: entry.id }); await surfaces(page, primary, "alert");
    await page.call("Page.navigateToHistoryEntry", { entryId: alternative.id }); await surfaces(page, parallel, "abstain");
    await page.call("Page.navigateToHistoryEntry", { entryId: entry.id }); await surfaces(page, primary, "alert");
    noTrafficRead(page, start); await screenshot(page, "route-alert-exact-300");
  }
  async function thresholdAndMissingCases(page) {
    for (const [savingsUs, state, seconds] of [[299999999, "abstain", null], [300000001, "alert", "300.000001"]]) {
      await prepare(savingsUs); await available(savingsUs); await refresh(page);
      await surfaces(page, primary, state, { seconds, ...(state === "abstain" ? { reason: /below five minutes/i } : {}) });
    }
    const context = await prepare(300000000, { complete: false });
    await missing(); await refresh(page); await surfaces(page, primary, "abstain", { reason: /traversals are missing/i });
    await completeRouteAlertEvidence(serviceClient, { ...context, omit: ["alternative-east"] });
    await missing(); await refresh(page); await surfaces(page, primary, "abstain", { reason: /traversals are missing/i });
    await completeRouteAlertEvidence(serviceClient, { ...context, omit: [primary, east, parallel] });
    await available(); await refresh(page); await surfaces(page, primary, "alert");
  }
  async function membershipCases(page) {
    const context = await prepare();
    const shortened = structuredClone(context.fixture);
    shortened.route_segments = shortened.route_segments.filter(row => row.segment_id !== "alternative-east");
    await replace(shortened);
    assert.equal((await phase5()).route_comparison.status, "incompatible");
    await refresh(page); await surfaces(page, primary, "abstain", { reason: /incompatible/i });
    const absent = structuredClone(context.fixture);
    absent.routes = absent.routes.filter(row => row.id !== "alternative");
    absent.route_segments = absent.route_segments.filter(row => row.route_id !== "alternative");
    await replace(absent);
    assert.equal((await phase5()).route_comparison.status, "no_routes");
    await refresh(page); await surfaces(page, primary, "abstain", { reason: /fixed alternative route is unavailable/i });
    await replace(null); await refreshTraffic(page); await page.text("No synthetic traffic data");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-route-alert-segment],[data-route-alert-details],[data-inspect-alternative]').length"), 0);
    await replace(context.fixture); await refreshTraffic(page); await ready(page); await selected(page, primary);
    const start = page.requests.length;
    if (!await page.evaluate("!!document.querySelector('[data-map-state]')")) { await loadMap(page); await providerEvidence(page, start); }
    await mapState(page, "ready");
    await page.evaluate("window.__routeAlertCanvas = document.querySelector('[data-map-state] canvas')");
    await surfaces(page, primary, "alert");
  }
  function laterSamples(context, { partial = false, alternativeSlowdown = false } = {}) {
    const fixture = structuredClone(context.fixture), anchor = Date.parse(fixture.corridor.anchor_at);
    fixture.corridor.anchor_at = iso(anchor + (partial ? 1 : 6) * minute);
    fixture.observations = fixture.sources.flatMap(source => {
      if (partial && source.segment_id === primary && source.id !== `${primary}-source-1`) return [];
      const segment = fixture.segments.find(row => row.id === source.segment_id);
      const speed = source.segment_id === primary ? (alternativeSlowdown ? 9 : 28)
        : alternativeSlowdown && source.segment_id === parallel ? 8 : Math.round(segment.length_m / segment.baseline_seconds * 360) / 100;
      return Array.from({ length: partial ? 1 : 6 }, (_, index) => ({ segment_id: source.segment_id, source_id: source.id,
        observed_at: iso(anchor + (index + 1) * minute), speed_kph: speed }));
    });
    return fixture;
  }
  async function lifecycleCases(page, width, height) {
    const context = await prepare(300000000, { anchor: iso(Date.parse((await snapshot()).read_at) - 7 * minute) });
    const first = incident(await available()); assert.equal(first.state, "supported");
    await refresh(page); await surfaces(page, primary, "alert");
    const sibling = await createPage(width, height, { contextId: page.browserContextId });
    try {
      await sibling.go(`/traffic?segment=${primary}`); await ready(sibling); await surfaces(sibling, primary, "alert", { map: false });
      const pageStart = page.requests.length, siblingStart = sibling.requests.length;
      await capture(context.run, laterSamples(context, { partial: true }));
      const withdrawn = incident(await available());
      assert.equal(withdrawn.id, first.id); assert.equal(withdrawn.state, "unconfirmed"); assert.equal(withdrawn.cleared_at, null);
      await surfaces(page, primary, "alert"); await surfaces(sibling, primary, "alert", { map: false });
      noTrafficRead(page, pageStart); noTrafficRead(sibling, siblingStart);
      await refresh(page); await surfaces(page, primary, "abstain", { reason: /No current supported incident/i });
      await sibling.call("Page.bringToFront"); await surfaces(sibling, primary, "alert", { map: false });
      noTrafficRead(sibling, siblingStart);
      await refresh(sibling, false); await surfaces(sibling, primary, "abstain", { reason: /No current supported incident/i, map: false });
      await capture(context.run, laterSamples(context));
      const cleared = (await available()).phase4.incidents.find(row => row.id === first.id);
      assert.equal(cleared.state, "cleared"); assert.ok(cleared.cleared_at); assert.equal(cleared.recovered_source_count, 3);
      await refresh(page); await surfaces(page, primary, "abstain", { reason: /No current supported incident/i });
      await page.waitFor(`document.querySelector('[data-lifecycle-incident="${first.id}"]')?.dataset.lifecycleState === 'cleared'`, "historical clearance agrees with suppressed route alert");
      await refresh(sibling, false); await surfaces(sibling, primary, "abstain", { map: false }); await publicPrivacy(sibling);
    } finally { await disposePage(sibling); await page.call("Page.bringToFront"); }
  }
  async function alternativeSlowdownCase(page) {
    const context = await prepare(300000000, { anchor: iso(Date.parse((await snapshot()).read_at) - 7 * minute) });
    await available(); await refresh(page); await surfaces(page, primary, "alert");
    await capture(context.run, laterSamples(context, { alternativeSlowdown: true }));
    const data = await available();
    assert.equal(incident(data).state, "supported"); assert.equal(incident(data, parallel).state, "supported");
    await refresh(page); await surfaces(page, primary, "abstain", { reason: /alternative.*current supported simulated slowdown/i });
    await selectList(page, parallel); await surfaces(page, parallel, "abstain", { reason: /not on the affected primary route/i });
    await selectList(page, primary);
  }
  async function submitHazard(width, height) {
    let record;
    await withPage(width, height, {}, async page => {
      await page.go(`/traffic?segment=${parallel}`); await ready(page); await selected(page, parallel);
      await page.click(`a[href="/reports/new?segment=${parallel}"]`); await page.route("/reports/new"); await page.text("Prepare a demo report");
      await privacy(page); assert.equal((await page.cookies()).length, 0);
      page.reporting = true;
      await page.button("Continue as guest"); await page.text("Prepared as a temporary guest");
      const cookies = await page.cookies();
      const encoded = cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(cookie => cookie.value).join("");
      assert.ok(encoded.startsWith("base64-"), "Decode only the browser-created guest for scoped cleanup.");
      const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString());
      assert.ok(session.user?.id); users.add(session.user.id); privateIds.add(session.user.id);
      for (const token of [session.access_token, session.refresh_token]) if (token) credentials.add(token);
      const owned = await service(`rest/v1/report_sources?user_id=eq.${session.user.id}&select=id`);
      for (const row of owned) { sources.add(row.id); privateIds.add(row.id); }
      assert.equal(owned.length, 1);
      assert.ok(cookies.every(cookie => cookie.name.startsWith("trafficsense-report-guest") && cookie.httpOnly && cookie.sameSite === "Lax"));
      assert.equal(await page.evaluate("document.cookie.includes('trafficsense-report-guest')"), false);
      assert.equal(await page.evaluate("document.querySelector('[name=segment_id]').value"), parallel);
      await page.click('[name="category"]'); await page.key("Home", "Home", 36); await page.key("ArrowDown", "ArrowDown", 40); await page.key("Enter", "Enter", 13);
      assert.equal(await page.evaluate("document.querySelector('[name=category]').value"), "accident");
      await page.click('button[type="submit"]'); await page.waitFor("!!document.querySelector('[data-report-saved]')", "real alternative hazard report committed");
      const id = await page.evaluate("document.querySelector('[data-report-saved]').dataset.reportSaved");
      const draft = await page.evaluate("JSON.parse(sessionStorage.getItem('trafficsense-pending-demo-report'))");
      assert.ok(sources.has(draft.source_id)); privateIds.add(draft.request_id);
      const persisted = await service(`rest/v1/traffic_reports_private?source_id=eq.${draft.source_id}&request_id=eq.${draft.request_id}&select=public_id`);
      assert.equal(persisted.length, 1); assert.equal(persisted[0].public_id, id);
      await page.waitFor("document.querySelector('[data-report-saved] button')?.disabled === false", "report transition settles");
      await page.click('a[href*="#segment-reports"]'); await page.route("/traffic"); await ready(page); await selected(page, parallel);
      await page.waitFor(`!!document.querySelector('[data-public-report="${id}"]')`, "owned unconfirmed report appears on the alternative");
      assert.match(await page.evaluate(`document.querySelector('[data-public-report="${id}"]').innerText`), /unconfirmed/i);
      await layout(page); await privacy(page); privateFree(await page.evaluate("document.documentElement.outerHTML"));
      record = { id, sourceId: draft.source_id };
    });
    return record;
  }
  async function removeSource(id) {
    assert.ok(sources.has(id), "Report cleanup is limited to sources created by this scenario.");
    assert.equal((await rpc("cleanup_traffic_reports", { p_source_ids: [id] })).status, "ready");
    sources.delete(id);
  }
  async function hazardCase(page, width, height) {
    await prepare(); await available(); await refresh(page); await surfaces(page, primary, "alert");
    reportingTouched = true; await rpc("set_reporting_enabled", { p_enabled: true });
    const start = page.requests.length, report = await submitHazard(width, height);
    const data = await available(), saved = data.phase4.traffic.reports.find(row => row.id === report.id);
    assert.ok(saved); assert.equal(saved.segment_id, parallel); assert.equal(saved.direction, "outbound"); assert.equal(saved.category, "accident");
    const read = traversalTimestampMicros(data.phase4.traffic.read_at);
    assert.ok(traversalTimestampMicros(saved.observed_at) > read - 1200000000 && traversalTimestampMicros(saved.observed_at) <= read);
    await page.call("Page.bringToFront"); await surfaces(page, primary, "alert"); noTrafficRead(page, start);
    await refresh(page); await surfaces(page, primary, "abstain", { reason: /alternative.*recent reported, unconfirmed hazard/i });
    await selectList(page, parallel); await surfaces(page, parallel, "abstain");
    await page.waitFor(`!!document.querySelector('[data-public-report="${report.id}"]')`, "refreshed alternative exposes the same reported hazard");
    await selectList(page, primary);
    const removalStart = page.requests.length;
    await removeSource(report.sourceId);
    assert.equal((await phase5()).phase4.traffic.reports.some(row => row.id === report.id), false);
    await surfaces(page, primary, "abstain", { reason: /reported, unconfirmed hazard/i }); noTrafficRead(page, removalStart);
    await refresh(page); await surfaces(page, primary, "alert");
  }
  async function waitForDeadline(deadline) {
    const stop = performance.now() + 35000;
    while (traversalTimestampMicros((await snapshot()).read_at) < traversalTimestampMicros(deadline)) {
      assert.ok(performance.now() < stop, "The actual database deadline must arrive within thirty-five seconds.");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  async function expiryCase(page, width, height, freeze) {
    const sibling = freeze ? await createPage(width, height, { contextId: page.browserContextId }) : null;
    try {
      await page.call("Page.bringToFront");
      const anchor = iso(Date.parse((await snapshot()).read_at) - 14 * minute + 25000);
      const context = await prepare(300000000, { anchor, nearDeadline: true });
      const data = await available(), deadline = data.route_comparison.valid_until;
      assert.equal(traversalTimestampMicros(deadline), Math.min(...context.completions.map(row => traversalTimestampMicros(row.entered_at) + 1200000000)));
      assert.ok(traversalTimestampMicros(incident(data).valid_until) > traversalTimestampMicros(deadline), "The route completion, not incident support, supplies the earliest expiry.");
      const remaining = traversalTimestampMicros(deadline) - traversalTimestampMicros(data.phase4.traffic.read_at);
      assert.ok(remaining > 5000000 && remaining <= 25000000, "The genuine fresh alert has a bounded near deadline.");
      await refresh(page); await surfaces(page, primary, "alert");
      const start = page.requests.length;
      if (sibling) {
        await sibling.call("Page.bringToFront"); await page.waitFor("document.visibilityState === 'hidden'", "real route alert background tab");
        await page.call("Page.setWebLifecycleState", { state: "frozen" });
        await waitForDeadline(deadline);
        await page.call("Page.setWebLifecycleState", { state: "active" }); await page.call("Page.bringToFront");
        await page.waitFor("document.visibilityState === 'visible'", "route alert frozen tab resumes");
      }
      await surfaces(page, primary, "expired"); await waitForDeadline(deadline);
      await page.evaluate("window.__routeAlertNativeNow = Date.now");
      for (const offset of [86400000, -86400000]) {
        await page.evaluate(`Date.now = () => window.__routeAlertNativeNow() + ${offset}; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))`);
        await surfaces(page, primary, "expired");
      }
      noTrafficRead(page, start);
      await page.evaluate("Date.now = window.__routeAlertNativeNow; delete window.__routeAlertNativeNow");
      await screenshot(page, freeze ? "route-alert-frozen-expiry" : "route-alert-timer-expiry");
      assert.equal((await phase5()).route_comparison.status, "stale");
      await refresh(page); await surfaces(page, primary, "abstain", { reason: /traversals are stale.*refresh/i });
    } finally {
      try {
        await page.call("Page.setWebLifecycleState", { state: "active" }); await page.call("Page.bringToFront");
        await page.evaluate("if (window.__routeAlertNativeNow) { Date.now = window.__routeAlertNativeNow; delete window.__routeAlertNativeNow; }");
      } finally { if (sibling) await disposePage(sibling); }
    }
  }
  let failure;
  try {
    // Preflight the public contract and preserve unrelated reports before any mutation.
    const initial = await phase5(), read = traversalTimestampMicros(initial.phase4.traffic.read_at);
    assert.equal(initial.phase4.traffic.reports.some(row => [parallel, "alternative-east"].includes(row.segment_id) && row.direction === "outbound"
      && ["accident", "road_repair", "flood", "landslide", "road_closed"].includes(row.category)
      && traversalTimestampMicros(row.observed_at) > read - 1200000000 && traversalTimestampMicros(row.observed_at) <= read
      && traversalTimestampMicros(row.received_at) <= read), false, "Run serially without pre-existing recent alternative hazards; unrelated reports are never removed.");
    for (const [index, [width, height]] of viewports.entries()) {
      await prepare();
      await withPage(width, height, {}, async page => {
        await openMap(page); await selectionCases(page);
        await thresholdAndMissingCases(page); await membershipCases(page);
        await lifecycleCases(page, width, height);
        await alternativeSlowdownCase(page);
        await hazardCase(page, width, height);
        await expiryCase(page, width, height, index === 0);
        await publicPrivacy(page); await layout(page);
      });
      console.log(`PASS route alerts ${base} ${width}px: exact300/299.999999/300.000001 motion, selected incident/direction, inspection/history/invalid selection, missing/newer partial run, withdrawal/clearance, alternative slowdown/reported hazard, explicit two-tab refresh, retained canvas, privacy and ${index === 0 ? "frozen" : "timer"} expiry`);
    }
  } catch (error) { failure = error; }
  finally {
    const failures = failure ? [failure] : [];
    async function cleanup(action) { try { await action(); } catch (error) { failures.push(error); } }
    for (const id of sources) await cleanup(() => removeSource(id));
    for (const id of users) await cleanup(() => service(`auth/v1/admin/users/${id}`, "DELETE"));
    for (const run of runs) await cleanup(async () => { assert.equal((await rpc("cleanup_speed_evidence", { p_run_id: run })).status, "ready"); });
    if (reportingTouched) await cleanup(() => rpc("set_reporting_enabled", { p_enabled: original.reporting_enabled }));
    if (fixtureTouched) await cleanup(() => replace(original.fixture));
    await cleanup(async () => {
      const restored = await snapshot();
      for (const key of ["fixture", "reports", "incident_episodes", "reporting_enabled"]) assert.deepEqual(restored[key], original[key], "Owned cleanup preserves the original public fixture, reports, episodes and reporting gate.");
    });
    if (failures.length) failure = new AggregateError(failures, "Route alert scenarios or owned cleanup failed; inspect local state before rerunning.");
  }
  if (failure) throw failure;
}
