import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readLocalStatus } from "../scripts/local-status.mjs";
import { createTrafficFixture, DEFAULT_DEMO_ANCHOR } from "../apps/web/src/lib/traffic/simulator.ts";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const debuggerUrl = process.env.CHROMIUM_DEBUG_URL || "http://127.0.0.1:9333";
const setupOnly = process.env.TRAFFIC_SETUP === "true";
const testFaults = process.env.TRAFFIC_FAULTS === "true";
const reportSuite = process.env.REPORTS_BROWSER === "true";
const evidenceSuite = process.env.EVIDENCE_BROWSER === "true";
const slowdownSuite = process.env.SLOWDOWN_BROWSER === "true";
const phase4Suite = process.env.PHASE4_BROWSER === "true";
const routeAlertsSuite = process.env.ROUTE_ALERTS_BROWSER === "true";
assert.ok(!routeAlertsSuite || !(phase4Suite || slowdownSuite || evidenceSuite || reportSuite || setupOnly || testFaults), "Route alert scenarios run separately.");
assert.ok(!phase4Suite || !(slowdownSuite || evidenceSuite || reportSuite || setupOnly || testFaults), "Phase four scenarios run separately.");
assert.ok(!slowdownSuite || !(evidenceSuite || reportSuite || setupOnly || testFaults), "Slowdown scenarios run separately from evidence, reporting, setup and fault suites.");
assert.ok(!evidenceSuite || !(reportSuite || setupOnly || testFaults), "Evidence scenarios run separately from reporting, setup and fault suites.");
assert.ok(!(setupOnly && testFaults), "Setup and fault scenarios must run separately.");
const ports = setupOnly ? [3004, 3005] : testFaults ? [3002, 3003] : [3000, 3001];
assert.ok(ports.some(port => base === `http://127.0.0.1:${port}`), "Use the local app ports assigned to this scenario.");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(debuggerUrl).hostname), "Chromium must be local.");
const viewports = [[1440, 1000], [390, 844]];
if (process.env.TRAFFIC_NARROW === "true" || evidenceSuite || slowdownSuite || phase4Suite || routeAlertsSuite) viewports.push([320, 740]);
const readySelector = '[data-testid="traffic-ready"]';
const listSelector = "[data-segment-list] a[data-segment-id]";
const fixture = createTrafficFixture("slowdown", DEFAULT_DEMO_ANCHOR);
const primaryId = "primary-west";
const secondId = "primary-east";
const markerId = "alternative-west";
const quote = JSON.stringify;
const cancellation = new AbortController();
let cleaning = false;
function checkCancelled() { if (!cleaning) cancellation.signal.throwIfAborted(); }
const interrupt = () => cancellation.abort(new Error("Traffic browser run interrupted; restoring local state."));
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

let socket;
let sequence = 0;
let status;
let previous;
let restoreFixture = false;
let restoreFaults = false;
const pending = new Map();
const pages = new Set();
const sessions = new Map();
const exceptions = [];
const diagnostics = [];
const instrumentationErrors = [];
const nextDiagnostics = [
  "uncached data during prerendering or a navigation",
  "Could not validate `instant`",
  "encountered the unstable value",
  "Hydration failed",
  "A tree hydrated but some attributes",
];

function send(method, params = {}, sessionId) {
  checkCancelled();
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

function isProvider(url) {
  const host = new URL(url).hostname;
  return host === "openfreemap.org" || host.endsWith(".openfreemap.org");
}
function isTile(url) {
  return isProvider(url) && /\/\d+\/\d+\/\d+(?:\.(?:pbf|mvt|png|webp))?$/.test(new URL(url).pathname);
}
function receive({ data }) {
  const message = JSON.parse(data);
  const { method, params, sessionId } = message;
  const page = sessions.get(sessionId);
  if (method === "Target.attachedToTarget" && page) {
    sessions.set(params.sessionId, page);
    page.sessions.add(params.sessionId);
    configureWorker(page, params.sessionId).catch(() => instrumentationErrors.push("Worker instrumentation failed."));
  }
  if (method === "Target.detachedFromTarget") {
    const owner = sessions.get(params.sessionId);
    owner?.sessions.delete(params.sessionId);
    sessions.delete(params.sessionId);
  }
  if (method === "Fetch.requestPaused" && page) {
    Promise.resolve().then(() => page.onRequestPaused
      ? page.onRequestPaused(params)
      : page.call("Fetch.continueRequest", { requestId: params.requestId }))
      .catch(() => instrumentationErrors.push("Response interception failed."));
  }
  if (method === "Page.javascriptDialogOpening" && page?.acceptDialog) {
    page.acceptDialog = false;
    page.call("Page.handleJavaScriptDialog", { accept: true }).catch(() => instrumentationErrors.push("Dialog confirmation failed."));
  }
  if (method === "Runtime.exceptionThrown") {
    exceptions.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
  }
  if (method === "Runtime.consoleAPICalled") {
    const report = params.args.map(arg => arg.value || arg.description || "").join(" ");
    for (const diagnostic of nextDiagnostics) if (report.includes(diagnostic)) diagnostics.push(diagnostic);
  }
  if (method === "Runtime.bindingCalled" && params.name === "__trafficGeolocationCall" && page) page.geolocationCalls++;
  if (method === "Network.requestWillBeSent" && page) {
    const request = { url: params.request.url, sessionId, requestId: params.requestId, completed: false };
    page.requests.push(request);
    page.requestsById.set(`${sessionId}:${params.requestId}`, request);
    if (isProvider(request.url) && !page.mapConsent) page.unconsentedRequests++;
  }
  const request = page?.requestsById.get(`${sessionId}:${params?.requestId}`);
  if (request && method === "Network.responseReceived") {
    request.status = params.response.status;
    request.cached = !!(params.response.fromDiskCache || params.response.fromServiceWorker);
  }
  if (request && method === "Network.loadingFinished") {
    request.completed = true;
    request.bytes = params.encodedDataLength;
  }
  if (request && method === "Network.loadingFailed") {
    request.failed = true;
    request.blocked = params.blockedReason;
    request.error = params.errorText;
  }
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  clearTimeout(item.timer);
  if (message.error) item.reject(new Error(`CDP command failed: ${message.error.message}`));
  else item.resolve(message.result);
}

async function configureWorker(page, sessionId) {
  try {
    await send("Runtime.enable", {}, sessionId);
    await send("Network.enable", {}, sessionId);
    await send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
    await send("Network.setBlockedURLs", { urls: page.blockedURLs }, sessionId);
  } finally {
    await send("Runtime.runIfWaitingForDebugger", {}, sessionId);
  }
}

// Installed before application code, including on full reloads and history documents.
function privacyProbe(noWebGL) {
  window.__trafficProbe = { geolocationCalls: 0, webglAttempts: 0, mapStates: [] };
  for (const method of ["getCurrentPosition", "watchPosition"]) {
    if (!globalThis.Geolocation) continue;
    Object.defineProperty(Geolocation.prototype, method, {
      configurable: true,
      value() {
        window.__trafficProbe.geolocationCalls++;
        window.__trafficGeolocationCall(method);
        throw new Error("Unexpected geolocation request in public traffic browsing.");
      },
    });
  }
  if (noWebGL) {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (/webgl/i.test(kind)) {
        window.__trafficProbe.webglAttempts++;
        return null;
      }
      return original.call(this, kind, ...args);
    };
  }
  const record = value => { if (value) window.__trafficProbe.mapStates.push(value); };
  new MutationObserver(records => {
    for (const mutation of records) if (mutation.attributeName === "data-map-state") record(mutation.oldValue);
    for (const element of document.querySelectorAll("[data-map-state]")) record(element.dataset.mapState);
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-map-state"], attributeOldValue: true });
}

async function createPage(width, height, { noWebGL = false, signedIn = false, contextId = null } = {}) {
  const { browserContextId } = contextId ? { browserContextId: contextId } : await send("Target.createBrowserContext");
  const page = {
    browserContextId, ownsContext: !contextId, width, signedIn, sessions: new Set(), requests: [], requestsById: new Map(),
    blockedURLs: [], geolocationCalls: 0, unconsentedRequests: 0, mapConsent: false,
  };
  pages.add(page);
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  page.targetId = targetId;
  page.sessionId = sessionId;
  page.sessions.add(sessionId);
  sessions.set(sessionId, page);
  page.call = (method, params = {}) => send(method, params, sessionId);
  page.evaluate = async expression => {
    const result = await page.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error("Browser assertion evaluation failed.");
    return result.result.value;
  };
  page.waitFor = async (expression, description = "browser condition", timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      checkCancelled();
      try { if (await page.evaluate(expression)) return; }
      catch (error) {
        // Only destroyed document contexts are transient during navigation.
        if (!/Cannot find context|Execution context was destroyed|Inspected target navigated/.test(error.message)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${description}`);
  };
  page.text = value => page.waitFor(`document.body?.innerText.includes(${quote(value)})`, `page text: ${value}`);
  page.route = path => page.waitFor(`location.pathname === ${quote(path)}`, `route: ${path}`);
  page.navigate = async action => {
    page.mapConsent = false;
    const marker = crypto.randomUUID();
    await page.evaluate(`window.__trafficNavigation = ${quote(marker)}`);
    const result = await action();
    assert.ok(!result.errorText, "Document navigation must succeed.");
    await page.waitFor(`window.__trafficNavigation !== ${quote(marker)} && document.readyState !== 'loading'`, "new document ready");
  };
  page.go = path => page.navigate(() => page.call("Page.navigate", { url: `${base}${path}` }));
  page.reload = () => page.navigate(() => page.call("Page.reload"));
  page.click = async selector => {
    await page.call("Page.bringToFront");
    await page.waitFor(`(() => {
      const element = document.querySelector(${quote(selector)});
      return element && !element.matches(':disabled') && !element.closest('[inert]')
        && (element.hasAttribute('data-map-segment') || Object.keys(element).some(key => key.startsWith('__reactProps$')));
    })()`, `hydrated enabled control: ${selector}`);
    const position = await page.evaluate(`(async () => {
      await document.fonts.ready;
      const element = document.querySelector(${quote(selector)});
      element.scrollIntoView({block: 'center'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`);
    await page.call("Input.dispatchMouseEvent", { type: "mousePressed", ...position, button: "left", clickCount: 1 });
    await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", ...position, button: "left", clickCount: 1 });
  };
  page.button = async label => {
    await page.call("Page.bringToFront");
    await page.waitFor(`Array.from(document.querySelectorAll('button')).filter(button => button.textContent.trim() === ${quote(label)} && !button.disabled && Object.keys(button).some(key => key.startsWith('__reactProps$'))).length === 1`, `hydrated enabled ${label} button`);
    const position = await page.evaluate(`(async () => {
      await document.fonts.ready;
      const button = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === ${quote(label)});
      button.scrollIntoView({block: 'center'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = button.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`);
    await page.call("Input.dispatchMouseEvent", { type: "mousePressed", ...position, button: "left", clickCount: 1 });
    await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", ...position, button: "left", clickCount: 1 });
  };
  page.key = async (key, code, windowsVirtualKeyCode) => {
    await page.call("Page.bringToFront");
    await page.call("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, ...(key === "Enter" ? { text: "\r" } : {}) });
    await page.call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
  };
  page.cookies = async () => (await page.call("Network.getCookies", { urls: [base] })).cookies
    .filter(cookie => /^(?:trafficsense-(?:auth|report-guest)(?:\.\d+)?|sb-.*-auth-token(?:\.\d+)?)$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  page.block = async urls => {
    page.blockedURLs = urls;
    for (const id of page.sessions) await send("Network.setBlockedURLs", { urls }, id);
  };
  await page.call("Page.enable");
  await page.call("Runtime.enable");
  await page.call("Network.enable");
  await page.call("Network.setCacheDisabled", { cacheDisabled: true });
  await page.call("Network.setBypassServiceWorker", { bypass: true });
  await page.call("Runtime.addBinding", { name: "__trafficGeolocationCall" });
  await page.call("Page.addScriptToEvaluateOnNewDocument", { source: `(${privacyProbe.toString()})(${noWebGL})` });
  await page.call("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await page.call("Emulation.setDeviceMetricsOverride", { width, height, mobile: width < 768, deviceScaleFactor: 1 });
  return page;
}

async function disposePage(page) {
  await send("Target.closeTarget", { targetId: page.targetId });
  if (page.ownsContext) await send("Target.disposeBrowserContext", { browserContextId: page.browserContextId });
  for (const sessionId of page.sessions) sessions.delete(sessionId);
  pages.delete(page);
}
async function screenshot(page, label) {
  // Account forms and workspaces are never captured.
  if (await page.evaluate("location.pathname") !== "/traffic") return;
  await mkdir("supabase/.temp/browser", { recursive: true });
  const shot = await page.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(`supabase/.temp/browser/${new URL(base).port}-${page.width}-traffic-${label}.png`, Buffer.from(shot.data, "base64"));
}
async function privacy(page) {
  assert.equal(page.geolocationCalls, 0, "Public browsing must never call geolocation, including previous documents.");
  if (!page.signedIn) assert.equal((await page.cookies()).filter(cookie => !page.reporting || !cookie.name.startsWith("trafficsense-report-guest")).length, 0, "Browsing must not create auth cookies; only explicit reporting may create a guest identity.");
}
async function withPage(width, height, options, run) {
  const page = await createPage(width, height, options);
  let failure;
  try {
    await run(page);
    await privacy(page);
  } catch (error) {
    try { await screenshot(page, "failure"); } catch { /* Preserve the assertion if the failed document cannot be captured. */ }
    failure = exceptions.length ? new AggregateError([error, ...exceptions.map(message => new Error(message))], "Browser flow failed with runtime diagnostics.") : error;
  } finally {
    try { await disposePage(page); }
    catch (error) { failure = new AggregateError([...(failure ? [failure] : []), error], "Browser flow or page cleanup failed."); }
  }
  if (failure) throw failure;
}
async function layout(page) {
  await page.evaluate("document.fonts.ready");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "No horizontal overflow.");
  const small = await page.evaluate(`Array.from(document.querySelectorAll('a, button, input, select, summary, [role="button"]')).filter(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  }).map(element => element.tagName + ':' + (element.getAttribute('aria-label') || element.getAttribute('href') || element.type || 'control'))`);
  assert.deepEqual(small, [], "All visible controls, including attribution and map controls, must be at least 44px.");
}
async function ready(page) {
  await page.text("Synthetic traffic corridor");
  await page.waitFor(`!!document.querySelector(${quote(readySelector)})`, "ready traffic snapshot");
  const ids = await page.evaluate(`Array.from(document.querySelectorAll(${quote(listSelector)}), link => link.dataset.segmentId)`);
  assert.deepEqual(ids.sort(), fixture.segments.map(segment => segment.id).sort(), "The list contains every directed segment exactly once.");
  await page.text("SIMULATED");
}
async function selected(page, id) {
  await page.waitFor(`document.querySelector('#segment-details')?.dataset.segmentId === ${quote(id)}
    && new URL(location.href).searchParams.get('segment') === ${quote(id)}
    && JSON.stringify(Array.from(document.querySelectorAll(${quote(listSelector)})).filter(link => link.hasAttribute('aria-current') && link.getAttribute('aria-current') !== 'false').map(link => link.dataset.segmentId)) === ${quote(JSON.stringify([id]))}`, `URL/list/details selection: ${id}`);
  if (await page.evaluate("document.querySelector('[data-map-state]')?.dataset.mapState === 'ready'")) {
    await page.waitFor(`JSON.stringify(Array.from(document.querySelectorAll('[data-map-segment][aria-pressed="true"]'), marker => marker.dataset.mapSegment)) === ${quote(JSON.stringify([id]))}`, "map marker matches list/details selection");
  }
  const name = fixture.segments.find(segment => segment.id === id).name;
  assert.equal(await page.evaluate(`document.querySelector('#segment-details').innerText.includes(${quote(name)})`), true, "Details describe the selected segment.");
}
async function selectList(page, id) {
  await page.click(`[data-segment-list] a[data-segment-id="${id}"]`);
  await selected(page, id);
}
async function samples(page, id, label, anchor) {
  await page.waitFor(`document.querySelector('#segment-details')?.innerText.includes(${quote(label)})
    && document.querySelector(${quote(`[data-segment-list] a[data-segment-id="${id}"]`)})?.innerText.includes(${quote(label)})`, `list/details sample label: ${label}`);
  if (anchor) {
    assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('#segment-details time')).some(time => Date.parse(time.dateTime) === ${Date.parse(anchor)})`), true, "Selected observations retain their fixture timestamp.");
    await page.text("Asia/Kolkata");
  } else {
    assert.equal(await page.evaluate("Array.from(document.querySelectorAll('#segment-details time')).filter(element => !element.closest('#segment-reports, [data-incident-episode]')).length"), 0, "Missing samples must not invent an observation timestamp.");
  }
  if (await page.evaluate("!!document.querySelector('[data-map-state]')")) {
    await mapState(page, "ready");
    await selected(page, id);
  }
}
async function keyboardSelect(page, id) {
  for (let tab = 0; tab < 60; tab++) {
    if (await page.evaluate(`document.activeElement.matches(${quote(`[data-segment-list] a[data-segment-id="${id}"]`)})`)) break;
    await page.key("Tab", "Tab", 9);
  }
  assert.equal(await page.evaluate(`document.activeElement.matches(${quote(`[data-segment-list] a[data-segment-id="${id}"]`)})`), true, "Segment links must be reachable with Tab.");
  await page.key("Enter", "Enter", 13);
  await selected(page, id);
}
async function waitUntil(predicate, description, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    checkCancelled();
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}
async function refresh(page) {
  const previousRead = await page.evaluate(`document.querySelector(${quote(readySelector)})?.querySelectorAll('time')[1]?.dateTime ?? null`);
  const start = page.requests.length;
  await page.click("[data-refresh-traffic]");
  await waitUntil(() => page.requests.slice(start).some(request => new URL(request.url).origin === base
    && new URL(request.url).pathname === "/traffic" && request.status === 200), "traffic refresh response received");
  await page.waitFor("document.querySelector('[data-refresh-traffic]')?.disabled === false", "traffic refresh settled");
  if (previousRead) await page.waitFor(`(document.querySelector(${quote(readySelector)})?.querySelectorAll('time')[1]?.dateTime ?? null) !== ${quote(previousRead)}`, "new snapshot timestamp or explicit non-ready state");
}
async function scenario(page, value) {
  await page.waitFor(`document.querySelector(${quote(readySelector)})?.innerText.toLowerCase().includes(${quote(value)})`, `visible ${value} scenario`);
}
async function mapState(page, state) {
  try {
    if (state === "ready") {
      await page.waitFor("['ready', 'failed'].includes(document.querySelector('[data-map-state]')?.dataset.mapState)", "map attempt settles", 60000);
      if (await page.evaluate("document.querySelector('[data-map-state]')?.dataset.mapState === 'failed'")) {
        assert.ok(await page.evaluate("document.querySelectorAll('[data-segment-list] [data-segment-id]').length > 0"), "Failed external maps preserve usable segment selection.");
        console.log(`RETRY ${base} ${page.width}px: one explicit user retry after map failure (${await page.evaluate("document.querySelector('[data-map-state]')?.dataset.mapFailure")})`);
        await page.button("Retry map");
      }
    }
    await page.waitFor(`document.querySelector('[data-map-state]')?.dataset.mapState === ${quote(state)}`, `map ${state}`, 60000);
  } catch (error) {
    const failures = page.requests.filter(request => isProvider(request.url) && (request.failed || request.status >= 400))
      .map(request => ({ url: request.url, status: request.status, error: request.error, blocked: request.blocked }));
    throw new Error(`${error.message}; map state: ${await page.evaluate("document.querySelector('[data-map-state]')?.dataset.mapState")}; reason: ${await page.evaluate("document.querySelector('[data-map-state]')?.dataset.mapFailure")}; public provider failures: ${JSON.stringify(failures)}`, { cause: error });
  }
  assert.equal(await page.evaluate("window.__trafficProbe.mapStates.includes('loading')"), true, "Map attempts must expose a loading state.");
}
async function loadMap(page) {
  page.mapConsent = true;
  const hasButton = await page.evaluate("!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Load map'))");
  if (hasButton) {
    await page.button("Load map");
  }
}
async function providerEvidence(page, start) {
  await mapState(page, "ready");
  const end = Date.now() + 60000;
  let style;
  let tile;
  while (Date.now() < end) {
    checkCancelled();
    const completed = page.requests.slice(start).filter(request => request.completed && request.status === 200 && !request.cached);
    style = completed.find(request => isProvider(request.url) && new URL(request.url).pathname === "/styles/liberty");
    tile = completed.find(request => isTile(request.url));
    if (style && tile) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(style, "Real provider style must finish with HTTP 200, not merely start or come from cache.");
  assert.ok(tile, "A real provider tile must finish with HTTP 200, not merely a style/TileJSON request.");
  assert.ok(page.requests.some(request => request.completed && request.status === 200 && new URL(request.url).origin === base && /\.js(?:\?|$)/.test(request.url)), "Application JavaScript must load from the first-party app.");
  assert.equal(await page.evaluate("Array.from(document.querySelectorAll('[data-map-state] canvas')).some(canvas => canvas.width > 0 && canvas.height > 0)"), true, "A real map canvas must be rendered.");
  for (const attribution of ["OpenFreeMap", "OpenMapTiles", "OpenStreetMap"]) await page.text(attribution);
  console.log(`PASS ${page.width}px: first-party application JS and map canvas; HTTP 200/loadingFinished style=${style.url} tile=${tile.url}`);
  return `${new URL(tile.url).origin}${new URL(tile.url).pathname.replace(/\/\d+\/\d+\/\d+(\.(?:pbf|mvt|png|webp))?$/, '/*/*/*$1')}*`;
}

async function rpc(name, body = {}) {
  checkCancelled();
  const response = await fetch(`${status.API_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `Local traffic RPC ${name} failed (${response.status}); inspect local state before retrying.`);
  const bodyText = await response.text();
  return bodyText ? JSON.parse(bodyText) : null;
}
async function snapshot() {
  const result = await rpc("read_traffic_demo");
  assert.ok(result && Number.isFinite(Date.parse(result.read_at)) && Object.hasOwn(result, "fixture"), "Snapshot RPC must return {read_at, fixture}.");
  assert.ok(result.fixture === null || result.fixture?.corridor?.id === fixture.corridor.id, "Only the owned synthetic corridor may be restored.");
  return result;
}
async function replace(value) {
  restoreFixture = true;
  if (value === null) await rpc("reset_traffic_demo");
  else {
    const result = await rpc("replace_traffic_demo", { p_fixture: value });
    assert.equal(result.observations, value.observations.length, "Fixture replacement must report the full sample count.");
  }
}
async function fault(mode) {
  const response = await fetch("http://127.0.0.1:54323/__test_fault", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }), signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, "Isolated fault proxy control must succeed.");
  assert.equal((await response.json()).mode, mode);
}

async function publicNavigation(page) {
  await page.go("/");
  await page.text("Traffic information, with its limits in view");
  await layout(page);
  await page.click('main a[href="/demo"]');
  await page.route("/demo");
  await page.text("Explore TrafficSense as a guest");
  await layout(page);
  await page.click('main a[href="/traffic"]');
  await page.route("/traffic");
  await page.text("Synthetic traffic corridor");
}
async function dataScenarios(page) {
  await selectList(page, primaryId);
  for (const value of ["normal", "recovery", "slowdown"]) {
    await replace(createTrafficFixture(value, DEFAULT_DEMO_ANCHOR));
    await refresh(page);
    await scenario(page, value);
    await selected(page, primaryId);
    await samples(page, primaryId, "Stale synthetic samples", DEFAULT_DEMO_ANCHOR);
    await screenshot(page, value);
  }
  const { read_at: readAt } = await snapshot();
  const futureAnchor = new Date(Date.parse(readAt) + 24 * 60 * 60 * 1000).toISOString();
  await replace(createTrafficFixture("slowdown", futureAnchor));
  await refresh(page);
  await selected(page, primaryId);
  await samples(page, primaryId, "Future-dated samples", futureAnchor);
  await page.evaluate("window.__restoreTrafficNow = Date.now; Date.now = () => window.__restoreTrafficNow() + 24 * 60 * 60 * 1000 + 5 * 60000; window.dispatchEvent(new Event('focus'))");
  try {
    await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await samples(page, primaryId, "Future-dated samples", futureAnchor);
  } finally { await page.evaluate("Date.now = window.__restoreTrafficNow; delete window.__restoreTrafficNow"); }
  await screenshot(page, "future");
  const noSamples = structuredClone(fixture);
  noSamples.observations = noSamples.observations.filter(sample => sample.segment_id !== primaryId);
  await replace(noSamples);
  await refresh(page);
  await selected(page, primaryId);
  await samples(page, primaryId, "No samples", null);
  await selectList(page, secondId);
  assert.equal(await page.evaluate("document.querySelector('#segment-details').innerText.includes('No samples')"), false, "Other segments retain their samples.");
  await selectList(page, primaryId);
  await screenshot(page, "no-samples");
  await replace(null);
  await refresh(page);
  await page.text("No synthetic traffic data");
  assert.equal(await page.evaluate(`document.querySelectorAll(${quote(listSelector)}).length`), 0, "Empty data must remove stale segment links.");
  assert.equal(await page.evaluate("!!document.querySelector('#segment-details[data-segment-id]')"), false, "Empty data must remove stale details.");
  await layout(page);
  await screenshot(page, "empty");
  await replace(fixture);
  await refresh(page);
  await ready(page);
  await selected(page, primaryId);
  await scenario(page, "slowdown");
  await samples(page, primaryId, "Stale synthetic samples", DEFAULT_DEMO_ANCHOR);
}
async function happyPath(page) {
  await publicNavigation(page);
  await ready(page);
  await scenario(page, "slowdown");
  await page.text("Stale synthetic samples");
  await layout(page);
  await screenshot(page, "list");
  assert.equal(page.requests.filter(request => isProvider(request.url)).length, 0, "Home, demo and unloaded traffic must make no provider calls.");
  await selectList(page, primaryId);
  await samples(page, primaryId, "Stale synthetic samples", DEFAULT_DEMO_ANCHOR);
  await keyboardSelect(page, secondId);
  const history = await page.call("Page.getNavigationHistory");
  const secondEntry = history.entries[history.currentIndex];
  await selectList(page, markerId);
  const next = await page.call("Page.getNavigationHistory");
  const markerEntry = next.entries[next.currentIndex];
  assert.notEqual(secondEntry.id, markerEntry.id, "Selection must push history rather than replace it.");
  await page.call("Page.navigateToHistoryEntry", { entryId: secondEntry.id });
  await selected(page, secondId);
  await page.call("Page.navigateToHistoryEntry", { entryId: markerEntry.id });
  await selected(page, markerId);
  await page.reload();
  await ready(page);
  await selected(page, markerId);
  await refresh(page);
  await selected(page, markerId);
  await page.go("/traffic?segment=unknown-segment");
  await ready(page);
  await page.text("Segment not found");
  assert.equal(await page.evaluate("new URL(location.href).searchParams.get('segment')"), "unknown-segment");
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll(${quote(listSelector)})).some(link => link.hasAttribute('aria-current') && link.getAttribute('aria-current') !== 'false')`), false, "Unknown IDs must not silently select another segment.");
  await selectList(page, primaryId);
  const start = page.requests.length;
  await loadMap(page);
  const tileBlock = await providerEvidence(page, start);
  await page.click(`[data-map-segment="${markerId}"]`);
  await selected(page, markerId);
  await selectList(page, secondId);
  await page.click(`[data-map-segment="${primaryId}"]`);
  await selected(page, primaryId);
  await layout(page);
  await screenshot(page, "map");
  const mapHistory = await page.call("Page.getNavigationHistory");
  const primaryEntry = mapHistory.entries[mapHistory.currentIndex];
  await selectList(page, "primary-west-inbound");
  await page.text("Separate opposite-direction segment");
  await screenshot(page, "opposite-direction");
  await page.call("Page.navigateToHistoryEntry", { entryId: primaryEntry.id });
  await selected(page, primaryId);
  await page.button("Hide map");
  page.mapConsent = false;
  await page.waitFor("!document.querySelector('[data-map-state]') && !document.querySelector('[data-map-segment]')", "map resources removed after hide");
  await selectList(page, secondId);
  const reloadStart = page.requests.length;
  await loadMap(page);
  await providerEvidence(page, reloadStart);
  await selected(page, secondId);
  await refresh(page);
  await mapState(page, "ready");
  await selected(page, secondId);
  await page.evaluate(`window.__geometryCanvas = document.querySelector('.maplibregl-canvas'); window.__geometryMarker = document.querySelector('[data-map-segment="${secondId}"]'); window.__geometryPosition = window.__geometryMarker.getBoundingClientRect().y`);
  const moved = structuredClone(fixture);
  for (const segment of moved.segments) segment.geometry.coordinates = segment.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude + 0.001]);
  await replace(moved); await refresh(page); await mapState(page, "ready");
  await selected(page, secondId);
  await page.waitFor(`!window.__geometryCanvas.isConnected && !window.__geometryMarker.isConnected
    && window.__geometryCanvas !== document.querySelector('.maplibregl-canvas')
    && Math.abs(document.querySelector('[data-map-segment="${secondId}"]').getBoundingClientRect().y - window.__geometryPosition) > 1
    && document.querySelector('[data-map-segment="${secondId}"]').getAttribute('aria-pressed') === 'true'`, "geometry replacement disposes old rendering and moves the selected marker");
  await screenshot(page, "geometry-replacement");
  await replace(fixture); await refresh(page); await mapState(page, "ready"); await selected(page, secondId);
  await page.button("Hide map");
  page.mapConsent = false;
  await dataScenarios(page);
  console.log(`PASS ${base} ${page.width}px: guest navigation, keyboard/list/marker selection, URL/history/reload/refresh, stale/future/missing samples and reset/recovery`);
  return tileBlock;
}
async function blockedMap(page, kind, pattern) {
  await page.go(`/traffic?segment=${secondId}`);
  await ready(page);
  await selected(page, secondId);
  await page.block([pattern]);
  const start = page.requests.length;
  await loadMap(page);
  await mapState(page, "failed");
  assert.ok(page.requests.slice(start).some(request => request.failed && request.blocked === "inspector" && (kind === "tile" ? isTile(request.url) : isProvider(request.url) && new URL(request.url).pathname.startsWith("/styles/"))), `CDP must actually block the ${kind} request.`);
  await selected(page, secondId);
  await selectList(page, primaryId);
  await layout(page);
  await screenshot(page, `${kind}-failed`);
  await page.block([]);
  const retryStart = page.requests.length;
  await page.button("Retry map");
  await providerEvidence(page, retryStart);
  await selected(page, primaryId);
  await page.click(`[data-map-segment="${markerId}"]`);
  await selected(page, markerId);
  await layout(page);
  await screenshot(page, `${kind}-recovered`);
  console.log(`PASS ${page.width}px: blocked ${kind}, usable list/details and real provider Retry map recovery`);
}
async function noWebGL(page) {
  await page.go(`/traffic?segment=${primaryId}`);
  await ready(page);
  await loadMap(page);
  await mapState(page, "failed");
  assert.ok(await page.evaluate("window.__trafficProbe.webglAttempts > 0"), "Map must actually attempt a patched WebGL context.");
  await selected(page, primaryId);
  await keyboardSelect(page, secondId);
  const attempts = await page.evaluate("window.__trafficProbe.webglAttempts");
  await page.button("Retry map");
  await page.waitFor(`window.__trafficProbe.webglAttempts > ${attempts}`, "Retry map attempts WebGL again");
  await mapState(page, "failed");
  await selected(page, secondId);
  await layout(page);
  await screenshot(page, "no-webgl");
}
async function backendFaults(page) {
  await page.go(`/traffic?segment=${primaryId}`);
  await ready(page);
  await fault("database");
  try {
    await refresh(page);
    await page.text("Traffic data is unavailable");
    assert.equal(await page.evaluate(`!!document.querySelector(${quote(readySelector)})`), false, "An outage must not retain a healthy snapshot.");
    assert.equal(await page.evaluate("document.body.innerText.includes('No synthetic traffic data')"), false, "Backend outage is not empty data.");
    await layout(page);
    await screenshot(page, "backend-unavailable");
  } finally {
    await fault("healthy");
  }
  await refresh(page);
  await ready(page);
  await selected(page, primaryId);
  await fault("auth");
  try {
    await page.reload();
    await ready(page);
    await selected(page, primaryId);
    await page.click('main a[href="/demo"]');
    await page.text("Explore TrafficSense as a guest");
    await page.click('main a[href="/traffic"]');
    await ready(page);
  } finally {
    await fault("healthy");
  }
  console.log(`PASS ${page.width}px: real isolated database outage/healthy refresh and public traffic during Auth outage`);
}
async function signedInNavigation(page, account) {
  await page.go("/login");
  await page.text("Welcome back");
  await page.click("#email");
  await page.call("Input.insertText", { text: account.email });
  await page.click("#password");
  await page.call("Input.insertText", { text: account.password });
  await page.click('button[type="submit"]');
  await page.route("/workspace");
  await page.waitFor(`document.body?.innerText.includes(${quote(account.email)})`, "signed-in workspace");
  const before = (await page.cookies()).map(({ name, value }) => ({ name, value }));
  assert.ok(before.length > 0, "UI sign-in must create a session.");
  await publicNavigation(page);
  await ready(page);
  await selectList(page, secondId);
  await page.reload();
  await selected(page, secondId);
  await refresh(page);
  await selected(page, secondId);
  const after = (await page.cookies()).map(({ name, value }) => ({ name, value }));
  assert.ok(JSON.stringify(after) === JSON.stringify(before), "Public traffic must preserve the signed-in session without creating/replacing auth cookies.");
  await page.go("/workspace");
  await page.waitFor(`document.body?.innerText.includes(${quote(account.email)})`, "same account after traffic browsing");
  await layout(page);
  await page.click('button[type="submit"]');
  await page.route("/login");
  assert.equal((await page.cookies()).length, 0, "UI logout must clear the temporary browser session.");
  console.log(`PASS ${page.width}px: existing local account UI login, home/demo/traffic, reload/refresh and workspace session preservation`);
}
async function setup(page) {
  await publicNavigation(page);
  await page.text("Traffic data is not configured");
  assert.equal(await page.evaluate(`!!document.querySelector(${quote(readySelector)})`), false);
  assert.equal(await page.evaluate(`document.querySelectorAll(${quote(listSelector)}).length`), 0);
  await refresh(page);
  await page.text("Traffic data is not configured");
  await layout(page);
  await screenshot(page, "unconfigured");
  await page.click('main a[href="/demo"]');
  await page.text("Explore TrafficSense as a guest");
  await page.click('header a[href="/"]');
  await page.text("Traffic information, with its limits in view");
  assert.equal(page.requests.filter(request => isProvider(request.url)).length, 0, "Unconfigured navigation must not contact the map provider.");
  console.log(`PASS ${base} ${page.width}px: unconfigured traffic, refresh, demo/home recovery and guest privacy; no DB/status input`);
}

let failure;
try {
  const endpointResponse = await fetch(`${debuggerUrl}/json/version`, { signal: AbortSignal.timeout(5000) });
  assert.ok(endpointResponse.ok, "Local Chromium debugger must be available.");
  const endpoint = await endpointResponse.json();
  socket = new WebSocket(endpoint.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chromium connection timed out.")), 10000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error("Chromium connection failed.")); };
  });
  socket.onmessage = receive;
  if (setupOnly) {
    for (const [width, height] of viewports) await withPage(width, height, {}, async page => {
      await setup(page);
      if (reportSuite) {
        await page.go("/reports/new");
        await page.text("Reporting is not configured");
        await page.button("Refresh traffic data");
        await page.text("Reporting is not configured");
        await layout(page);
      }
    });
  } else {
    // Missing UI fails before reading credentials or changing the shared fixture/proxy.
    await withPage(1440, 1000, {}, async page => {
      await page.go("/traffic");
      await page.text("Synthetic traffic corridor");
    });
    let account;
    if (!evidenceSuite && !slowdownSuite && !phase4Suite && !routeAlertsSuite) {
      const accounts = JSON.parse(await readFile("supabase/.temp/demo-accounts.json", "utf8"));
      account = accounts.find(item => item.label === "commuter");
      assert.ok(account?.email && account?.password, "Seeded local commuter account is required.");
    }
    status = await readLocalStatus();
    const original = await snapshot();
    previous = original.fixture;
    const readAt = original.read_at;
    assert.ok(Date.parse(readAt) - Date.parse(DEFAULT_DEMO_ANCHOR) > 20 * 60 * 1000, "The fixed demo anchor must actually be stale against the database read clock.");
    if (testFaults) {
      restoreFaults = true;
      await fault("healthy");
    }
    await replace(fixture);
    if (reportSuite) {
      const { runReportScenarios } = await import("./reports-browser-scenarios.mjs");
      await runReportScenarios({ base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList, loadMap, mapState, refresh, replace, fixture, fault, testFaults });
    }
    if (evidenceSuite) {
      const { runEvidenceScenarios } = await import("./evidence-browser-scenarios.mjs");
      await runEvidenceScenarios({ base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList, loadMap, mapState, providerEvidence, refresh, screenshot, fixture });
    }
    if (routeAlertsSuite) {
      const { runRouteAlertScenarios } = await import("./route-alerts-browser-scenarios.mjs");
      await runRouteAlertScenarios({ base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready,
        selected, selectList, keyboardSelect, loadMap, mapState, providerEvidence, refresh, screenshot, fixture, snapshot, replace });
    } else if (phase4Suite) {
      const { runPhase4Scenarios } = await import("./phase4-browser-scenarios.mjs");
      await runPhase4Scenarios({ base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready,
        selected, selectList, keyboardSelect, loadMap, mapState, providerEvidence, refresh, screenshot, fixture, snapshot, replace });
    } else if (slowdownSuite) {
      const { runSlowdownScenarios } = await import("./slowdown-browser-scenarios.mjs");
      await runSlowdownScenarios({ base, status, viewports, withPage, createPage, disposePage, privacy, layout, ready, selected, selectList, keyboardSelect, loadMap, mapState, providerEvidence, refresh, screenshot, fixture, snapshot, replace });
    }
    for (const [width, height] of reportSuite || evidenceSuite || slowdownSuite || phase4Suite || routeAlertsSuite ? [] : viewports) {
      let tileBlock;
      await withPage(width, height, {}, async page => { tileBlock = await happyPath(page); });
      await withPage(width, height, {}, page => blockedMap(page, "style", "*://tiles.openfreemap.org/styles/*"));
      await withPage(width, height, {}, page => blockedMap(page, "tile", tileBlock));
      await withPage(width, height, { noWebGL: true }, noWebGL);
      // A fresh context restores native canvas behavior, rather than undoing a live map's patch.
      await withPage(width, height, {}, async page => {
        await page.go(`/traffic?segment=${primaryId}`);
        await ready(page);
        const start = page.requests.length;
        await loadMap(page);
        await providerEvidence(page, start);
        await selected(page, primaryId);
      });
      if (testFaults) await withPage(width, height, {}, backendFaults);
      await withPage(width, height, { signedIn: true }, page => signedInNavigation(page, account));
    }
  }
  assert.deepEqual(instrumentationErrors, [], "All worker network instrumentation must succeed.");
  assert.deepEqual(diagnostics, [], "No Next.js navigation/prerender/hydration diagnostics are allowed.");
  assert.deepEqual(exceptions, [], "No runtime exceptions are suppressed, including healthy pages and handled failures.");
} catch (error) {
  failure = error;
} finally {
  cleaning = true;
  const cleanupErrors = [];
  async function cleanup(label, action) {
    try { await action(); } catch { cleanupErrors.push(label); }
  }
  if (restoreFaults) await cleanup("Fault proxy could not be restored to healthy.", () => fault("healthy"));
  for (const page of pages) await cleanup("Browser context could not be disposed.", () => disposePage(page));
  if (restoreFixture) await cleanup("Previous traffic fixture could not be restored; inspect local traffic state before another run.", async () => {
    await replace(previous);
    assert.deepEqual((await snapshot()).fixture, previous, "Restore must preserve the original fixture or original null exactly.");
  });
  if (socket) socket.close();
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error("Browser connection closed during cleanup."));
  }
  pending.clear();
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  if (cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors.map(message => new Error(message))], "Traffic browser cleanup was incomplete.");
}
if (failure) throw failure;
console.log(`PASS: sequential traffic browser checks; ${setupOnly ? "no fixture or proxy touched" : "previous fixture/null restored and verified"}; all contexts disposed; no geolocation, unexpected auth cookies or runtime/Next diagnostics`);
