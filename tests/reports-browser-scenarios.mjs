import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

export async function runReportScenarios(tools) {
  const { base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList, loadMap, mapState, refresh, replace, fixture, fault, testFaults } = tools;
  const q = JSON.stringify;
  const users = new Set();
  const storage = "trafficsense-pending-demo-report";
  async function service(path, method = "GET", body) {
    const response = await fetch(`${status.API_URL}/${path}`, {
      method, headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `Test fixture request failed (${response.status}); credentials and response body are withheld.`);
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  const rpc = (name, body = {}) => service(`rest/v1/rpc/${name}`, "POST", body);
  const original = await rpc("read_traffic_demo");
  async function capture(page, label) {
    const path = await page.evaluate("location.pathname");
    if (path !== "/traffic" && path !== "/reports/new") return;
    await mkdir("supabase/.temp/browser", { recursive: true });
    const image = await page.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(`supabase/.temp/browser/${new URL(base).port}-${page.width}-reports-${label}.png`, Buffer.from(image.data, "base64"));
  }
  async function prepareGuest(page) {
    page.reporting = true;
    await page.button("Continue as guest");
    await page.text("Prepared as a temporary guest");
    const cookies = await page.cookies();
    assert.ok(cookies.length > 0 && cookies.every(cookie => cookie.name.startsWith("trafficsense-report-guest") && cookie.httpOnly && cookie.sameSite === "Lax"));
    const encoded = cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(cookie => cookie.value).join("");
    assert.ok(encoded.startsWith("base64-"), "Guest cookies use the SDK's expected encoding.");
    const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString());
    assert.ok(session.user?.id, "The test must track only the guest created by this browser for cleanup.");
    users.add(session.user.id);
    assert.equal(await page.evaluate("document.cookie.includes('trafficsense-report-guest')"), false, "Guest identity is HTTP-only.");
  }
  async function choose(page, name, index) {
    await page.click(`[name="${name}"]`);
    await page.key("Home", "Home", 36);
    for (let i = 0; i < index; i++) await page.key("ArrowDown", "ArrowDown", 40);
    await page.key("Enter", "Enter", 13);
  }
  async function saved(page) {
    await page.waitFor("!!document.querySelector('[data-report-saved]')", "committed report acknowledgement");
    const id = await page.evaluate("document.querySelector('[data-report-saved]').dataset.reportSaved");
    const draft = await page.evaluate(`JSON.parse(sessionStorage.getItem(${q(storage)}))`);
    const rows = await service(`rest/v1/traffic_reports_private?source_id=eq.${draft.source_id}&request_id=eq.${draft.request_id}&select=public_id`);
    assert.equal(rows.length, 1, "Exactly one database report exists for this browser request.");
    assert.equal(rows[0].public_id, id);
    const [projection] = await service(`rest/v1/public_traffic_reports?id=eq.${id}&select=episode_id`);
    assert.ok(projection?.episode_id, "An accepted report has persisted episode membership.");
    await page.waitFor(`document.querySelector('[data-report-episode]')?.dataset.reportEpisode === ${q(projection.episode_id)}`, "acknowledgement shows the persisted episode");
    return { id, draft, episodeId: projection.episode_id };
  }
  async function publicReport(page, record) {
    await page.waitFor("document.querySelector('[data-report-saved] button')?.disabled === false", "saved report transition and refresh finish");
    await layout(page);
    await page.click('a[href*="#segment-reports"]');
    await page.route("/traffic"); await ready(page); await selected(page, record.draft.segment_id);
    await page.waitFor(`!!document.querySelector('[data-public-report="${record.id}"]')`, "saved report appears on the public segment");
    const body = await page.evaluate("document.querySelector('#segment-reports').innerText");
    assert.ok(body.includes("unconfirmed") && body.includes("SIMULATED") && body.includes("Manually selected"));
    assert.ok(!body.includes(record.draft.source_id) && !body.includes(record.draft.request_id));
    const start = page.requests.length;
    await loadMap(page); await mapState(page, "ready");
    assert.ok(page.requests.length > start);
    const count = await page.evaluate(`document.querySelector('[data-map-segment="${record.draft.segment_id}"]').dataset.reportCount`);
    assert.ok(Number(count) >= 1, "Map indicates saved unconfirmed reports.");
    const listCount = await page.evaluate(`document.querySelector('[data-segment-report-count="${record.draft.segment_id}"]').innerText`);
    assert.equal(Number.parseInt(listCount, 10), Number(count), "Map and list show the same report count.");
    assert.ok(body.includes(`${count} reports for this direction.`), "Details use the same directional report count.");
    const episodes = (await rpc("read_traffic_demo")).incident_episodes.filter(row => row.segment_id === record.draft.segment_id);
    await page.waitFor(`!!document.querySelector('[data-incident-episode="${record.episodeId}"]')`, "saved episode appears in segment history");
    assert.equal(await page.evaluate(`document.querySelector('[data-public-report="${record.id}"]').dataset.episodeId`), record.episodeId);
    const episodeLabels = await page.evaluate(`['[data-segment-episodes="${record.draft.segment_id}"]', '[data-episode-summary="${record.draft.segment_id}"]'].map(selector => document.querySelector(selector).innerText)`);
    assert.equal(episodeLabels[0], episodeLabels[1], "List and details share the episode summary.");
    assert.ok(episodeLabels[0].includes(`${episodes.length} retained report episodes`));
    assert.equal(await page.evaluate(`document.querySelector('[data-map-segment="${record.draft.segment_id}"]').dataset.episodeCount`), String(episodes.length));
    assert.ok((await page.evaluate(`document.querySelector('[data-map-segment="${record.draft.segment_id}"]').getAttribute('aria-label')`)).includes(episodeLabels[0]));
    await page.click(`[data-incident-episode="${record.episodeId}"] summary`);
    await page.waitFor(`document.querySelector('[data-incident-episode="${record.episodeId}"]').open`, "episode history expands with pointer input");
    await page.key("Enter", "Enter", 13);
    await page.waitFor(`!document.querySelector('[data-incident-episode="${record.episodeId}"]').open`, "keyboard collapses episode history");
    await page.key("Enter", "Enter", 13);
    await page.waitFor(`document.querySelector('[data-incident-episode="${record.episodeId}"]').open`, "keyboard expands episode history");
    await page.text("Grouping does not confirm a cause or clearance");
    await selectList(page, "alternative-east");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-public-report="${record.id}"]')`), false, "A nearby parallel segment must not inherit the report.");
    await page.click(`[data-map-segment="${record.draft.segment_id}"]`);
    await selected(page, record.draft.segment_id);
    await page.waitFor(`!!document.querySelector('[data-public-report="${record.id}"]')`, "map selection restores matching report details");
    await layout(page); await capture(page, "public");
  }
  async function rememberMap(page) {
    await page.evaluate("window.__reportCanvas = document.querySelector('.maplibregl-canvas'); window.__reportMarkers = Array.from(document.querySelectorAll('[data-map-segment]'))");
  }
  async function unchangedMapCounts(page) {
    const snapshot = await rpc("read_traffic_demo");
    assert.equal(await page.evaluate("window.__reportCanvas === document.querySelector('.maplibregl-canvas') && window.__reportMarkers.every(marker => marker.isConnected)"), true, "Report changes preserve the loaded canvas and marker elements.");
    for (const segment of snapshot.fixture.segments) {
      const reports = snapshot.reports.filter(row => row.segment_id === segment.id).length;
      const episodes = snapshot.incident_episodes.filter(row => row.segment_id === segment.id).length;
      await page.waitFor(`(() => {
        const marker = document.querySelector('[data-map-segment="${segment.id}"]');
        const badge = marker?.querySelector('[data-report-badge]');
        return marker?.dataset.reportCount === '${reports}' && marker?.dataset.episodeCount === '${episodes}'
          && badge?.textContent === '${reports}' && badge.hidden === ${reports === 0}
          && marker.getAttribute('aria-label').includes('${episodes} retained report episodes')
          && marker.title === marker.getAttribute('aria-label');
      })()`, "current marker counts, badge visibility and accessible episode summary");
    }
  }
  async function discard(page) {
    page.acceptDialog = true;
    await page.button("Discard local draft — report may remain saved");
    await page.text("Prepare a demo report");
    assert.equal(await page.evaluate(`sessionStorage.getItem(${q(storage)})`), null);
  }
  async function login(page, account) {
    page.signedIn = true;
    await page.go("/login"); await page.text("Welcome back");
    await page.click("#email"); await page.call("Input.insertText", { text: account.email });
    await page.click("#password"); await page.call("Input.insertText", { text: account.password });
    await page.click('button[type="submit"]'); await page.route("/workspace");
    await page.text(account.email);
  }
  async function createAccount() {
    const email = `report-browser-${crypto.randomUUID()}@example.test`, password = `Test-${crypto.randomUUID()}!`;
    const account = await service("auth/v1/admin/users", "POST", { email, password, email_confirm: true });
    users.add(account.id); return { id: account.id, email, password };
  }
  try {
    await rpc("set_reporting_enabled", { p_enabled: true });
    for (const [width, height] of viewports) {
      await withPage(width, height, {}, async page => {
        try {
          await page.go("/"); await page.text("Traffic information, with its limits in view");
          await page.click('main a[href="/demo"]'); await page.route("/demo");
          await page.click('a[href="/traffic"]'); await ready(page);
          await selectList(page, "primary-west-inbound");
          await page.click('a[href="/reports/new?segment=primary-west-inbound"]');
          await page.route("/reports/new"); await page.text("Prepare a demo report");
          assert.equal((await page.cookies()).length, 0, "Browsing the reporting form must not create an identity.");
          assert.equal(page.unconsentedRequests, 0);
          await prepareGuest(page);
          assert.equal(await page.evaluate("document.querySelector('[name=segment_id]').value"), "primary-west-inbound");
          await choose(page, "category", 1);
          assert.equal(await page.evaluate("document.querySelector('[name=category]').value"), "accident");
          await layout(page); await capture(page, "form");
          const sibling = await createPage(width, height, { contextId: page.browserContextId });
          sibling.reporting = true;
          let first;
          try {
            await sibling.go("/traffic?segment=primary-west-inbound"); await ready(sibling);
            await loadMap(sibling); await mapState(sibling, "ready"); await rememberMap(sibling);
            await page.click('button[type="submit"]');
            first = await saved(page);
            assert.equal(await sibling.evaluate(`!!document.querySelector('[data-public-report="${first.id}"]')`), false, "An open snapshot does not claim live updates.");
            await refresh(sibling);
            await sibling.waitFor(`!!document.querySelector('[data-public-report="${first.id}"]')`, "second-tab refresh sees the persisted report");
            assert.equal(await sibling.evaluate(`document.querySelector('[data-public-report="${first.id}"]').dataset.episodeId`), first.episodeId, "Second-tab refresh preserves episode identity.");
            await sibling.waitFor(`!!document.querySelector('[data-incident-episode="${first.episodeId}"]')`, "second-tab refresh includes retained episode history");
            await unchangedMapCounts(sibling);
            await privacy(sibling);
          } finally { await disposePage(sibling); }
          await page.reload(); await page.text("Submission outcome is not confirmed");
          await page.button("Retry unchanged report");
          assert.equal((await saved(page)).episodeId, first.episodeId, "Retry returns the original episode."); await page.text("no duplicate was created");
          await publicReport(page, first);
          const cookiesBefore = (await page.cookies()).map(({ name, value }) => ({ name, value }));
          await page.reload(); await ready(page); await refresh(page);
          assert.deepEqual((await page.cookies()).map(({ name, value }) => ({ name, value })), cookiesBefore, "Public reads preserve the guest identity without refreshing it.");
          await page.go("/workspace"); await page.route("/login");
          await page.go("/employer"); await page.route("/login");
          await page.go("/authority"); await page.route("/login");
          await page.go("/admin"); await page.route("/login");
          await page.go("/reports/new?segment=primary-west-inbound");
          await page.button("Check saved status"); await saved(page);
          await page.button("Prepare another report"); await prepareGuest(page);
          // A controlled input value exercises server timestamp rejection; category/navigation use real keys.
          await page.evaluate("document.querySelector('[name=observed_local]').value = '2099-01-01T12:00'");
          await page.click('button[type="submit"]');
          await page.waitFor("!!document.querySelector('[data-report-failure=invalid]')", "future-dated report rejected");
          await page.button("Correct rejected draft");
          await page.click('button[type="submit"]');
          const second = await saved(page);
          assert.notEqual(first.id, second.id);
          assert.equal(first.episodeId, second.episodeId, "A fresh report on the same directed segment joins the current episode.");
          for (let i = 0; i < 3; i++) {
            await page.button("Prepare another report"); await prepareGuest(page);
            await page.click('button[type="submit"]'); await saved(page);
          }
          await page.button("Prepare another report"); await prepareGuest(page);
          await page.click('button[type="submit"]');
          await page.waitFor("!!document.querySelector('[data-report-failure=rate_limited]')", "sixth report is rejected without a false success");
          await page.button("Retry unchanged report");
          await page.waitFor("!!document.querySelector('[data-report-failure=rate_limited]')", "unchanged rejected request remains rate limited");
          const clock = await rpc("read_traffic_demo");
          const expired = Date.parse(clock.read_at);
          await service(`rest/v1/report_sources?id=eq.${first.draft.source_id}`, "PATCH", { created_at: new Date(expired - 90000000).toISOString(), expires_at: new Date(expired - 3600000).toISOString() });
          await page.button("Check saved status");
          await page.waitFor("!!document.querySelector('[data-report-failure=expired]')", "expired guest cannot check or retry under a replacement identity");
          await service(`rest/v1/public_traffic_reports?id=eq.${first.id}`, "PATCH", { observed_at: new Date(expired - 1200001).toISOString() });
          await page.go("/traffic?segment=primary-west-inbound"); await ready(page);
          await page.waitFor(`document.querySelector('[data-public-report="${first.id}"]')?.innerText.includes('Stale report')`, "old reports remain visible with explicit stale labels");
          await page.go("/reports/new?segment=not-a-segment"); await page.text("Segment not found");
          await page.go("/reports/new?segment=primary-west&segment=primary-west"); await page.text("Segment not found");
          await rpc("set_reporting_enabled", { p_enabled: false });
          await page.go("/reports/new"); await page.text("Demo reporting is disabled"); await layout(page);
          await rpc("set_reporting_enabled", { p_enabled: true });
          await replace(null); await page.go("/reports/new"); await page.text("No demonstration corridor is loaded");
          assert.deepEqual((await rpc("read_traffic_demo")).incident_episodes, [], "Reset hides episodes without clearing them.");
          await replace(fixture); await page.go("/traffic?segment=primary-west-inbound"); await ready(page);
          await page.waitFor(`!!document.querySelector('[data-public-report="${first.id}"]')`, "report survives simulator reset and restoration");
          assert.equal(await page.evaluate(`document.querySelector('[data-public-report="${first.id}"]').dataset.episodeId`), first.episodeId, "Staleness and simulator reset preserve membership.");
          await page.waitFor(`!!document.querySelector('[data-incident-episode="${first.episodeId}"]')`, "retained episode reappears after simulator restoration");
          await page.click(`[data-incident-episode="${first.episodeId}"] summary`);
          await layout(page); await capture(page, "episode-history");
          await loadMap(page); await mapState(page, "ready"); await rememberMap(page);
          await rpc("cleanup_traffic_reports", { p_source_ids: [first.draft.source_id] });
          await refresh(page); await unchangedMapCounts(page);
          assert.equal(await page.evaluate(`!!document.querySelector('[data-public-report="${first.id}"]')`), false, "Deleting this test's source removes its report from the refreshed details.");
          console.log(`PASS reports ${base} ${width}px: explicit guest identity, keyboard form, persistence/retry/reload, invalid time, private-route denial, map/list/direction consistency and disabled/empty recovery`);
        } catch (error) { await capture(page, "failure"); throw error; }
      });
      const account = await createAccount();
      await withPage(width, height, { signedIn: true }, async page => {
        try {
          await login(page, account);
          const before = (await page.cookies()).map(({ name, value }) => ({ name, value }));
          await page.go("/reports/new?segment=primary-west"); await page.button("Use current account");
          await page.text("Prepared as your current account");
          await page.click('button[type="submit"]'); const record = await saved(page);
          assert.deepEqual((await page.cookies()).map(({ name, value }) => ({ name, value })), before, "Reporting preserves account cookies.");
          await page.go("/workspace"); await page.click('button[type="submit"]'); await page.route("/login");
          assert.equal((await page.cookies()).length, 0);
          page.signedIn = false;
          await page.go("/reports/new"); await page.button("Check saved status");
          await page.waitFor("!!document.querySelector('[data-report-failure=expired]')", "logged-out draft does not become guest submission");
          assert.equal((await page.cookies()).length, 0);
          const other = await createAccount(); await login(page, other);
          await page.go("/reports/new"); await page.button("Retry unchanged report");
          await page.waitFor("!!document.querySelector('[data-report-failure=identity_changed]')", "account switch rejects old draft");
          const rows = await service(`rest/v1/traffic_reports_private?source_id=eq.${record.draft.source_id}&request_id=eq.${record.draft.request_id}&select=id`);
          assert.equal(rows.length, 1);
          await discard(page); await page.button("Use current account"); await page.text("Prepared as your current account");
          await page.click('button[type="submit"]'); await saved(page);
          await layout(page); await capture(page, "account-saved");
          console.log(`PASS reports ${base} ${width}px: account submission, session preservation, logout and changed-account draft rejection with explicit restart`);
        } catch (error) { await capture(page, "failure"); throw error; }
      });
      if (testFaults) await withPage(width, height, {}, async page => {
        try {
          await page.go("/reports/new"); await prepareGuest(page);
          await fault("database"); await page.click('button[type="submit"]');
          await page.waitFor("!!document.querySelector('[data-report-failure=unknown]')", "database failure has no false success");
          await page.button("Check saved status"); await page.waitFor("!!document.querySelector('[data-report-failure=unavailable]')", "outage status check unavailable");
          await fault("healthy"); await page.button("Check saved status");
          await page.waitFor("!!document.querySelector('[data-report-failure=not_found]')", "failed database write leaves no report");
          await page.button("Retry unchanged report"); await saved(page);
          await page.button("Prepare another report"); await prepareGuest(page);
          await fault("report-response-loss"); await page.click('button[type="submit"]');
          await page.waitFor("!!document.querySelector('[data-report-failure=unknown]')", "committed response loss remains unknown");
          const draft = await page.evaluate(`JSON.parse(sessionStorage.getItem(${q(storage)}))`);
          const rows = await service(`rest/v1/traffic_reports_private?source_id=eq.${draft.source_id}&request_id=eq.${draft.request_id}&select=id`);
          assert.equal(rows.length, 1, "The response was lost after a real database commit.");
          await fault("healthy"); await page.reload(); await page.button("Retry unchanged report");
          await saved(page); await page.text("no duplicate was created");
          await fault("auth"); await page.go("/traffic"); await ready(page); await refresh(page);
          await page.go("/reports/new"); await page.button("Check saved status");
          await page.waitFor("!!document.querySelector('[data-report-failure=unavailable]')", "Auth outage blocks writes but not public reads");
          await fault("healthy"); await page.button("Check saved status"); await saved(page);
          await layout(page); await capture(page, "fault-recovery");
          console.log(`PASS reports ${base} ${width}px: database/Auth outage recovery and committed-but-lost response replay without duplicates`);
        } finally { await fault("healthy"); }
      });
    }
  } finally {
    if (testFaults) await fault("healthy");
    for (const id of users) await service(`auth/v1/admin/users/${id}`, "DELETE");
    await rpc("set_reporting_enabled", { p_enabled: original.reporting_enabled });
    const restored = await rpc("read_traffic_demo");
    assert.deepEqual(restored.reports, original.reports, "Only test-owned reports and identities are removed.");
  }
}
