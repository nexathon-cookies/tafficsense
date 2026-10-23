import assert from "node:assert/strict";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { formatTrafficTime } from "../apps/web/src/lib/traffic/presentation.ts";
import { runEvidenceScenarios } from "./evidence-browser-scenarios.mjs";

export async function runSlowdownScenarios(tools) {
  const { base, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList, keyboardSelect,
    loadMap, mapState, providerEvidence, refresh: refreshTraffic, screenshot, snapshot, replace } = tools;
  const q = JSON.stringify;
  const primaryId = "primary-west";
  const oppositeId = "primary-west-inbound";
  const parallelId = "alternative-west";
  const minute = 60000;
  const original = await snapshot();
  assert.ok(original.fixture, "The harness must install the owned corridor before slowdown scenarios.");
  for (const id of [primaryId, oppositeId, parallelId]) {
    assert.equal(original.report_assessments.find(row => row.segment_id === id)?.recent_report_count, 0,
      "Run serially without pre-existing recent reports on controlled segments; never delete unrelated reports.");
  }
  const iso = value => new Date(value).toISOString();
  const normalizeText = value => value.replace(/\s+/g, " ").trim();
  const selectors = id => [`[data-segment-slowdown="${id}"]`, `[data-slowdown-assessment="${id}"]`, `[data-map-segment="${id}"]`];
  const stateExpression = (id, state, map = true) => `(${q(selectors(id).slice(0, map ? 3 : 2))}).every(selector => document.querySelector(selector)?.dataset.slowdownState === ${q(state)})`;
  const sourceId = `${primaryId}-source-1`;
  function micros(value) {
    const fraction = /\.(\d{1,6})/.exec(value)?.[1] ?? "";
    return Date.parse(value) * 1000 + Number(fraction.padEnd(6, "0").slice(3));
  }
  function observationRows(value) {
    return value.observations.map(row => [row.segment_id, row.source_id, micros(row.observed_at), row.speed_kph])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  async function persist(value) {
    await replace(value);
    const stored = await snapshot();
    assert.deepEqual(stored.reports, value ? original.reports : [], "Replacement preserves unrelated reports; reset only hides them.");
    assert.equal(stored.reporting_enabled, original.reporting_enabled, "Traffic replacement does not change the reporting gate.");
    if (value) {
      assert.deepEqual(observationRows(stored.fixture), observationRows(value), "Real storage preserves speeds, source bindings and exact microsecond timestamps.");
      assert.deepEqual(stored.fixture.sources, [...value.sources].sort((a, b) => a.id.localeCompare(b.id)), "Persisted synthetic sources are not inferred from reports.");
    } else assert.equal(stored.fixture, null);
    return stored;
  }
  async function freshFixture(scenario = "slowdown", offset = -1000) {
    return createTrafficFixture(scenario, iso(Date.parse((await snapshot()).read_at) + offset));
  }
  async function rememberCanvas(page) {
    await mapState(page, "ready");
    await page.evaluate("window.__slowdownCanvas = document.querySelector('[data-map-state] canvas')");
  }
  async function refresh(page) {
    await page.evaluate("window.__slowdownRefreshCanvas = document.querySelector('[data-map-state] canvas')");
    await refreshTraffic(page);
    await ready(page);
    if (await page.evaluate("!!document.querySelector('[data-map-state]')")) {
      await rememberCanvas(page);
      assert.equal(await page.evaluate("!window.__slowdownRefreshCanvas || window.__slowdownRefreshCanvas === document.querySelector('[data-map-state] canvas')"), true,
        "Data-only refreshes update existing markers without rebuilding unchanged map geometry.");
    }
  }
  async function sameCanvas(page) {
    assert.equal(await page.evaluate("document.querySelector('[data-map-state] canvas') === window.__slowdownCanvas && window.__slowdownCanvas?.isConnected"), true,
      "Timer ticks and selection must update marker content without recreating the map canvas.");
  }
  async function publicPrivacy(page) {
    await privacy(page);
    assert.equal((await page.cookies()).length, 0, "Public slowdown browsing creates neither account nor guest cookies.");
    assert.equal(page.requests.some(request => /\/auth\/v1\//.test(new URL(request.url).pathname)), false, "Public slowdown browsing never contacts Auth.");
  }
  function assertNoTrafficRead(page, start) {
    assert.equal(page.requests.slice(start).some(request => new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic"), false,
      "Selection and time-driven expiry must not silently request another traffic snapshot.");
  }
  async function surfaces(page, id, state, counts, end, { map = true } = {}) {
    await selected(page, id);
    await page.waitFor(stateExpression(id, state, map), `shared ${id} slowdown state: ${state}`);
    const labels = await page.evaluate(`(${q(selectors(id).slice(0, map ? 3 : 2))}).map(selector => {
      const element = document.querySelector(selector);
      return [element.innerText, element.getAttribute('aria-label'), element.title].filter(Boolean).join(' ');
    })`);
    const texts = labels.map(normalizeText);
    assert.ok(texts[1].includes(texts[0]), "List and details use the same complete slowdown summary.");
    if (map) assert.ok(texts[2].includes(texts[0]), "The marker accessible text contains the same slowdown summary as list/details.");
    for (const text of texts) {
      if (state === "expired") {
        assert.match(text, /Slowdown assessment needs refresh/);
        assert.doesNotMatch(text, /L4 Slowdown supported/, "Expired summaries cannot retain positive L4 text.");
      } else {
        assert.equal(text.includes("L4 Slowdown supported"), state === "supported", "Only a supported window has the positive L4 label.");
        if (counts) assert.ok(text.includes(`${counts[0]} complete synthetic sources · ${counts[1]} slowdown-supporting sources`), "Complete synthetic sources and supporting sources stay distinct.");
        assert.match(text, /as of (?:the |data )?read|as of (?:the |sampled )?window/i, "Claims describe the server read/window, never live traffic.");
        if (end !== undefined && end !== null) {
          for (const time of [iso(Date.parse(end) - 5 * minute), end]) {
            assert.ok(text.includes(normalizeText(formatTrafficTime(time))), "Every surface describes the same terminal five-minute window.");
          }
        }
      }
    }
    if (map) await sameCanvas(page);
    await layout(page);
  }
  async function noL3(page, id = primaryId) {
    assert.equal(await page.evaluate(`['[data-segment-assessment="${id}"]', '[data-report-assessment="${id}"]', '[data-map-segment="${id}"]'].every(selector => document.querySelector(selector)?.dataset.assessmentState === 'insufficient')`), true,
      "Synthetic slowdown alone must not create L3 reporting identities.");
  }
  async function install(page, value, state, counts, end = value.corridor.anchor_at) {
    await persist(value);
    await refresh(page);
    await selected(page, primaryId);
    await surfaces(page, primaryId, state, counts, end);
  }
  async function openMap(page) {
    await page.go(`/traffic?segment=${primaryId}`);
    await ready(page); await selected(page, primaryId); await publicPrivacy(page);
    const start = page.requests.length;
    await loadMap(page); await providerEvidence(page, start); await rememberCanvas(page);
  }
  async function selectionHistory(page, end) {
    const start = page.requests.length;
    await keyboardSelect(page, oppositeId);
    await surfaces(page, oppositeId, "not_supported", [3, 0], end);
    const history = await page.call("Page.getNavigationHistory");
    const opposite = history.entries[history.currentIndex];
    await page.click(`[data-map-segment="${parallelId}"]`);
    await surfaces(page, parallelId, "not_supported", [3, 0], end);
    const next = await page.call("Page.getNavigationHistory");
    const parallel = next.entries[next.currentIndex];
    assert.notEqual(opposite.id, parallel.id, "Marker selection pushes history.");
    await page.call("Page.navigateToHistoryEntry", { entryId: opposite.id });
    await surfaces(page, oppositeId, "not_supported", [3, 0], end);
    await page.call("Page.navigateToHistoryEntry", { entryId: parallel.id });
    await surfaces(page, parallelId, "not_supported", [3, 0], end);
    await selectList(page, primaryId);
    await surfaces(page, primaryId, "supported", [3, 3], end);
    assertNoTrafficRead(page, start);
    await page.reload(); await ready(page); await selected(page, primaryId);
    await surfaces(page, primaryId, "supported", [3, 3], end, { map: false });
    for (const query of ["segment=unknown-segment", `segment=${primaryId}&segment=${oppositeId}`, "segment="]) {
      await page.go(`/traffic?${query}`); await ready(page); await page.text("Segment not found");
      assert.equal(await page.evaluate("document.querySelectorAll('[data-slowdown-assessment]').length"), 0, "Invalid selection cannot display another segment's details.");
      assert.equal(await page.evaluate("document.querySelectorAll('[data-segment-list] a[aria-current=true]').length"), 0);
    }
    await selectList(page, primaryId);
    const mapStart = page.requests.length;
    await loadMap(page); await providerEvidence(page, mapStart); await rememberCanvas(page);
    await surfaces(page, primaryId, "supported", [3, 3], end);
  }
  async function dataScenarios(page) {
    let value = await freshFixture("normal");
    await install(page, value, "not_supported", [3, 0]); await noL3(page);
    value = createTrafficFixture("slowdown", value.corridor.anchor_at);
    await install(page, value, "supported", [3, 3]); await noL3(page);
    await selectionHistory(page, value.corridor.anchor_at);
    await screenshot(page, "slowdown-supported");
    await install(page, createTrafficFixture("recovery", value.corridor.anchor_at), "not_supported", [3, 0]);
    const details = await page.evaluate("document.querySelector('#segment-details').innerText");
    assert.doesNotMatch(details, /(?:^|\n)\s*(?:(?:incident|road) (?:is |has been )?clear(?:ed)?|recovery (?:confirmed|supported)|incident resolved)\b/i,
      "The recovery scenario loses L4 but does not establish recovery or incident clearance.");
    assert.match(details, /higher speeds alone and simulator reset do not establish recovery or clearance/i);
    assert.match(details, /retained evidence from one simulation run/i);
    assert.match(details, /delay.*?(?:unavailable|not (?:assessed|available))|(?:unavailable|not (?:assessed|available)).*?delay/i);
    await screenshot(page, "slowdown-recovery-not-cleared");
    value = await freshFixture();
    const end = value.corridor.anchor_at;
    for (const speed of [11.99, 12, 12.01, 0]) {
      const changed = structuredClone(value);
      changed.observations = changed.observations.map(row => row.segment_id === primaryId ? { ...row, speed_kph: speed } : row);
      await install(page, changed, speed < 12 ? "supported" : "not_supported", [3, speed < 12 ? 3 : 0]);
    }
    const renamed = structuredClone(value);
    renamed.corridor.scenario = "normal";
    await install(page, renamed, "supported", [3, 3]);
    for (const count of [1, 2]) {
      const limited = structuredClone(value);
      const retainedSources = limited.sources.filter(row => row.segment_id === primaryId).slice(0, count).map(row => row.id);
      limited.observations = limited.observations.filter(row => row.segment_id !== primaryId || retainedSources.includes(row.source_id));
      await install(page, limited, "insufficient", [count, count]);
    }
    const conflicting = structuredClone(value);
    conflicting.observations.find(row => row.source_id === sourceId && row.observed_at === end).speed_kph = 28;
    await install(page, conflicting, "not_supported", [3, 2]);
    const incomplete = structuredClone(value);
    incomplete.observations = incomplete.observations.filter(row => !(row.source_id === sourceId && row.observed_at === iso(Date.parse(end) - 2 * minute)));
    await install(page, incomplete, "insufficient", [2, 2]);
    const irregular = structuredClone(value);
    irregular.observations.push({ segment_id: primaryId, source_id: sourceId, observed_at: iso(Date.parse(end) - 30000), speed_kph: 28 });
    await install(page, irregular, "insufficient", [2, 2]);
    const fiveTicks = structuredClone(value);
    fiveTicks.observations = fiveTicks.observations.filter(row => row.segment_id !== primaryId || Date.parse(row.observed_at) > Date.parse(end) - 5 * minute);
    await install(page, fiveTicks, "insufficient", [0, 0]);
    const newer = structuredClone(value);
    newer.corridor.anchor_at = iso(Date.parse(end) + 1000);
    newer.observations = newer.observations.filter(row => Date.parse(row.observed_at) >= Date.parse(newer.corridor.anchor_at) - 11 * minute);
    newer.observations.push({ segment_id: primaryId, source_id: sourceId, observed_at: newer.corridor.anchor_at, speed_kph: 28 });
    await install(page, newer, "insufficient", [0, 0]);
    const phased = await freshFixture();
    phased.corridor.anchor_at = phased.corridor.anchor_at.replace("Z", "123Z");
    phased.observations.forEach(row => { row.observed_at = row.observed_at.replace("Z", "123Z"); });
    await install(page, phased, "supported", [3, 3]);
    const microIrregular = structuredClone(phased);
    const middle = microIrregular.observations.find(row => row.source_id === sourceId && Date.parse(row.observed_at) === Date.parse(phased.corridor.anchor_at) - 2 * minute);
    microIrregular.observations.push({ ...middle, observed_at: middle.observed_at.replace("123Z", "124Z") });
    await install(page, microIrregular, "insufficient", [2, 2]);
    const stale = await freshFixture("slowdown", -16 * minute);
    await install(page, stale, "stale", null);
    await page.text("Recent synthetic samples");
    const future = await freshFixture("slowdown", 24 * 60 * minute);
    await install(page, future, "future", null, null);
    const missing = await freshFixture();
    missing.observations = missing.observations.filter(row => row.segment_id !== primaryId);
    await install(page, missing, "missing", null, null);
    await selectList(page, oppositeId);
    await surfaces(page, oppositeId, "not_supported", [3, 0], missing.corridor.anchor_at);
    await selectList(page, primaryId);
    await persist(null); await refreshTraffic(page); await page.text("No synthetic traffic data");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-segment-slowdown], [data-slowdown-assessment], [data-map-segment]').length"), 0, "Reset removes every old slowdown surface.");
    await layout(page);
    value = await freshFixture();
    await persist(value); await refresh(page); await selected(page, primaryId);
    if (!await page.evaluate("!!document.querySelector('[data-map-state]')")) await loadMap(page);
    await rememberCanvas(page); await surfaces(page, primaryId, "supported", [3, 3], value.corridor.anchor_at);
    await publicPrivacy(page);
  }
  async function waitForDatabaseDeadline(expiresAt, check = () => {}) {
    const deadline = performance.now() + 25000;
    for (;;) {
      check();
      if (micros((await snapshot()).read_at) >= micros(expiresAt)) return;
      assert.ok(performance.now() < deadline, "The bounded test deadline must be reached by the actual database clock.");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  async function armWindowExpiry(page) {
    const expiresAt = iso(Date.parse((await snapshot()).read_at) + 18000);
    const value = createTrafficFixture("slowdown", iso(Date.parse(expiresAt) - 15 * minute));
    await persist(value);
    if (page) {
      await refresh(page);
      await surfaces(page, primaryId, "supported", [3, 3], value.corridor.anchor_at);
    }
    return { value, expiresAt };
  }
  async function timerExpiry(page) {
    const { value, expiresAt } = await armWindowExpiry(page);
    const start = page.requests.length;
    await page.waitFor(stateExpression(primaryId, "expired"), "window-start expiry without interaction", 30000);
    await surfaces(page, primaryId, "expired"); assertNoTrafficRead(page, start);
    await waitForDatabaseDeadline(expiresAt);
    await screenshot(page, "slowdown-window-expired");
    await refresh(page); await surfaces(page, primaryId, "stale", null, value.corridor.anchor_at);
    const now = Date.parse((await snapshot()).read_at);
    const future = createTrafficFixture("slowdown", iso(now + 5 * minute + 18000));
    future.observations = future.observations.filter(row => row.segment_id !== primaryId || Date.parse(row.observed_at) >= now + 18000);
    await install(page, future, "future", null, null);
    const futureStart = page.requests.length;
    await page.waitFor(stateExpression(primaryId, "expired"), "future eligibility withdraws the old assessment, never promotes it", 30000);
    await surfaces(page, primaryId, "expired"); assertNoTrafficRead(page, futureStart);
    await waitForDatabaseDeadline(iso(now + 18000));
    await refresh(page);
    await surfaces(page, primaryId, "insufficient", [0, 0], iso(now + 18000));
    const mixed = await freshFixture();
    const currentEnd = mixed.corridor.anchor_at;
    const nextFuture = iso(Date.parse(currentEnd) + 19000);
    mixed.corridor.anchor_at = nextFuture;
    mixed.observations = mixed.observations.filter(row => Date.parse(row.observed_at) >= Date.parse(nextFuture) - 11 * minute);
    mixed.observations.push({ segment_id: primaryId, source_id: sourceId, observed_at: nextFuture, speed_kph: 28 });
    await install(page, mixed, "supported", [3, 3], currentEnd);
    const mixedStart = page.requests.length;
    await page.waitFor(stateExpression(primaryId, "expired"), "next future observation invalidates support before the window ages out", 30000);
    await surfaces(page, primaryId, "expired"); assertNoTrafficRead(page, mixedStart);
    await waitForDatabaseDeadline(nextFuture);
    await refresh(page); await surfaces(page, primaryId, "insufficient", [0, 0], nextFuture);
  }
  async function frozenResume(page, width, height) {
    const sibling = await createPage(width, height, { contextId: page.browserContextId });
    try {
      await page.call("Page.bringToFront");
      const { expiresAt } = await armWindowExpiry(page);
      await page.evaluate(`(() => {
        const nativeNow = Date.now, monotonic = performance.now.bind(performance);
        const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
        const probe = window.__slowdownResume = { hidden: 0, visible: 0, stoppedAt: null, wallOffset: 0 };
        const record = () => {
          if (document.visibilityState === 'hidden') { probe.hidden++; probe.stoppedAt ??= monotonic(); }
          else probe.visible++;
        };
        Object.defineProperty(performance, 'now', { configurable: true, value: () => probe.stoppedAt ?? monotonic() });
        Date.now = () => nativeNow() + probe.wallOffset;
        document.addEventListener('visibilitychange', record, true);
        window.__restoreSlowdownResume = () => {
          Date.now = nativeNow;
          if (descriptor) Object.defineProperty(performance, 'now', descriptor); else delete performance.now;
          document.removeEventListener('visibilitychange', record, true);
        };
      })()`);
      const start = page.requests.length;
      await sibling.call("Page.bringToFront");
      await page.waitFor("document.visibilityState === 'hidden' && window.__slowdownResume.hidden > 0", "real hidden slowdown tab");
      assert.equal(await page.evaluate(stateExpression(primaryId, "supported")), true, "The tab must freeze while its assessment still supports slowdown.");
      await page.call("Page.setWebLifecycleState", { state: "frozen" });
      await waitForDatabaseDeadline(expiresAt);
      await page.call("Page.setWebLifecycleState", { state: "active" });
      await page.call("Page.bringToFront");
      await page.waitFor("document.visibilityState === 'visible' && window.__slowdownResume.visible > 0", "frozen tab visibly resumes");
      await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.equal(await page.evaluate(stateExpression(primaryId, "expired")), true, "A resumed tab withdraws support by the next rendered frames.");
      assert.equal(await page.evaluate("performance.now() === window.__slowdownResume.stoppedAt"), true, "The monotonic clock really stopped while the database clock advanced.");
      await surfaces(page, primaryId, "expired");
      for (const offset of [86400000, -86400000]) {
        await page.evaluate(`window.__slowdownResume.wallOffset = ${offset}`);
        await sibling.call("Page.bringToFront"); await page.waitFor("document.visibilityState === 'hidden'");
        await page.call("Page.bringToFront"); await page.waitFor("document.visibilityState === 'visible'");
        await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await page.evaluate(stateExpression(primaryId, "expired")), true, "Clock skew cannot resurrect expired L4 support.");
        await surfaces(page, primaryId, "expired");
      }
      assertNoTrafficRead(page, start); await publicPrivacy(page); await privacy(sibling);
      await screenshot(page, "slowdown-frozen-resume");
    } finally {
      try {
        await page.call("Page.setWebLifecycleState", { state: "active" });
        await page.call("Page.bringToFront");
        await page.evaluate("window.__restoreSlowdownResume?.()");
      } finally { await disposePage(sibling); }
    }
    await refresh(page); await surfaces(page, primaryId, "stale");
  }
  async function delayedResponse(width, height) {
    await withPage(width, height, {}, async page => {
      await page.call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
        window.__slowdownDeliveryStates = [];
        const selector = ${q(selectors(primaryId).join(", "))};
        const record = element => { if (element.matches?.(selector)) window.__slowdownDeliveryStates.push(element.dataset.slowdownState); };
        new MutationObserver(records => {
          for (const mutation of records) {
            if (mutation.type === 'attributes' && mutation.target.matches(selector)) window.__slowdownDeliveryStates.push(mutation.oldValue);
            for (const node of mutation.addedNodes) { record(node); node.querySelectorAll?.(selector).forEach(record); }
          }
          document.querySelectorAll(selector).forEach(record);
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-slowdown-state'], attributeOldValue: true });
      })()` });
      const { value, expiresAt } = await armWindowExpiry();
      const captured = Promise.withResolvers();
      let pausedId, navigation, interceptionFailure;
      assert.equal(page.onRequestPaused, undefined);
      const timer = setTimeout(() => {
        interceptionFailure = new Error("The real slowdown document hold exceeded 25 seconds.");
        captured.reject(interceptionFailure);
        page.call("Fetch.disable").catch(() => { interceptionFailure = new Error("Timed-out response interception could not be released."); });
      }, 25000);
      page.onRequestPaused = async event => {
        try {
          assert.equal(new URL(event.request.url).origin, base);
          assert.equal(new URL(event.request.url).pathname, "/traffic");
          assert.equal(event.resourceType, "Document"); assert.equal(event.responseStatusCode, 200);
          assert.equal(pausedId, undefined, "Intercept exactly one real successful document.");
          pausedId = event.requestId;
          const response = await page.call("Fetch.getResponseBody", { requestId: pausedId });
          captured.resolve(response.base64Encoded ? Buffer.from(response.body, "base64").toString() : response.body);
        } catch (error) { interceptionFailure = error; captured.reject(error); }
      };
      try {
        await page.call("Fetch.enable", { patterns: [{ urlPattern: `${base}/traffic*`, resourceType: "Document", requestStage: "Response" }] });
        navigation = page.go(`/traffic?segment=${primaryId}`).then(() => null, error => { captured.reject(error); return error; });
        const body = (await captured.promise).replaceAll('\\"', '"');
        const objects = body.match(/\{[^{}]*\}/g) ?? [];
        const assessment = objects.map(text => { try { return JSON.parse(text); } catch { return null; } })
          .find(row => row?.segment_id === primaryId && row.status === "supported" && row.complete_source_count === 3);
        assert.ok(assessment, "The held real response contains a positive server-derived slowdown assessment, not a fabricated replacement body.");
        assert.equal(assessment.slow_source_count, 3);
        assert.equal(Date.parse(assessment.valid_until), Date.parse(expiresAt), "The intercepted window really expires during the delivery hold.");
        assert.ok(micros((await snapshot()).read_at) < micros(expiresAt), "Capture the positive server response before its deadline.");
        await waitForDatabaseDeadline(expiresAt, () => { if (interceptionFailure) throw interceptionFailure; });
        await page.call("Fetch.continueRequest", { requestId: pausedId });
        clearTimeout(timer);
        const navigationError = await navigation;
        if (navigationError) throw navigationError;
        if (interceptionFailure) throw interceptionFailure;
      } finally {
        clearTimeout(timer);
        try { await page.call("Fetch.disable"); }
        finally { delete page.onRequestPaused; if (navigation) await navigation; }
      }
      await ready(page); await selected(page, primaryId);
      await page.waitFor("Object.keys(document.querySelector('[data-refresh-traffic]')).some(key => key.startsWith('__reactProps$'))", "actual delayed hydration");
      await loadMap(page); await rememberCanvas(page);
      await surfaces(page, primaryId, "expired");
      assert.equal(await page.evaluate("window.__slowdownDeliveryStates.includes('expired')"), true, "The pre-document probe observes actual rendering.");
      assert.equal(await page.evaluate("window.__slowdownDeliveryStates.includes('supported')"), false, "An expired real response must never flash positive L4 support during hydration.");
      await screenshot(page, "slowdown-delayed-response");
      await refresh(page); await surfaces(page, primaryId, "stale", null, value.corridor.anchor_at);
      await publicPrivacy(page);
    });
  }
  async function twoTabs(page, width, height) {
    const value = await freshFixture();
    await install(page, value, "supported", [3, 3]);
    const sibling = await createPage(width, height, { contextId: page.browserContextId });
    try {
      await sibling.go(`/traffic?segment=${primaryId}`); await ready(sibling);
      await surfaces(sibling, primaryId, "supported", [3, 3], value.corridor.anchor_at, { map: false });
      const before = await snapshot();
      const normal = createTrafficFixture("normal", value.corridor.anchor_at);
      await persist(normal); await refresh(page);
      await surfaces(page, primaryId, "not_supported", [3, 0], normal.corridor.anchor_at);
      await sibling.call("Page.bringToFront");
      await surfaces(sibling, primaryId, "supported", [3, 3], value.corridor.anchor_at, { map: false });
      await refresh(sibling);
      await surfaces(sibling, primaryId, "not_supported", [3, 0], normal.corridor.anchor_at, { map: false });
      const after = await snapshot();
      assert.deepEqual(after.fixture.sources, before.fixture.sources);
      assert.equal(after.fixture.observations.length, before.fixture.observations.length, "Same-anchor replacement does not merge observation generations.");
      await publicPrivacy(sibling);
    } finally { await disposePage(sibling); }
    await page.call("Page.bringToFront");
  }
  async function retrySavedGuestReport(page) {
    const before = await snapshot();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.click(`a[href="/reports/new?segment=${primaryId}"]`);
      await page.route("/reports/new"); await page.reload();
      await page.text("Keep this request for a safe retry");
      await page.button("Retry unchanged report");
      await page.waitFor("document.querySelector('[data-report-saved] button')?.disabled === false", "retry acknowledgement and pending refresh finish");
      await page.text("of the original request; no duplicate was created");
      const id = await page.evaluate("document.querySelector('[data-report-saved]').dataset.reportSaved");
      assert.ok(before.reports.some(row => row.id === id), "A real unchanged resubmission acknowledges an existing public report.");
      await layout(page);
      await page.click('a[href*="#segment-reports"]');
      await page.route("/traffic"); await ready(page); await selected(page, primaryId);
      const after = await snapshot();
      assert.deepEqual(after.reports, before.reports, "Repeated real form submissions do not add retained reports.");
      assert.deepEqual(after.fixture, before.fixture, "Repeated reports cannot manufacture synthetic slowdown evidence.");
      assert.equal(after.report_assessments.find(row => row.segment_id === primaryId).eligible_source_count, 1);
    }
  }
  let failure;
  try {
    for (const [width, height] of viewports) {
      await persist(await freshFixture());
      await withPage(width, height, {}, async page => {
        await openMap(page); await dataScenarios(page); await twoTabs(page, width, height);
        await timerExpiry(page); await frozenResume(page, width, height); await publicPrivacy(page);
      });
      await delayedResponse(width, height);
      console.log(`PASS slowdown ${base} ${width}px: persisted normal/slowdown/recovery, strict thresholds/cadence/microseconds, direction/selection/history, reset, explicit two-tab refresh, timer/frozen/delayed-response expiry and public privacy`);
    }
    // Reuse the real guest/account evidence fixtures and their scoped identity/report/gate cleanup.
    const combined = await freshFixture();
    await persist(combined);
    const beforeEvidence = await snapshot();
    const combinations = new Set();
    await runEvidenceScenarios({ ...tools, withPage: (width, height, options, run) => withPage(width, height, options, async page => {
      await run(page);
      if (page.reporting) await retrySavedGuestReport(page);
    }), screenshot: async (page, label) => {
      if (["evidence-multiple", "evidence-expired", "evidence-recomputed"].includes(label)) {
        await page.evaluate("window.__slowdownCanvas = document.querySelector('[data-map-state] canvas')");
        await surfaces(page, primaryId, "supported", [3, 3], combined.corridor.anchor_at);
        const l3 = await page.evaluate(`document.querySelector('[data-report-assessment="${primaryId}"]').dataset.assessmentState`);
        assert.equal(l3, label === "evidence-multiple" ? "multiple" : label === "evidence-expired" ? "expired" : "insufficient");
        combinations.add(`${page.width}:${l3}`);
        const stored = await snapshot();
        assert.deepEqual(stored.fixture, beforeEvidence.fixture, "Guest/account/repeated reports cannot add or modify synthetic slowdown sources or observations.");
      }
      await screenshot(page, `slowdown-${label}`);
    } });
    for (const [width] of viewports) for (const state of ["multiple", "expired", "insufficient"]) {
      assert.ok(combinations.has(`${width}:${state}`), "L3 and L4 must remain independent on every viewport, including source expiry.");
    }
    console.log(`PASS slowdown ${base}: reused real evidence suite covers simultaneous L3/L4, L4-only after reporting-source expiry, unchanged synthetic inputs and unconfirmed manual causes`);
  } catch (error) { failure = error; }
  finally {
    try {
      await replace(original.fixture);
      const restored = await snapshot();
      assert.deepEqual(restored.fixture, original.fixture);
      assert.deepEqual(restored.reports, original.reports, "All unrelated reports survive slowdown and reused evidence fixtures.");
      assert.equal(restored.reporting_enabled, original.reporting_enabled, "The original reporting gate is restored.");
    } catch (error) {
      failure = new AggregateError([...(failure ? [failure] : []), error], "Slowdown cleanup was incomplete; inspect local state before rerunning.");
    }
  }
  if (failure) throw failure;
}
