import assert from "node:assert/strict";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { authoredMotionSchedule } from "../apps/web/src/lib/traffic/motion-schedule.ts";
import { completedTraversalInput, retainedMotionSchedule, simulateTraversal, traversalTimestampMicros } from "../apps/web/src/lib/traffic/traversals.ts";

export async function runPhase4Scenarios(tools) {
  const { base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList,
    keyboardSelect, loadMap, mapState, providerEvidence, refresh: refreshTraffic, screenshot, snapshot, replace } = tools;
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(status.API_URL).hostname), "Phase four fixture operations must remain local.");
  const primary = "primary-west", opposite = "primary-west-inbound", parallel = "alternative-west";
  const minute = 60000, q = JSON.stringify, iso = value => new Date(value).toISOString();
  const normalize = value => value.replace(/\s+/g, " ").trim();
  const runs = new Set(), privateIds = new Set();
  const original = await snapshot();
  assert.ok(original.fixture, "The harness must install the owned corridor first.");
  async function rpc(name, input = {}, publicRead = false) {
    const key = publicRead ? status.ANON_KEY : status.SERVICE_ROLE_KEY;
    const response = await fetch(`${status.API_URL}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(input), signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `Phase four ${name} failed (${response.status}); response and credentials withheld.`);
    return response.json();
  }
  async function phase4() {
    const result = await rpc("read_traffic_phase4", {}, true);
    assert.deepEqual(Object.keys(result).sort(), ["incidents", "traffic", "traversals"]);
    const derived = JSON.stringify({ incidents: result.incidents, traversals: result.traversals });
    for (const id of privateIds) assert.ok(!derived.includes(id), "Derived public projections never disclose run or batch identities.");
    for (const rows of [result.incidents, result.traversals]) for (const row of rows) {
      assert.equal(row.provenance, "simulated");
      for (const key of ["run_id", "batch_id", "source_id", "user_id", "account_id", "assignment_start", "assignment_end"]) {
        assert.equal(Object.hasOwn(row, key), false, "Private provenance and assignment bounds stay out of public rows.");
      }
    }
    return result;
  }
  function newRun() {
    const id = crypto.randomUUID(); runs.add(id); privateIds.add(id); return id;
  }
  async function capture(run, value, batch = crypto.randomUUID()) {
    privateIds.add(batch);
    await replace(value);
    const input = { p_run_id: run, p_batch_id: batch };
    const accepted = await rpc("capture_speed_evidence", input);
    assert.equal(accepted.status, "accepted", "Every fixture capture must actually be admitted.");
    assert.equal(accepted.run_id, run); assert.equal(accepted.batch_id, batch);
    assert.deepEqual(await rpc("capture_speed_evidence", input), { ...accepted, replayed: true }, "Original batch retry must not create another transition.");
    return batch;
  }
  async function currentIncident() {
    const rows = (await phase4()).incidents.filter(row => row.segment_id === primary && row.is_current && row.state !== "cleared");
    assert.equal(rows.length, 1, "Exactly one open incident belongs to the explicitly selected run.");
    assert.equal(rows[0].cause, "unknown");
    return rows[0];
  }
  async function publicPrivacy(page) {
    await privacy(page);
    assert.equal((await page.cookies()).length, 0, "Public phase four browsing does not create account or guest sessions.");
    assert.equal(page.requests.some(request => /\/auth\/v1\//.test(new URL(request.url).pathname)), false);
    const html = await page.evaluate("document.documentElement.outerHTML");
    for (const id of privateIds) assert.ok(!html.includes(id), "Run/batch IDs must not be embedded in rendered documents.");
    assert.ok(!html.includes(status.SERVICE_ROLE_KEY), "No maintenance credential reaches the browser.");
  }
  async function rememberCanvas(page) {
    await mapState(page, "ready");
    await page.evaluate("window.__phase4Canvas = document.querySelector('[data-map-state] canvas')");
  }
  async function sameCanvas(page) {
    assert.equal(await page.evaluate("window.__phase4Canvas?.isConnected && window.__phase4Canvas === document.querySelector('[data-map-state] canvas')"), true,
      "Data refresh, time expiry and selection retain the existing map canvas.");
  }
  async function refresh(page) {
    const hadCanvas = await page.evaluate("!!document.querySelector('[data-map-state] canvas')");
    await refreshTraffic(page); await ready(page);
    if (hadCanvas) { await mapState(page, "ready"); await sameCanvas(page); }
  }
  async function openMap(page) {
    await page.go(`/traffic?segment=${primary}`); await ready(page); await selected(page, primary);
    const start = page.requests.length;
    await loadMap(page); await providerEvidence(page, start); await rememberCanvas(page); await publicPrivacy(page);
  }
  function noTrafficRead(page, start) {
    assert.equal(page.requests.slice(start).some(request => new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic"), false,
      "Selection and elapsed expiry do not fetch a new traffic snapshot.");
  }
  async function surfaces(page, segment, delayState, { incident, incidentState, delay, map = true } = {}) {
    await selected(page, segment);
    const delaySelectors = [`[data-segment-delay="${segment}"]`, `[data-completed-traversal="${segment}"]`, `[data-map-segment="${segment}"]`].slice(0, map ? 3 : 2);
    await page.waitFor(`(${q(delaySelectors)}).every(selector => document.querySelector(selector)?.dataset.delayState === ${q(delayState)})`, `shared ${segment} delay ${delayState}`);
    if (incident) await page.waitFor(`document.querySelector('[data-lifecycle-incident="${incident}"]')?.dataset.lifecycleState === ${q(incidentState)}`, `incident ${incident.slice(0, 8)} ${incidentState}`);
    const labels = await page.evaluate(`(() => {
      const list = document.querySelector('[data-segment-lifecycle="${segment}"]');
      const detail = document.querySelector('[data-lifecycle-summary="${segment}"]');
      const marker = document.querySelector('[data-map-segment="${segment}"]');
      const delay = document.querySelector('[data-segment-delay="${segment}"]');
      return {list: list?.innerText, detail: detail?.innerText, marker: marker?.getAttribute('aria-label'),
        markerLifecycle: marker?.dataset.lifecycleLabel, delay: delay?.innerText,
        completed: document.querySelector('[data-completed-traversal="${segment}"]')?.innerText};
    })()`);
    assert.ok(labels.list && labels.detail && labels.delay && labels.completed, "List and details expose both derived summaries.");
    assert.equal(normalize(labels.list), normalize(labels.detail));
    if (incident) {
      const expected = { supported: /simulated slowdown supported/, unconfirmed: /support withdrawn.*not cleared/,
        cleared: /Historical clearance/, stale: /Stale incident evidence.*not cleared/ }[incidentState];
      assert.match(normalize(labels.list), expected, "The shared current summary agrees with the persisted incident state.");
    }
    assert.ok(normalize(labels.completed).includes(normalize(labels.delay)));
    assert.match(labels.completed, /not incident-caused delay/);
    if (delay !== undefined) assert.ok(normalize(labels.delay).includes(`${delay} seconds excess traversal time`));
    if (delayState !== "available") assert.doesNotMatch(labels.delay, /\d[\d,.]* seconds excess traversal time/);
    if (map) {
      assert.equal(normalize(labels.markerLifecycle), normalize(labels.list));
      assert.ok(normalize(labels.marker).includes(normalize(labels.list)));
      assert.ok(normalize(labels.marker).includes(normalize(labels.delay)));
      await sameCanvas(page);
    }
    await layout(page);
  }
  async function inspectIncident(page, id, state, prior) {
    await page.call("Page.bringToFront");
    const selector = `[data-lifecycle-incident="${id}"]`;
    await page.waitFor(`document.querySelector(${q(selector)})?.dataset.lifecycleState === ${q(state)}`, "persisted incident history state");
    await page.click(`${selector} summary`);
    assert.equal(await page.evaluate(`document.querySelector(${q(selector)}).open`), true, "Incident history opens by a real disclosure interaction.");
    const text = await page.evaluate(`document.querySelector(${q(selector)}).innerText`);
    assert.ok(text.includes(id)); assert.match(text, /Cause: unknown/);
    if (state === "cleared") assert.match(text, /Historical clearance recorded/);
    if (prior) { assert.match(text, /Reopened after incident/); assert.ok(text.includes(prior)); }
    await page.key("Enter", "Enter", 13);
    await page.waitFor(`!document.querySelector(${q(selector)}).open`, "keyboard closes incident history");
  }
  async function ingestMotion(run, batch, value, segmentId, enteredAt, until, retained = true) {
    const segment = value.segments.find(row => row.id === segmentId), source = value.sources.find(row => row.segment_id === segmentId);
    const schedule = retained ? retainedMotionSchedule(await rpc("read_traversal_context", { p_run_id: run, p_batch_id: batch, p_source_id: source.id }))
      : authoredMotionSchedule(value.corridor.scenario, segment, value.corridor.anchor_at);
    const movement = simulateTraversal(segment.length_m, schedule, enteredAt, until);
    const ids = { run_id: run, batch_id: batch, source_id: source.id, traversal_id: crypto.randomUUID() };
    if (movement.state === "partial") {
      assert.throws(() => completedTraversalInput(ids, segment, movement));
      assert.deepEqual(await rpc("check_completed_traversal", { p_traversal_id: ids.traversal_id }), { status: "not_found" });
      return null;
    }
    const input = completedTraversalInput(ids, segment, movement);
    const accepted = await rpc("ingest_completed_traversal", { p_traversal: input });
    assert.equal(accepted.status, "accepted");
    assert.deepEqual(await rpc("ingest_completed_traversal", { p_traversal: input }), { ...accepted, replayed: true });
    return movement;
  }
  async function traversalCases(page) {
    const now = Date.parse((await snapshot()).read_at), anchor = now - 6 * minute;
    const value = createTrafficFixture("slowdown", iso(anchor)), run = newRun();
    const batch = await capture(run, value);
    const incident = await currentIncident();
    const movement = await ingestMotion(run, batch, value, primary, iso(anchor - 6 * minute), iso(anchor + 315000));
    assert.equal(movement.elapsed_seconds, 675);
    await ingestMotion(run, batch, value, opposite, iso(anchor - 3 * minute), iso(anchor));
    assert.equal(await ingestMotion(run, batch, value, parallel, iso(anchor - minute), iso(anchor)), null, "Partial movement never becomes zero delay.");
    const saved = await phase4();
    assert.equal(saved.traversals.find(row => row.segment_id === primary).delay_seconds, 495);
    assert.equal(saved.traversals.find(row => row.segment_id === opposite).delay_seconds, 0);
    assert.equal(saved.traversals.find(row => row.segment_id === parallel).status, "missing");
    await refresh(page);
    await surfaces(page, primary, "available", { incident: incident.id, incidentState: "supported", delay: 495 });
    const start = page.requests.length;
    await keyboardSelect(page, opposite); await surfaces(page, opposite, "available", { delay: 0 });
    const history = await page.call("Page.getNavigationHistory"), entry = history.entries[history.currentIndex];
    await page.click(`[data-map-segment="${parallel}"]`); await surfaces(page, parallel, "missing");
    await page.call("Page.navigateToHistoryEntry", { entryId: entry.id }); await surfaces(page, opposite, "available", { delay: 0 });
    await selectList(page, primary); await surfaces(page, primary, "available", { incident: incident.id, incidentState: "supported", delay: 495 });
    noTrafficRead(page, start); await screenshot(page, "phase4-complete-traversal-495");
  }
  function lifecycleFixture(start, first, last, speed, partial = false) {
    const value = createTrafficFixture("normal", iso(start + last * minute));
    value.observations = value.sources.flatMap(source => Array.from({ length: last - first + 1 }, (_, index) => {
      const segment = value.segments.find(row => row.id === source.segment_id);
      return { segment_id: source.segment_id, source_id: source.id, observed_at: iso(start + (first + index) * minute),
        speed_kph: source.segment_id === primary ? speed : Math.round(segment.length_m / segment.baseline_seconds * 360) / 100 };
    }));
    if (partial) value.observations = value.observations.filter(row => row.segment_id !== primary || row.source_id === `${primary}-source-1`);
    return value;
  }
  async function lifecycleCases(page, width, height) {
    const run = newRun(), start = Date.parse((await snapshot()).read_at) - 17 * minute - 10000;
    await capture(run, lifecycleFixture(start, 0, 5, 8));
    const first = await currentIncident(); assert.equal(first.state, "supported"); assert.equal(first.prior_incident_id, null);
    await refresh(page); await surfaces(page, primary, "missing", { incident: first.id, incidentState: "supported" });
    const sibling = await createPage(width, height, { contextId: page.browserContextId });
    let reopened, finalFixture;
    try {
      await sibling.go(`/traffic?segment=${primary}`); await ready(sibling);
      await surfaces(sibling, primary, "missing", { incident: first.id, incidentState: "supported", map: false });
      await capture(run, lifecycleFixture(start, 6, 6, 28, true));
      const withdrawn = await currentIncident(); assert.equal(withdrawn.id, first.id); assert.equal(withdrawn.state, "unconfirmed"); assert.equal(withdrawn.cleared_at, null);
      await refresh(page); await surfaces(page, primary, "missing", { incident: first.id, incidentState: "unconfirmed" });
      await sibling.call("Page.bringToFront");
      await surfaces(sibling, primary, "missing", { incident: first.id, incidentState: "supported", map: false });
      await refresh(sibling); await surfaces(sibling, primary, "missing", { incident: first.id, incidentState: "unconfirmed", map: false });
      await capture(run, lifecycleFixture(start, 6, 6, 28));
      assert.equal((await currentIncident()).state, "unconfirmed", "Equal-terminal late membership cannot rewrite the prior transition.");
      await capture(run, lifecycleFixture(start, 7, 11, 28));
      const cleared = (await phase4()).incidents.find(row => row.id === first.id);
      assert.equal(cleared.state, "cleared"); assert.ok(cleared.cleared_at); assert.equal(cleared.recovered_source_count, 3);
      await refresh(page); await surfaces(page, primary, "missing", { incident: first.id, incidentState: "cleared" });
      await inspectIncident(page, first.id, "cleared");
      finalFixture = lifecycleFixture(start, 12, 17, 8);
      await capture(run, finalFixture);
      reopened = await currentIncident();
      assert.equal(reopened.state, "supported"); assert.notEqual(reopened.id, first.id); assert.equal(reopened.prior_incident_id, first.id);
      assert.ok(traversalTimestampMicros(reopened.started_at) > traversalTimestampMicros(cleared.recovery_end));
      assert.deepEqual((await phase4()).incidents.find(row => row.id === first.id), cleared, "Reopening preserves the exact historical clearance.");
      await refresh(page); await surfaces(page, primary, "missing", { incident: reopened.id, incidentState: "supported" });
      await inspectIncident(page, reopened.id, "supported", first.id);
      await page.waitFor(`document.querySelector('[data-lifecycle-incident="${first.id}"]')?.dataset.lifecycleState === 'cleared'`, "old clearance remains separately visible");
      await refresh(sibling); await surfaces(sibling, primary, "missing", { incident: reopened.id, incidentState: "supported", map: false });
      await publicPrivacy(sibling);
    } finally { await disposePage(sibling); await page.call("Page.bringToFront"); }
    await screenshot(page, "phase4-cleared-and-reopened");
    const beforeReset = await phase4();
    await replace(null); await refreshTraffic(page); await page.text("No synthetic traffic data");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-segment-lifecycle],[data-lifecycle-incident],[data-segment-delay],[data-completed-traversal],[data-map-segment]').length"), 0);
    const empty = await phase4(); assert.deepEqual(empty.incidents, []); assert.deepEqual(empty.traversals, []);
    await replace(finalFixture); await refreshTraffic(page); await ready(page); await selected(page, primary);
    const ownedHistory = rows => rows.filter(row => row.id === first.id || row.id === reopened.id).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(ownedHistory((await phase4()).incidents), ownedHistory(beforeReset.incidents), "Reset/restoration hides and restores retained history without clearing it.");
    const mapStart = page.requests.length;
    if (!await page.evaluate("!!document.querySelector('[data-map-state]')")) { await loadMap(page); await providerEvidence(page, mapStart); }
    await rememberCanvas(page); await surfaces(page, primary, "missing", { incident: reopened.id, incidentState: "supported" });
    await keyboardSelect(page, opposite); await surfaces(page, opposite, "missing");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-lifecycle-incident="${reopened.id}"]')`), false, "Opposite-direction details cannot borrow this cycle.");
    await selectList(page, parallel); await surfaces(page, parallel, "missing");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-lifecycle-incident="${reopened.id}"]')`), false, "Parallel-road details cannot borrow this cycle.");
    await selectList(page, primary);
  }
  async function waitForDeadline(deadline) {
    const stop = performance.now() + 30000;
    while (traversalTimestampMicros((await snapshot()).read_at) < traversalTimestampMicros(deadline)) {
      assert.ok(performance.now() < stop, "The actual database expiry must arrive within thirty seconds.");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  async function expiryCase(page, width, height, freeze) {
    const sibling = freeze ? await createPage(width, height, { contextId: page.browserContextId }) : null;
    let incident, deadline, requestStart;
    try {
      await page.call("Page.bringToFront");
      const now = Date.parse((await snapshot()).read_at), entered = now - 20 * minute + 20000;
      deadline = iso(entered + 20 * minute);
      const value = createTrafficFixture("slowdown", iso(entered + 6 * minute));
      value.observations = value.observations.filter(row => Date.parse(row.observed_at) >= entered && Date.parse(row.observed_at) <= entered + 5 * minute);
      const run = newRun(), batch = await capture(run, value);
      incident = await currentIncident();
      assert.equal(traversalTimestampMicros(incident.valid_until), traversalTimestampMicros(deadline), "The oldest retained slowdown point controls expiry.");
      const motion = await ingestMotion(run, batch, value, primary, iso(entered), iso(entered + 675000), false);
      assert.equal(motion.elapsed_seconds, 675);
      const withdraw = width === 390;
      if (withdraw) {
        const partial = structuredClone(value);
        partial.observations.push({ ...partial.observations.find(row => row.segment_id === primary), observed_at: iso(entered + 6 * minute), speed_kph: 28 });
        await capture(run, partial);
        assert.equal((await currentIncident()).state, "unconfirmed");
      }
      const saved = (await phase4()).traversals.find(row => row.segment_id === primary);
      assert.equal(saved.delay_seconds, 495); assert.equal(traversalTimestampMicros(saved.valid_until), traversalTimestampMicros(deadline));
      await refresh(page); await surfaces(page, primary, "available", { incident: incident.id, incidentState: withdraw ? "unconfirmed" : "supported", delay: 495 });
      requestStart = page.requests.length;
      if (sibling) {
        await sibling.call("Page.bringToFront"); await page.waitFor("document.visibilityState === 'hidden'", "real phase four background tab");
        await page.call("Page.setWebLifecycleState", { state: "frozen" });
        await waitForDeadline(deadline);
        await page.call("Page.setWebLifecycleState", { state: "active" }); await page.call("Page.bringToFront");
        await page.waitFor("document.visibilityState === 'visible'", "phase four frozen tab resumes");
      }
      await surfaces(page, primary, "stale", { incident: incident.id, incidentState: "stale" });
      await waitForDeadline(deadline);
      await page.evaluate("window.__phase4NativeDateNow = Date.now");
      for (const offset of [86400000, -86400000]) {
        await page.evaluate(`Date.now = () => window.__phase4NativeDateNow() + ${offset}; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))`);
        await surfaces(page, primary, "stale", { incident: incident.id, incidentState: "stale" });
      }
      noTrafficRead(page, requestStart);
      await page.evaluate("Date.now = window.__phase4NativeDateNow; delete window.__phase4NativeDateNow");
      await screenshot(page, freeze ? "phase4-frozen-expiry" : "phase4-timer-expiry");
      await refresh(page); await surfaces(page, primary, "stale", { incident: incident.id, incidentState: "stale" });
      const stale = await phase4();
      assert.equal(stale.incidents.find(row => row.id === incident.id).state, "stale");
      assert.equal(stale.incidents.find(row => row.id === incident.id).cleared_at, null);
      assert.equal(stale.traversals.find(row => row.segment_id === primary).status, "stale");
      assert.equal(stale.traversals.find(row => row.segment_id === primary).delay_seconds, null);
    } finally {
      try {
        await page.call("Page.setWebLifecycleState", { state: "active" }); await page.call("Page.bringToFront");
        await page.evaluate("if (window.__phase4NativeDateNow) { Date.now = window.__phase4NativeDateNow; delete window.__phase4NativeDateNow; }");
      } finally { if (sibling) await disposePage(sibling); }
    }
  }
  let failure;
  try {
    // The public RPC preflight precedes any fixture or retained-run mutation.
    await phase4();
    for (const [index, [width, height]] of viewports.entries()) {
      await withPage(width, height, {}, async page => {
        await openMap(page);
        await traversalCases(page);
        await lifecycleCases(page, width, height);
        await expiryCase(page, width, height, index === 0);
        await publicPrivacy(page); await layout(page);
      });
      console.log(`PASS phase four ${base} ${width}px: retained support/withdrawal/clearance/reopening, completed 495/zero/partial delay, two tabs, shared map/list/details, canvas identity, reset/restoration and ${index === 0 ? "frozen" : "timer"} expiry`);
    }
  } catch (error) { failure = error; }
  finally {
    const failures = failure ? [failure] : [];
    for (const run of runs) {
      try { assert.equal((await rpc("cleanup_speed_evidence", { p_run_id: run })).status, "ready"); }
      catch (error) { failures.push(error); }
    }
    try {
      await replace(original.fixture);
      const restored = await snapshot();
      assert.deepEqual(restored.fixture, original.fixture); assert.deepEqual(restored.reports, original.reports);
      assert.deepEqual(restored.incident_episodes, original.incident_episodes);
      assert.equal(restored.reporting_enabled, original.reporting_enabled);
    } catch (error) { failures.push(error); }
    if (failures.length) failure = new AggregateError(failures, "Phase four scenarios or owned cleanup failed; inspect local state before rerunning.");
  }
  if (failure) throw failure;
}
