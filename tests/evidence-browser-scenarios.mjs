import assert from "node:assert/strict";

export async function runEvidenceScenarios(tools) {
  const { base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList, loadMap, mapState, providerEvidence, refresh: refreshTraffic, screenshot, fixture } = tools;
  async function refresh(page) {
    await refreshTraffic(page);
    await mapState(page, "ready");
    await page.evaluate("window.__evidenceCanvas = document.querySelector('[data-map-state] canvas')");
  }
  const q = JSON.stringify;
  const primaryId = "primary-west";
  const oppositeId = "primary-west-inbound";
  const parallelId = "alternative-west";
  const controlledSegments = [primaryId, oppositeId, parallelId];
  const users = new Set();
  const sources = new Set();
  const sourceTokens = new Map();
  const privateIdentifiers = new Set();
  const assessmentFields = ["segment_id", "direction", "report_count", "recent_report_count", "eligible_report_count", "eligible_source_count", "multiple_sources", "valid_until", "provenance"].sort();
  const reportFields = ["id", "episode_id", "segment_id", "direction", "category", "observed_at", "received_at", "provenance", "location_provenance"].sort();
  const storage = "trafficsense-pending-demo-report";
  async function service(path, method = "GET", body) {
    const response = await fetch(`${status.API_URL}/${path}`, {
      method,
      headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `Evidence fixture request failed (${response.status}); credentials and response body are withheld.`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name, body = {}) => service(`rest/v1/rpc/${name}`, "POST", body);
  async function snapshot() {
    const result = await rpc("read_traffic_demo");
    assert.deepEqual(Object.keys(result).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
    assert.ok(Number.isFinite(Date.parse(result.read_at)));
    assert.deepEqual(result.report_assessments.map(row => row.segment_id).sort(), fixture.segments.map(segment => segment.id).sort(), "Exactly one assessment exists per active directed segment.");
    for (const row of result.report_assessments) {
      assert.deepEqual(Object.keys(row).sort(), assessmentFields, "Public evidence contains only the aggregate allowlist.");
      assert.equal(row.direction, fixture.segments.find(segment => segment.id === row.segment_id).direction);
      assert.equal(row.provenance, "simulated");
      assert.equal(row.multiple_sources, row.eligible_source_count >= 3);
      assert.ok(row.valid_until === null || Date.parse(row.valid_until) > Date.parse(result.read_at));
    }
    for (const row of result.reports) {
      assert.deepEqual(Object.keys(row).sort(), reportFields);
      assert.equal(row.provenance, "simulated");
      assert.equal(row.location_provenance, "manual");
    }
    return result;
  }
  const original = await snapshot();
  // Existing recent reports would invalidate controlled source-count expectations; never remove them.
  for (const id of controlledSegments) {
    const row = original.report_assessments.find(row => row.segment_id === id);
    assert.equal(row.recent_report_count, 0, "Run evidence scenarios serially when the selected segments have no pre-existing recent reports; unrelated rows are never changed.");
  }
  const baselineCounts = Object.fromEntries(original.report_assessments.map(row => [row.segment_id, row.report_count]));
  async function expectAssessment(id, counts) {
    const result = await snapshot();
    const row = result.report_assessments.find(row => row.segment_id === id);
    const [total, recent, eligible, sourceCount] = counts;
    assert.deepEqual([row.report_count, row.recent_report_count, row.eligible_report_count, row.eligible_source_count], [baselineCounts[id] + total, recent, eligible, sourceCount], "Retained, recent, eligible reports and distinct identities are separate counts.");
    assert.equal(row.multiple_sources, sourceCount >= 3);
    return row;
  }
  async function createSource() {
    const credentials = { email: `evidence-browser-${crypto.randomUUID()}@example.test`, password: `Test-${crypto.randomUUID()}!` };
    const account = await service("auth/v1/admin/users", "POST", { ...credentials, email_confirm: true });
    assert.ok(account?.id, "A test-owned fixture account must be created.");
    users.add(account.id); privateIdentifiers.add(account.id);
    const id = crypto.randomUUID();
    sources.add(id); privateIdentifiers.add(id);
    await service("rest/v1/report_sources", "POST", { id, user_id: account.id, kind: "account" });
    const login = await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: status.ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(credentials), signal: AbortSignal.timeout(15000),
    });
    assert.ok(login.ok, "Test-owned source authentication succeeds without exposing credentials.");
    sourceTokens.set(id, (await login.json()).access_token);
    return id;
  }
  async function insertReport(sourceId, segmentId, observedAt, category = "accident") {
    assert.ok(sources.has(sourceId), "Fixture writes are restricted to test-owned sources.");
    const id = crypto.randomUUID(), requestId = crypto.randomUUID();
    privateIdentifiers.add(requestId);
    const { read_at: receivedAt } = await snapshot();
    const direction = fixture.segments.find(segment => segment.id === segmentId).direction;
    const canonical = { source_id: sourceId, request_id: requestId, segment_id: segmentId, direction, category, observed_at: observedAt };
    let [episode] = await service(`rest/v1/incident_episodes?segment_id=eq.${segmentId}&assignment_upper=is.null&select=id`);
    if (!episode) {
      assert.ok(sourceTokens.has(sourceId), "Only a test-owned identity may create fixture episode membership.");
      const response = await fetch(`${status.API_URL}/rest/v1/rpc/submit_traffic_report`, {
        method: "POST", headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${sourceTokens.get(sourceId)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_input: { ...canonical, request_id: crypto.randomUUID(), observed_at: new Date(Date.parse(receivedAt) - 1000).toISOString() } }),
        signal: AbortSignal.timeout(15000),
      });
      assert.ok(response.ok, "Fixture episode is allocated through real report admission.");
      const accepted = await response.json();
      assert.equal(accepted.status, "accepted");
      episode = { id: accepted.report.episode_id };
      await service(`rest/v1/traffic_reports_private?public_id=eq.${accepted.report.id}&source_id=eq.${sourceId}`, "DELETE");
    }
    await service("rest/v1/traffic_reports_private", "POST", { public_id: id, source_id: sourceId, request_id: requestId, canonical_input: canonical, received_at: receivedAt });
    await service("rest/v1/public_traffic_reports", "POST", { id, episode_id: episode.id, segment_id: segmentId, direction, category, observed_at: observedAt, received_at: receivedAt, provenance: "simulated", location_provenance: "manual" });
    return id;
  }
  async function submitGuest(width, height) {
    let saved;
    await withPage(width, height, {}, async page => {
      await page.go("/"); await page.text("Traffic information, with its limits in view");
      await page.click('main a[href="/demo"]'); await page.route("/demo");
      await page.click('a[href="/traffic"]'); await ready(page);
      await selectList(page, primaryId);
      await page.click(`a[href="/reports/new?segment=${primaryId}"]`);
      await page.route("/reports/new"); await page.text("Prepare a demo report");
      await privacy(page); await layout(page);
      assert.equal((await page.cookies()).length, 0, "Opening the form must not prepare an identity.");
      page.reporting = true;
      await page.button("Continue as guest"); await page.text("Prepared as a temporary guest");
      const cookies = await page.cookies();
      const encoded = cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(cookie => cookie.value).join("");
      assert.ok(encoded.startsWith("base64-"), "Guest cookie encoding must be supported without printing its value.");
      const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString());
      assert.ok(session.user?.id, "Track the browser-created guest for scoped cleanup.");
      users.add(session.user.id); privateIdentifiers.add(session.user.id);
      const rows = await service(`rest/v1/report_sources?user_id=eq.${session.user.id}&select=id`);
      for (const row of rows) { sources.add(row.id); privateIdentifiers.add(row.id); sourceTokens.set(row.id, session.access_token); }
      assert.equal(rows.length, 1);
      assert.ok(cookies.every(cookie => cookie.name.startsWith("trafficsense-report-guest") && cookie.httpOnly && cookie.sameSite === "Lax"));
      await page.click('[name="category"]'); await page.key("Home", "Home", 36);
      await page.key("ArrowDown", "ArrowDown", 40); await page.key("Enter", "Enter", 13);
      assert.equal(await page.evaluate("document.querySelector('[name=category]').value"), "accident");
      await page.click('button[type="submit"]');
      await page.waitFor("!!document.querySelector('[data-report-saved]')", "real evidence report committed");
      const id = await page.evaluate("document.querySelector('[data-report-saved]').dataset.reportSaved");
      const draft = await page.evaluate(`JSON.parse(sessionStorage.getItem(${q(storage)}))`);
      assert.ok(sources.has(draft.source_id), "Submission uses the explicitly prepared guest.");
      privateIdentifiers.add(draft.request_id);
      const persisted = await service(`rest/v1/traffic_reports_private?source_id=eq.${draft.source_id}&request_id=eq.${draft.request_id}&select=public_id`);
      assert.equal(persisted.length, 1); assert.equal(persisted[0].public_id, id);
      await page.waitFor("document.querySelector('[data-report-saved] button')?.disabled === false", "saved report transition and refresh finish");
      await layout(page);
      await page.click('a[href*="#segment-reports"]'); await page.route("/traffic"); await ready(page); await selected(page, primaryId);
      await page.waitFor(`!!document.querySelector('[data-public-report="${id}"]')`, "submitted report is publicly visible");
      await layout(page);
      saved = { id, sourceId: draft.source_id };
    });
    return saved;
  }
  function selectors(id) {
    return [`[data-segment-assessment="${id}"]`, `[data-report-assessment="${id}"]`, `[data-map-segment="${id}"]`];
  }
  async function surfaces(page, id, row, state = row.multiple_sources ? "multiple" : "insufficient") {
    await selected(page, id);
    await page.waitFor(`(${q(selectors(id))}).every(selector => document.querySelector(selector)?.dataset.assessmentState === ${q(state)})`, `map/list/details assessment: ${state}`);
    for (const selector of selectors(id)) {
      const text = await page.evaluate(`(() => { const element = document.querySelector(${q(selector)}); return [element.innerText, element.getAttribute('aria-label'), element.title].filter(Boolean).join(' '); })()`);
      if (state === "expired") {
        assert.match(text, /Assessment needs refresh/i);
        assert.doesNotMatch(text, /L3 Multiple sources/i, "Expired displays withdraw the positive evidence label.");
      } else {
        assert.match(text, new RegExp(`\\b${row.recent_report_count}\\s+recent\\b`, "i"), "All surfaces expose the shared recent count.");
        assert.match(text, new RegExp(`\\b${row.eligible_report_count}\\s+eligible\\s+reports?\\b`, "i"), "All surfaces expose the shared eligible-report count.");
        assert.match(text, new RegExp(`\\b${row.eligible_source_count}\\s+(?:eligible\\s+)?sources?\\b`, "i"), "All surfaces expose the shared distinct-source count.");
        assert.match(text, /as of (?:(?:the|data) )?read/i, "Counts are labelled as-of-read, not live evidence.");
        if (state === "multiple") assert.match(text, /L3 Multiple sources/i);
        else assert.doesNotMatch(text, /L3 Multiple sources/i);
      }
    }
    const reports = await page.evaluate("document.querySelector('#segment-reports').innerText");
    assert.ok(reports.includes(`${row.report_count} reports for this direction.`));
    assert.equal(Number(await page.evaluate(`document.querySelector('[data-map-segment="${id}"]').dataset.reportCount`)), row.report_count);
    assert.equal(Number.parseInt(await page.evaluate(`document.querySelector('[data-segment-report-count="${id}"]').innerText`), 10), row.report_count);
    const displayed = await page.evaluate("Array.from(document.querySelectorAll('[data-public-report]'), element => element.innerText)");
    assert.ok(displayed.length > 0);
    for (const report of displayed) {
      assert.match(report, /unconfirmed/i); assert.match(report, /SIMULATED/); assert.match(report, /Manually selected/i);
    }
    assert.equal(await page.evaluate("document.querySelector('[data-map-state] canvas') === window.__evidenceCanvas && window.__evidenceCanvas.isConnected"), true, "Selection and deadline expiry must preserve the loaded map canvas.");
    await layout(page);
  }
  async function publicPrivacy(page) {
    await privacy(page);
    assert.equal((await page.cookies()).length, 0, "Evidence browsing creates neither auth nor guest cookies.");
    assert.equal(page.requests.some(request => /\/auth\/v1\//.test(new URL(request.url).pathname)), false, "Public evidence browsing does not contact Auth.");
    const html = await page.evaluate("document.documentElement.outerHTML");
    for (const identifier of privateIdentifiers) assert.ok(!html.includes(identifier), "Private identity/request values never appear in the public DOM.");
    const requests = page.requests.filter(request => request.completed && request.status === 200 && new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic");
    assert.ok(requests.length, "Inspect a completed public traffic document or RSC payload.");
    for (const request of requests) {
      const response = await page.call("Network.getResponseBody", { requestId: request.requestId });
      const body = response.base64Encoded ? Buffer.from(response.body, "base64").toString() : response.body;
      for (const identifier of privateIdentifiers) assert.ok(!body.includes(identifier), "Private identity/request values never enter public traffic responses.");
    }
  }
  async function waitForDatabaseExpiry(expiresAt, check = () => {}) {
    const deadline = performance.now() + 20000;
    for (;;) {
      check();
      const current = await snapshot();
      if (Date.parse(current.read_at) >= Date.parse(expiresAt)) return current;
      assert.ok(performance.now() < deadline, "The short test-owned expiry must be reached by the database clock.");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  async function armGuestExpiry(guest) {
    assert.ok(sources.has(guest.sourceId));
    const current = await snapshot();
    const expiresAt = new Date(Date.parse(current.read_at) + 12000).toISOString();
    await service(`rest/v1/report_sources?id=eq.${guest.sourceId}`, "PATCH", {
      created_at: new Date(Date.parse(expiresAt) - 86400000).toISOString(), expires_at: expiresAt,
    });
    const row = await expectAssessment(primaryId, [7, 6, 5, 3]);
    assert.equal(Date.parse(row.valid_until), Date.parse(expiresAt));
    return { row, expiresAt };
  }
  async function delayedDocument(page, expiresAt) {
    assert.equal(page.onRequestPaused, undefined, "Response interception must not replace another scenario's handler.");
    const captured = Promise.withResolvers();
    let pausedId, navigation, failure;
    const timer = setTimeout(() => {
      failure = new Error("The real traffic response hold exceeded 25 seconds.");
      captured.reject(failure);
      page.call("Fetch.disable").catch(() => { failure = new Error("Timed-out response interception could not be released."); });
    }, 25000);
    page.onRequestPaused = async event => {
      try {
        const url = new URL(event.request.url);
        assert.equal(url.origin, base);
        assert.equal(url.pathname, "/traffic");
        assert.equal(event.resourceType, "Document");
        assert.equal(event.responseStatusCode, 200, "Hold a real successful traffic document, not an error or redirect.");
        assert.equal(pausedId, undefined, "Only the requested traffic document may be intercepted.");
        pausedId = event.requestId;
        const response = await page.call("Fetch.getResponseBody", { requestId: pausedId });
        captured.resolve(response.base64Encoded ? Buffer.from(response.body, "base64").toString() : response.body);
      } catch (error) { failure = error; captured.reject(error); }
    };
    try {
      await page.call("Fetch.enable", { patterns: [{ urlPattern: `${base}/traffic*`, resourceType: "Document", requestStage: "Response" }] });
      navigation = page.go(`/traffic?segment=${primaryId}`).then(() => null, error => { captured.reject(error); return error; });
      const body = await captured.promise;
      // Next embeds the real snapshot in escaped RSC script strings within the document.
      const objects = body.replaceAll('\\"', '"').match(/\{[^{}]*\}/g) ?? [];
      const candidate = objects.find(value => value.includes('"segment_id":"primary-west"') && value.includes('"multiple_sources":true'));
      assert.ok(candidate, "The intercepted body must contain the actual positive primary assessment before expiry.");
      const row = JSON.parse(candidate);
      assert.deepEqual(Object.keys(row).sort(), assessmentFields);
      assert.equal(row.eligible_source_count, 3);
      assert.equal(row.eligible_report_count, 5);
      assert.equal(Date.parse(row.valid_until), Date.parse(expiresAt));
      await expectAssessment(primaryId, [7, 6, 5, 3]);
      await waitForDatabaseExpiry(expiresAt, () => { if (failure) throw failure; });
      await expectAssessment(primaryId, [7, 6, 2, 2]);
      if (failure) throw failure;
      await page.call("Fetch.continueRequest", { requestId: pausedId });
      clearTimeout(timer);
      const navigationError = await navigation;
      if (navigationError) throw navigationError;
      if (failure) throw failure;
      return row;
    } finally {
      clearTimeout(timer);
      try { await page.call("Fetch.disable"); }
      finally {
        delete page.onRequestPaused;
        if (navigation) await navigation;
      }
    }
  }
  async function delayedHydration(width, height, guest) {
    await withPage(width, height, {}, async page => {
      await page.call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
        window.__evidenceDeliveryStates = [];
        const selector = '[data-segment-assessment="${primaryId}"], [data-report-assessment="${primaryId}"], [data-map-segment="${primaryId}"]';
        const record = element => { if (element.matches?.(selector)) window.__evidenceDeliveryStates.push(element.dataset.assessmentState); };
        new MutationObserver(records => {
          for (const mutation of records) {
            if (mutation.type === 'attributes' && mutation.target.matches(selector)) window.__evidenceDeliveryStates.push(mutation.oldValue);
            for (const node of mutation.addedNodes) { record(node); node.querySelectorAll?.(selector).forEach(record); }
          }
          document.querySelectorAll(selector).forEach(record);
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-assessment-state'], attributeOldValue: true });
      })()` });
      const { expiresAt } = await armGuestExpiry(guest);
      const row = await delayedDocument(page, expiresAt);
      await ready(page); await selected(page, primaryId);
      await page.waitFor("Object.keys(document.querySelector('[data-refresh-traffic]')).some(key => key.startsWith('__reactProps$'))", "delayed document has actually hydrated");
      await loadMap(page); await mapState(page, "ready");
      await page.evaluate("window.__evidenceCanvas = document.querySelector('[data-map-state] canvas')");
      await surfaces(page, primaryId, row, "expired");
      assert.equal(await page.evaluate("window.__evidenceDeliveryStates.includes('expired')"), true, "The pre-document observer must capture actual assessment rendering.");
      assert.equal(await page.evaluate("window.__evidenceDeliveryStates.includes('multiple')"), false, "Expired response delivery/hydration must never flash a fresh positive assessment.");
      await screenshot(page, "evidence-delayed-hydration");
      await refresh(page);
      await surfaces(page, primaryId, await expectAssessment(primaryId, [7, 6, 2, 2]));
      await publicPrivacy(page);
    });
  }
  async function visibilityResume(page, width, height, guest) {
    const sibling = await createPage(width, height, { contextId: page.browserContextId });
    try {
      await page.call("Page.bringToFront");
      const { row, expiresAt } = await armGuestExpiry(guest);
      await refresh(page); await surfaces(page, primaryId, row);
      await page.evaluate(`(() => {
        const nativeNow = Date.now, nativeMonotonic = performance.now.bind(performance);
        const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
        const probe = window.__evidenceResume = { hidden: 0, visible: 0, stoppedAt: null, wallOffset: 0 };
        const record = () => {
          if (document.visibilityState === 'hidden') { probe.hidden++; probe.stoppedAt ??= nativeMonotonic(); }
          else probe.visible++;
        };
        // Model a suspended device whose monotonic clock stops; database time remains real.
        Object.defineProperty(performance, 'now', { configurable: true, value: () => probe.stoppedAt ?? nativeMonotonic() });
        Date.now = () => nativeNow() + probe.wallOffset;
        document.addEventListener('visibilitychange', record, true);
        window.__restoreEvidenceResume = () => {
          Date.now = nativeNow;
          if (descriptor) Object.defineProperty(performance, 'now', descriptor); else delete performance.now;
          document.removeEventListener('visibilitychange', record, true);
        };
      })()`);
      const requestStart = page.requests.length;
      await sibling.call("Page.bringToFront");
      await page.waitFor("document.visibilityState === 'hidden' && window.__evidenceResume.hidden > 0", "real browser tab becomes hidden");
      assert.equal(await page.evaluate(`(${q(selectors(primaryId))}).every(selector => document.querySelector(selector)?.dataset.assessmentState === 'multiple')`), true, "The page must still have positive evidence when it is frozen.");
      await page.call("Page.setWebLifecycleState", { state: "frozen" });
      await waitForDatabaseExpiry(expiresAt);
      await expectAssessment(primaryId, [7, 6, 2, 2]);
      await page.call("Page.setWebLifecycleState", { state: "active" });
      await page.call("Page.bringToFront");
      await page.waitFor("document.visibilityState === 'visible' && window.__evidenceResume.visible > 0", "real frozen tab resumes visibly");
      await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.equal(await page.evaluate(`(${q(selectors(primaryId))}).every(selector => document.querySelector(selector)?.dataset.assessmentState === 'expired')`), true, "The resumed page withdraws positive evidence by the next rendered frames.");
      await surfaces(page, primaryId, row, "expired");
      assert.equal(await page.evaluate("performance.now() === window.__evidenceResume.stoppedAt"), true, "Resume expiry is checked even when browser monotonic time did not advance.");
      for (const offset of [86400000, -86400000]) {
        await page.evaluate(`window.__evidenceResume.wallOffset = ${offset}`);
        const visible = await page.evaluate("window.__evidenceResume.visible");
        await sibling.call("Page.bringToFront");
        await page.waitFor("document.visibilityState === 'hidden'", "clock-skew tab is hidden");
        await page.call("Page.bringToFront");
        await page.waitFor(`document.visibilityState === 'visible' && window.__evidenceResume.visible > ${visible}`, "clock-skew tab resumes");
        await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        assert.equal(await page.evaluate(`(${q(selectors(primaryId))}).every(selector => document.querySelector(selector)?.dataset.assessmentState === 'expired')`), true, "Forward/backward wall-clock skew cannot resurrect an expired assessment.");
        await surfaces(page, primaryId, row, "expired");
        assert.equal(await page.evaluate("Array.from(document.querySelectorAll('[data-public-report]')).some(element => element.innerText.includes('Recent report'))"), false, "Individual report freshness follows the same conservative clock and cannot resurrect after skew.");
      }
      assert.equal(page.requests.slice(requestStart).some(request => new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic"), false, "Resume and clock skew withdraw stale evidence without silently rereading traffic.");
      await screenshot(page, "evidence-visibility-resume");
      await privacy(sibling);
    } finally {
      try {
        await page.call("Page.setWebLifecycleState", { state: "active" });
        await page.call("Page.bringToFront");
        await page.evaluate("window.__restoreEvidenceResume?.()");
      } finally { await disposePage(sibling); }
    }
    await refresh(page);
    await surfaces(page, primaryId, await expectAssessment(primaryId, [7, 6, 2, 2]));
  }
  async function clearReports() {
    for (const id of sources) await service(`rest/v1/traffic_reports_private?source_id=eq.${id}`, "DELETE");
  }
  let failure;
  try {
    await rpc("set_reporting_enabled", { p_enabled: true });
    const secondSource = await createSource(), thirdSource = await createSource();
    for (const [width, height] of viewports) {
      const guest = await submitGuest(width, height);
      await withPage(width, height, {}, async page => {
        await page.go(`/traffic?segment=${primaryId}`); await ready(page); await selected(page, primaryId);
        await privacy(page);
        const start = page.requests.length;
        await loadMap(page); await providerEvidence(page, start); await mapState(page, "ready");
        await page.evaluate("window.__evidenceCanvas = document.querySelector('[data-map-state] canvas')");
        await surfaces(page, primaryId, await expectAssessment(primaryId, [1, 1, 1, 1]));
        const { read_at: readAt } = await snapshot();
        const now = Date.parse(readAt), iso = minutes => new Date(now - minutes * 60000).toISOString();
        await insertReport(guest.sourceId, primaryId, iso(0), "flood");
        await insertReport(guest.sourceId, primaryId, iso(0), "unknown");
        await refresh(page);
        await surfaces(page, primaryId, await expectAssessment(primaryId, [3, 3, 3, 1]));
        await insertReport(secondSource, primaryId, iso(17));
        const oldId = await insertReport(thirdSource, primaryId, iso(21));
        await refresh(page);
        await surfaces(page, primaryId, await expectAssessment(primaryId, [5, 4, 3, 1]));
        await page.waitFor(`document.querySelector('[data-public-report="${oldId}"]')?.innerText.includes('Stale report')`, "old rows remain visible without contributing to recent or eligible counts");
        await insertReport(secondSource, primaryId, iso(0));
        const oppositeReport = await insertReport(thirdSource, oppositeId, iso(0));
        const parallelReport = await insertReport(thirdSource, parallelId, iso(0));
        await refresh(page);
        await surfaces(page, primaryId, await expectAssessment(primaryId, [6, 5, 4, 2]));
        for (const [id, reportId] of [[oppositeId, oppositeReport], [parallelId, parallelReport]]) {
          await selectList(page, id);
          await surfaces(page, id, await expectAssessment(id, [1, 1, 1, 1]));
          await page.waitFor(`!!document.querySelector('[data-public-report="${reportId}"]')`, "isolated directional report");
          assert.equal(await page.evaluate(`!!document.querySelector('[data-public-report="${guest.id}"]')`), false, "A primary report never leaks into opposite-direction or nearby parallel details.");
        }
        await page.click(`[data-map-segment="${primaryId}"]`); await selected(page, primaryId);
        await insertReport(thirdSource, primaryId, iso(0));
        await refresh(page);
        await surfaces(page, primaryId, await expectAssessment(primaryId, [7, 6, 5, 3]));
        await screenshot(page, "evidence-multiple");
        const expiryClock = await snapshot();
        const expiresAt = new Date(Date.parse(expiryClock.read_at) + 20000).toISOString();
        await service(`rest/v1/report_sources?id=eq.${guest.sourceId}`, "PATCH", { created_at: new Date(Date.parse(expiresAt) - 86400000).toISOString(), expires_at: expiresAt });
        await refresh(page);
        const expiring = await expectAssessment(primaryId, [7, 6, 5, 3]);
        assert.equal(Date.parse(expiring.valid_until), Date.parse(expiresAt), "The next evidence deadline includes absolute guest expiry.");
        await surfaces(page, primaryId, expiring);
        const requestStart = page.requests.length;
        await page.waitFor(`(${q(selectors(primaryId))}).every(selector => document.querySelector(selector)?.dataset.assessmentState === 'expired')`, "guest expiry withdraws every positive display without refresh", 45000);
        await surfaces(page, primaryId, expiring, "expired");
        for (const id of [oppositeId, parallelId]) {
          assert.equal(await page.evaluate(`['[data-segment-assessment="${id}"]', '[data-map-segment="${id}"]'].every(selector => document.querySelector(selector)?.dataset.assessmentState === 'insufficient')`), true, "Guest expiry on the primary segment does not expire unrelated directional evidence.");
        }
        assert.equal(page.requests.slice(requestStart).some(request => new URL(request.url).origin === base && new URL(request.url).pathname === "/traffic"), false, "Client expiry requires refresh, not an unrequested new public read.");
        await screenshot(page, "evidence-expired");
        // The UI may conservatively expire before the database deadline by the read's transport time.
        const deadline = performance.now() + 15000;
        while (Date.parse((await snapshot()).read_at) < Date.parse(expiresAt)) {
          assert.ok(performance.now() < deadline, "The controlled database expiry must be reached.");
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const expired = await expectAssessment(primaryId, [7, 6, 2, 2]);
        const retained = await snapshot();
        assert.ok(retained.reports.some(row => row.id === guest.id) && retained.reports.some(row => row.id === oldId), "Source expiry and old observation times do not delete retained report rows.");
        await refresh(page); await surfaces(page, primaryId, expired);
        await page.waitFor(`!!document.querySelector('[data-public-report="${guest.id}"]')`, "expired guest report remains publicly visible");
        await screenshot(page, "evidence-recomputed");
        await visibilityResume(page, width, height, guest);
        await delayedHydration(width, height, guest);
        await page.call("Page.bringToFront");
        const renewed = await snapshot();
        await service(`rest/v1/report_sources?id=eq.${guest.sourceId}`, "PATCH", { created_at: new Date(renewed.read_at).toISOString(), expires_at: new Date(Date.parse(renewed.read_at) + 86400000).toISOString() });
        await refresh(page);
        await surfaces(page, primaryId, await expectAssessment(primaryId, [7, 6, 2, 2]));
        await publicPrivacy(page);
        console.log(`PASS evidence ${base} ${width}px: real guest submission, duplicate/source/window separation, direction isolation, timer/visibility expiry, delayed real-response hydration, explicit refresh, public privacy and layout`);
      });
      await clearReports();
      assert.deepEqual((await snapshot()).reports, original.reports, "Each viewport removes only its own reports.");
    }
  } catch (error) {
    failure = error;
  } finally {
    const cleanupErrors = [];
    async function cleanup(label, action) {
      try { await action(); } catch { cleanupErrors.push(new Error(label)); }
    }
    for (const id of sources) await cleanup("Could not remove a test-owned evidence source.", () => service(`rest/v1/report_sources?id=eq.${id}`, "DELETE"));
    for (const id of users) await cleanup("Could not remove a test-owned evidence user.", () => service(`auth/v1/admin/users/${id}`, "DELETE"));
    await cleanup("Could not restore the original reporting gate.", () => rpc("set_reporting_enabled", { p_enabled: original.reporting_enabled }));
    await cleanup("Evidence cleanup did not preserve original public reports and reporting gate.", async () => {
      const restored = await snapshot();
      assert.deepEqual(restored.reports, original.reports);
      assert.equal(restored.reporting_enabled, original.reporting_enabled);
    });
    if (cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], "Evidence cleanup was incomplete; inspect local state before rerunning.");
  }
  if (failure) throw failure;
}
