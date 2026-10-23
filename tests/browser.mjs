import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRecoveryFixtures } from "./auth-recovery-fixtures.mjs";
import { waitForSignedExpiry } from "./auth-expiry.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const debuggerUrl = process.env.CHROMIUM_DEBUG_URL || "http://127.0.0.1:9333";
const uiOnly = process.env.BROWSER_SCENARIO === "ui";
const setupOnly = process.env.BROWSER_SCENARIO === "setup";
const recoveryOnly = process.env.BROWSER_SCENARIO === "recovery";
const expiryOnly = process.env.BROWSER_SCENARIO === "expiry";
if (expiryOnly) assert.ok(["http://127.0.0.1:3000", "http://127.0.0.1:3001"].includes(base), "Expiry tests require the local app.");
if (recoveryOnly) assert.ok(["http://127.0.0.1:3002", "http://127.0.0.1:3003"].includes(base), "Recovery tests require the isolated local test app.");
const accounts = uiOnly || setupOnly || recoveryOnly ? [] : JSON.parse(await readFile("supabase/.temp/demo-accounts.json", "utf8"));
async function fault(mode) {
  const response = await fetch("http://127.0.0.1:54323/__test_fault", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }), signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, "local fault proxy control failed");
  assert.equal((await response.json()).mode, mode);
}
const endpoint = await (await fetch(`${debuggerUrl}/json/version`)).json();
const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
const exceptions = [];
const navigationIssues = [];
const expectedFailures = new Map();
const documentContexts = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.executionContextCreated" && message.params.context.auxData?.isDefault) {
    documentContexts.set(message.sessionId, `${message.sessionId}:${message.params.context.id}`);
  }
  if (message.method === "Runtime.executionContextsCleared") documentContexts.delete(message.sessionId);
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    exceptions.push({
      report: details.exception?.description || details.text,
      context: `${message.sessionId}:${details.executionContextId}`,
    });
  }
  if (message.method === "Runtime.consoleAPICalled") {
    const details = message.params.args.map(arg => arg.value || arg.description || "").join(" ");
    for (const diagnostic of ["uncached data during prerendering or a navigation", "Could not validate `instant`", "encountered the unstable value"]) {
      if (details.includes(diagnostic)) navigationIssues.push(diagnostic);
    }
  }
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  clearTimeout(item.timer);
  if (message.error) item.reject(new Error(JSON.stringify(message.error)));
  else item.resolve(message.result);
};
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
let context;
let fixtures;
try {
  ({ browserContextId: context } = await send("Target.createBrowserContext"));
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId: context });
  let { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const value = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  async function waitFor(expression, description = expression) {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      try { if (await evaluate(expression)) return; } catch { /* A navigation may replace the execution context. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await mkdir("supabase/.temp/browser", { recursive: true });
    const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("supabase/.temp/browser/failure.png", Buffer.from(shot.data, "base64"));
    throw new Error(`Timed out: ${description}; route: ${await evaluate("location.pathname")}`);
  }
  const text = (value) => waitFor(`document.body?.innerText.includes(${JSON.stringify(value)})`, `page text: ${value}`);
  const route = (value) => waitFor(`location.pathname === ${JSON.stringify(value)}`, `route: ${value}`);
  async function navigate(action) {
    const marker = crypto.randomUUID();
    await evaluate(`window.__navigationMarker = ${JSON.stringify(marker)}`);
    const result = await action();
    assert.ok(!result.errorText, result.errorText);
    await waitFor(`window.__navigationMarker !== ${JSON.stringify(marker)} && document.readyState !== 'loading'`, "new document ready");
  }
  const go = (path) => navigate(() => call("Page.navigate", { url: `${base}${path}` }));
  const reload = () => navigate(() => call("Page.reload"));
  async function click(selector) {
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, `element: ${selector}`);
    const rect = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await call("Input.dispatchMouseEvent", { type: "mousePressed", ...rect, button: "left", clickCount: 1 });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...rect, button: "left", clickCount: 1 });
  }
  async function fill(selector, value) {
    await click(selector);
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await call("Input.insertText", { text: value });
  }
  async function key(key, code, windowsVirtualKeyCode) {
    await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, ...(key === "Enter" ? { text: "\r" } : {}) });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
  }
  async function login(label, keyboard = false) {
    const account = accounts.find((item) => item.label === label);
    await go("/login"); await text("Welcome back");
    if (keyboard) {
      for (let tab = 0; tab < 8 && await evaluate("document.activeElement.id !== 'email'"); tab++) await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.id"), "email");
      await call("Input.insertText", { text: account.email });
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.id"), "password");
      await call("Input.insertText", { text: account.password });
      await key("Enter", "Enter", 13);
    } else {
      await fill("#email", account.email); await fill("#password", account.password);
      await click('button[type="submit"]');
    }
    await route("/workspace"); await text(account.email); await layout(); await snapshot(`workspace-${label}`);
    return account;
  }
  async function logout() {
    await go("/workspace"); await text("Account workspace");
    await click('button[type="submit"]');
    await route("/login"); await text("Welcome back");
  }
  async function layout() {
    await evaluate("document.fonts.ready");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "horizontal overflow");
    const smallControls = await evaluate(`Array.from(document.querySelectorAll('header a, main a, main button, main input')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.height < 44 || rect.width < 44);
    }).map(el => el.tagName + ':' + (el.getAttribute('href') || el.getAttribute('type') || 'control'))`);
    assert.deepEqual(smallControls, [], "interactive targets must be at least 44px");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.organisation-list a')).every(link => Math.abs(link.getBoundingClientRect().width - link.parentElement.getBoundingClientRect().width) < 1)"), true, "organisation links must fill their list rows");
    const lowContrast = await evaluate(`(() => {
      const rgb = value => (value.match(/[\\d.]+/g) || []).map(Number);
      const luminance = color => color.slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
      return Array.from(document.querySelectorAll('h1, h2, h3, p, a, button, input, code, dt, dd, li, label, figcaption, .simulated-pill, .illustration-label')).filter(el => {
        if (!el.getBoundingClientRect().width || el.disabled || el.closest('.skip-link')) return false;
        let background = [255, 255, 255];
        const parents = [];
        for (let parent = el; parent; parent = parent.parentElement) parents.unshift(parent);
        for (const parent of parents) {
          const color = rgb(getComputedStyle(parent).backgroundColor);
          const alpha = color[3] ?? 1;
          background = background.map((value, index) => color[index] * alpha + value * (1 - alpha));
        }
        const style = getComputedStyle(el);
        const lightness = [luminance(rgb(style.color)), luminance(background)].sort((a, b) => a - b);
        const ratio = (lightness[1] + 0.05) / (lightness[0] + 0.05);
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        return !Number.isFinite(ratio) || ratio < (large ? 3 : 4.5);
      }).map(el => el.tagName + ':' + el.className);
    })()`);
    assert.deepEqual(lowContrast, [], "visible text must meet WCAG AA contrast");
  }
  async function homepage() {
    await text("Traffic information, with its limits in view");
    await text("Choose how to explore");
    await text("Illustration only");
    await text("Delay receipts — planned extension");
    assert.equal(await evaluate("document.querySelectorAll('[data-feature]').length"), 3);
    assert.equal(await evaluate("document.querySelectorAll('[data-role]').length"), 3);
    assert.equal(await evaluate("!!document.querySelector('a[href=\"#\"]')"), false, "no placeholder links");
    assert.equal(await evaluate("document.querySelector('meta[name=description]').content.includes('prove delays')"), false, "metadata must not overclaim functionality");
    await evaluate("document.fonts.ready");
    const fonts = await evaluate(`Array.from(document.fonts).filter(font => font.status === 'loaded').map(font => font.family.replaceAll('"', ''))`);
    for (const name of ["Inter", "Plus Jakarta Sans", "JetBrains Mono"]) assert.ok(fonts.includes(name), `${name} must load`);
    assert.deepEqual(await evaluate("performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin !== location.origin).map(entry => new URL(entry.name).origin)"), [], "preview assets must be served locally");
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await waitFor("matchMedia('(prefers-reduced-motion: reduce)').matches && getComputedStyle(document.querySelector('.button')).transitionDuration === '0s'", "reduced-motion styles applied");
    await call("Emulation.setEmulatedMedia", { features: [] });
    await snapshot("home");
  }
  async function snapshot(label) {
    await mkdir("supabase/.temp/browser", { recursive: true });
    const width = await evaluate("innerWidth");
    const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(`supabase/.temp/browser/${new URL(base).port}-${width}-${label}.png`, Buffer.from(shot.data, "base64"));
  }
  const sessionCookies = async () => (await call("Network.getCookies", { urls: [base] })).cookies
    .filter((cookie) => /^trafficsense-auth(?:\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  async function readSession() {
    const value = (await sessionCookies()).map(cookie => cookie.value).join("");
    assert.ok(value.startsWith("base64-"));
    return JSON.parse(Buffer.from(value.slice(7), "base64url").toString());
  }
  async function writeSession(session) {
    for (const cookie of await sessionCookies()) await call("Network.deleteCookies", { name: cookie.name, url: base });
    const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
    for (let offset = 0; offset < encoded.length; offset += 3000) {
      const result = await call("Network.setCookie", { name: `trafficsense-auth.${offset / 3000}`, value: encoded.slice(offset, offset + 3000), url: base, path: "/", httpOnly: true, sameSite: "Lax" });
      assert.equal(result.success, true);
    }
  }
  async function rewriteSession(change) {
    const session = await readSession();
    change(session);
    await writeSession(session);
  }
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  if (recoveryOnly) {
    await fault("healthy");
    fixtures = await createRecoveryFixtures();
    accounts.push(...fixtures.accounts);
  }
  const viewports = uiOnly ? [[1440, 1000, false], [1024, 900, false], [768, 1024, true], [390, 844, true], [320, 740, true]] : [[1440, 1000, false], [390, 844, true]];
  for (const [width, height, mobile] of viewports) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, mobile, deviceScaleFactor: 1 });
    await go("/"); await text("Understand the disruption"); await homepage(); await layout();
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate("document.activeElement.textContent"), "Skip to content");
    await key("Enter", "Enter", 13);
    assert.equal(await evaluate("document.activeElement.id"), "main", "skip link must move keyboard focus into content");
    assert.equal(await evaluate("!!document.querySelector('main a[href=\"/demo\"]')"), true, "homepage must offer guest access");
    const guestCookies = (await sessionCookies()).map(cookie => cookie.value);
    await click('main a[href="/demo"]'); await route("/demo"); await text("Explore TrafficSense as a guest"); await layout();
    assert.equal(await evaluate("document.querySelector('form') === null"), true, "guest browsing must not require an account form");
    assert.deepEqual((await sessionCookies()).map(cookie => cookie.value), guestCookies, "guest browsing must not create or replace an auth session");
    await snapshot("guest");
    await click('header a[href="/"]'); await text("Understand the disruption");
    if (uiOnly) {
      for (const path of ["/employer", "/authority"]) {
        await click(`main a[href="${path}"]`); await route("/login"); await text("Welcome back"); await layout();
        await click('header a[href="/"]'); await text("Understand the disruption");
      }
      await click('main a[href="/register"]'); await text("Create your account"); await layout();
      await click('main a[href="/demo"]'); await text("Explore TrafficSense as a guest");
      await go("/not-a-route"); await text("Page not found"); await layout();
      await click('header a[href="/"]'); await text("Understand the disruption");
      assert.equal((await sessionCookies()).length, 0, "preview navigation must not create a session");
      console.log(`PASS ${base} ${width}px: homepage, fonts, preview, protected role links, registration navigation, 404 and 44px controls`);
      continue;
    }
    await click('main a[href="/login"]');
    if (setupOnly) {
      await text("Authentication is not configured"); await layout();
      assert.equal(await evaluate("document.querySelector('form') === null"), true);
      await click('main a[href="/"]'); await text("Understand the disruption");
      await click('main a[href="/register"]'); await text("Authentication is not configured"); await layout();
      for (const path of ["/workspace", "/employer", "/employer/10000000-0000-4000-8000-000000000001", "/authority", "/admin"]) {
        await go(path); await text("Account access could not be loaded"); await layout();
        const context = documentContexts.get(sessionId);
        assert.ok(context, "the unconfigured document must have a browser execution context");
        expectedFailures.set(context, "Authentication is not configured.");
        await click('header a[href="/demo"]'); await text("Explore TrafficSense as a guest");
      }
      assert.equal((await sessionCookies()).length, 0, "Unconfigured browsing must not create a session");
      console.log(`PASS ${base} ${width}px: public navigation, unconfigured login/register and protected routes`);
      continue;
    }
    if (expiryOnly) {
      const account = await login("commuter");
      const original = await readSession();
      await waitForSignedExpiry(original, account);
      assert.ok((await readSession()).access_token === original.access_token, "No browser refresh may replace the token during the expiry wait");
      await reload(); await route("/workspace"); await text(account.email);
      const refreshed = await readSession();
      assert.ok(refreshed.access_token !== original.access_token, "Expired signed token must be refreshed");
      assert.ok(refreshed.expires_at > Date.now() / 1000);
      await writeSession({ ...original, refresh_token: "invalid-refresh-token" });
      await go("/workspace"); await route("/login"); await text("Welcome back");
      assert.ok((await sessionCookies()).every(cookie => cookie.value === ""), "Expired token with invalid refresh must remove stored session contents");
      await writeSession(refreshed);
      await go("/workspace"); await text(account.email);
      await rewriteSession(session => { session.access_token = original.access_token; session.expires_at = original.expires_at; });
      await click('button[type="submit"]'); await route("/login"); await text("Welcome back");
      assert.equal(await evaluate("location.search"), "", "Logout must confirm revocation after recovering the expired session");
      assert.equal((await sessionCookies()).length, 0, "Logout with an expired signed token must not restore cookies");
      await go("/workspace"); await route("/login");
      console.log(`PASS ${base} ${width}px: unchanged Auth-issued signed-token expiry, backend denial, browser refresh, invalid refresh and logout`);
      continue;
    }
    if (recoveryOnly) {
      const errorPage = async (email) => {
        await text("Account access could not be loaded"); await layout(); await snapshot("error");
        for (const value of [email, fixtures.orgName]) assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(value)})`), false, "error page must not show private account data");
      };
      const unavailable = async (action, email, expectedError) => {
        await action();
        await errorPage(email);
        // Attribute delayed React reports to the failed document, not an arrival-time window.
        const context = documentContexts.get(sessionId);
        assert.ok(context, "the failed document must have a browser execution context");
        expectedFailures.set(context, expectedError);
      };
      const employer = await login("recovery-employer");
      await go(`/employer/${fixtures.orgId}`); await text(fixtures.orgName);
      await fixtures.removeMembership();
      await reload(); await text("Page not found");
      await go("/employer"); await text("No organisation memberships");
      await fixtures.restoreMembership();
      await reload(); await text(fixtures.orgName);
      await fixtures.setEmployerRole("commuter");
      await reload(); await route("/access-denied");
      await go("/workspace"); await text(employer.email); await text("commuter");
      await go(`/employer/${fixtures.orgId}`); await route("/access-denied");
      await fixtures.setEmployerRole("employer");
      await go("/employer"); await text(fixtures.orgName);
      assert.ok((await sessionCookies()).length > 0, "permission changes must be evaluated within the existing session");
      await logout();

      const commuter = await login("recovery-commuter");
      await fixtures.removeProfile();
      await unavailable(reload, commuter.email, "Account access unavailable.");
      await unavailable(reload, commuter.email, "Account access unavailable.");
      await fixtures.restoreProfile();
      await click(".actions > button"); await text(commuter.email);
      await fixtures.removeProfile();
      await unavailable(reload, commuter.email, "Account access unavailable.");
      await click('button[type="submit"]'); await route("/login"); await text("Welcome back");
      assert.equal((await sessionCookies()).length, 0, "missing profile must not prevent logout");
      await fixtures.restoreProfile();

      await fill("#email", commuter.email); await fill("#password", commuter.password);
      await fault("auth");
      await click('button[type="submit"]'); await text("Sign-in is unavailable. Please try again.");
      await route("/login");
      assert.equal((await sessionCookies()).length, 0, "failed sign-in must not create a session");
      await fault("healthy");
      await fill("#email", commuter.email); await fill("#password", commuter.password);
      await click('button[type="submit"]'); await route("/workspace"); await text(commuter.email);
      await call("Network.setCookie", { name: "unrelated-preference", value: "kept", url: base, path: "/" });
      await fault("auth");
      await click('button[type="submit"]'); await route("/login");
      await text("This browser is signed out. Server-side session revocation was not confirmed");
      assert.equal((await sessionCookies()).length, 0, "auth outage must not prevent clearing this browser's session");
      assert.equal((await call("Network.getCookies", { urls: [base] })).cookies.find(cookie => cookie.name === "unrelated-preference")?.value, "kept");
      await layout(); await snapshot("logout-notice");
      await fault("healthy");
      await go("/workspace"); await route("/login"); await text("Welcome back");

      await login("recovery-employer");
      for (const mode of ["database", "auth", "all"]) {
        await go("/employer"); await text(fixtures.orgName);
        await fault(mode);
        const expectedError = mode === "database" ? "Account access unavailable." : "Authentication service unavailable.";
        await unavailable(reload, employer.email, expectedError);
        await click('header a[href="/demo"]'); await text("Explore TrafficSense as a guest"); await layout();
        assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(employer.email)})`), false);
        await unavailable(() => go("/employer"), employer.email, expectedError);
        await fault("healthy");
        await click(".actions > button"); await text(fixtures.orgName);
      }
      for (const path of ["/employer", `/employer/${fixtures.orgId}`]) {
        await go(path); await text(fixtures.orgName);
        await fault("organisations");
        await unavailable(reload, employer.email, "Organisation access is unavailable.");
        await go("/workspace"); await text(employer.email);
        await unavailable(() => go(path), employer.email, "Organisation access is unavailable.");
        for (const misleading of ["No organisation memberships", "Page not found"]) {
          assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(misleading)})`), false);
        }
        await fault("healthy");
        await click(".actions > button"); await text(fixtures.orgName);
      }
      for (const [path, role, heading] of [
        ["/workspace", "employer", employer.email],
        [`/employer/${fixtures.orgId}`, "employer", fixtures.orgName],
        ["/authority", "authority", "Read-only authority account"],
        ["/admin", "admin", "Demo administration"],
      ]) {
        await fixtures.setEmployerRole(role);
        await go(path); await text(heading);
        await fault("database"); await unavailable(reload, employer.email, "Account access unavailable.");
        await fault("healthy"); await click(".actions > button"); await text(heading);
      }
      await fixtures.setEmployerRole("employer");
      for (const path of ["/login", "/register"]) {
        await fault("auth"); await unavailable(() => go(path), employer.email, "Authentication service unavailable.");
        await fault("healthy"); await click(".actions > button"); await route("/workspace"); await text(employer.email);
      }
      await logout();
      console.log(`PASS ${base} ${width}px: current-session role/membership changes, missing-profile retry/logout, failed sign-in, local logout during outage, backend error/retry recovery`);
      continue;
    }
    await text("Welcome back"); await layout();
    for (const query of ["notice=unsupported", "notice=revocation-unconfirmed&notice=unsupported"]) {
      await go(`/login?${query}`); await text("Welcome back");
      assert.equal(await evaluate("document.body.innerText.includes('Server-side session revocation was not confirmed')"), false);
    }
    for (const path of ["/login", "/register"]) {
      await go(path); await text(path === "/login" ? "Welcome back" : "Create your account");
      await click('main a[href="/demo"]'); await route("/demo"); await text("Explore TrafficSense as a guest");
      assert.equal((await sessionCookies()).length, 0);
    }
    await click('main a[href="/login"]'); await text("Welcome back");
    await mkdir("supabase/.temp/browser", { recursive: true });
    const loginShot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(`supabase/.temp/browser/${new URL(base).port}-${width}-login.png`, Buffer.from(loginShot.data, "base64"));
    await fill("#email", "invalid"); await fill("#password", "incorrect-password");
    await click('button[type="submit"]');
    assert.equal(await evaluate("document.querySelector('#email').validity.valid"), false);
    await fill("#email", accounts[0].email);
    await click('button[type="submit"]'); await text("Email or password is incorrect.");
    for (const path of ["/workspace", "/employer", "/authority", "/admin", `/employer/${accounts.find((item) => item.orgId).orgId}`]) {
      await go(path); await route("/login"); await text("Welcome back");
    }
    await click('main a[href="/register"]'); await text("Create your account");
    await fill("#email", `browser-${crypto.randomUUID()}@example.test`);
    await fill("#password", crypto.randomUUID());
    await click('button[type="submit"]'); await route("/workspace"); await text("commuter"); await layout();
    await go("/admin"); await route("/access-denied"); await text("This page is not available"); await layout();
    await logout();

    const commuter = await login("commuter", true);
    const cookies = (await call("Network.getCookies", { urls: [base] })).cookies.filter((cookie) => cookie.name.startsWith("trafficsense-auth"));
    assert.ok(cookies.length > 0);
    assert.ok(cookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"));
    assert.equal(await evaluate("document.cookie.includes('trafficsense-auth')"), false);
    for (const path of ["/employer", "/authority", "/admin"]) { await go(path); await route("/access-denied"); }
    await go("/workspace"); await text(commuter.email);
    await reload(); await text(commuter.email);
    await rewriteSession((session) => { session.user.email = "forged@example.test"; session.user.user_metadata = { role: "admin" }; });
    await go("/workspace"); await text(commuter.email);
    assert.equal(await evaluate("document.body.innerText.includes('forged@example.test')"), false);
    await go("/admin"); await route("/access-denied");
    await rewriteSession((session) => { session.expires_at = 1; });
    await go("/workspace"); await text(commuter.email);
    const refreshed = (await sessionCookies()).map((cookie) => cookie.value).join("");
    assert.ok(JSON.parse(Buffer.from(refreshed.slice(7), "base64url").toString()).expires_at > Date.now() / 1000);
    await rewriteSession((session) => { session.expires_at = 1; session.refresh_token = "invalid-refresh-token"; });
    await go("/workspace"); await route("/login"); await text("Welcome back");
    await login("commuter");
    const history = await call("Page.getNavigationHistory");
    const signedInEntry = history.entries[history.currentIndex];
    assert.equal(new URL(signedInEntry.url).pathname, "/workspace");
    await go("/"); await text("Understand the disruption");
    await go("/workspace"); await text(commuter.email);
    await rewriteSession((session) => { session.expires_at = 1; });
    await click('button[type="submit"]'); await route("/login"); await text("Welcome back");
    assert.equal((await sessionCookies()).length, 0, "expiry immediately before sign-out must not restore auth cookies");
    await navigate(() => call("Page.navigateToHistoryEntry", { entryId: signedInEntry.id }));
    await route("/login"); await text("Welcome back");
    assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(commuter.email)})`), false, "signed-out history hides account data");
    await go("/workspace"); await route("/login");

    for (const label of ["employer-a", "employer-b"]) {
      const account = await login(label);
      const other = accounts.find((item) => item.label === (label === "employer-a" ? "employer-b" : "employer-a"));
      await click('a[href="/employer"]'); await text("Your organisations"); await layout(); await snapshot("organisations");
      assert.equal(await evaluate(`!!document.querySelector('a[href="/employer/${other.orgId}"]')`), false);
      await click(`a[href="/employer/${account.orgId}"]`); await text("ORGANISATION MEMBERSHIP"); await layout(); await snapshot("organisation-detail");
      await reload(); await text("ORGANISATION MEMBERSHIP");
      await go(`/employer/${other.orgId}`); await text("Page not found");
      await go("/employer/not-a-uuid"); await text("Page not found");
      for (const path of ["/authority", "/admin"]) { await go(path); await route("/access-denied"); }
      await go("/workspace"); await text(account.email);
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(other.email)})`), false);
      await logout();
    }
    await login("employer-unassigned"); await go("/employer"); await text("No organisation memberships"); await layout(); await logout();
    for (const [label, path, heading] of [["authority", "/authority", "Read-only authority account"], ["admin", "/admin", "Demo administration"]]) {
      await login(label); await click(`a[href="${path}"]`); await text(heading); await layout(); await snapshot(label);
      for (const denied of ["/employer", label === "authority" ? "/admin" : "/authority"]) { await go(denied); await route("/access-denied"); }
      await logout();
    }
    await login("commuter");
    const primarySession = sessionId;
    const second = await send("Target.createTarget", { url: "about:blank", browserContextId: context });
    const secondary = await send("Target.attachToTarget", { targetId: second.targetId, flatten: true });
    try {
      sessionId = secondary.sessionId;
      await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
      await call("Emulation.setDeviceMetricsOverride", { width, height, mobile, deviceScaleFactor: 1 });
      await go("/workspace"); await text(commuter.email);
      sessionId = primarySession; await call("Page.bringToFront");
      await logout();
      sessionId = secondary.sessionId; await call("Page.bringToFront");
      await reload(); await route("/login"); await text("Welcome back");
      sessionId = primarySession; await call("Page.bringToFront");
      const employer = await login("employer-a");
      sessionId = secondary.sessionId; await call("Page.bringToFront");
      await click('header a[href="/workspace"]'); await route("/workspace"); await text(employer.email);
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(commuter.email)})`), false);
      for (const path of ["/login", "/login?notice=revocation-unconfirmed", "/register"]) { await go(path); await route("/workspace"); await text(employer.email); }
      await logout();
      sessionId = primarySession; await call("Page.bringToFront");
      await reload(); await route("/login"); await text("Welcome back");
    } finally {
      sessionId = primarySession;
      await send("Target.closeTarget", { targetId: second.targetId });
      await call("Page.bringToFront");
    }
    await go("/not-a-route"); await text("Page not found"); await layout();
    await click('header a[href="/"]'); await text("Understand the disruption");
    await mkdir("supabase/.temp/browser", { recursive: true });
    const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(`supabase/.temp/browser/${new URL(base).port}-${width}.png`, Buffer.from(shot.data, "base64"));
    console.log(`PASS ${base} ${width}px: registration, keyboard login, invalid login, all roles, organisation isolation, empty membership, cookie flags, settled logout/history, refresh, two-tab session changes, direct routes and layout`);
  }
  assert.deepEqual(navigationIssues, [], "route navigation must have a loading boundary");
  const unexpected = exceptions.filter(({ report, context }) => {
    const expectedError = expectedFailures.get(context);
    const expected = `Error: Switched to client rendering because the server rendering errored:\n\n${expectedError}\n`;
    const productionFallback = ["http://127.0.0.1:3003", "http://127.0.0.1:3004"].includes(base) && report === "Error: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    return !expectedError || (!report.startsWith(expected) && !productionFallback);
  });
  assert.deepEqual(unexpected.map(({ report }) => report), [], "unexpected browser runtime exceptions");
  console.log(`PASS: no unexpected browser runtime exceptions; ${exceptions.length} expected server-error reports from verified outage documents`);
} finally {
  try {
    if (recoveryOnly) await fault("healthy");
  } finally {
    try {
      if (fixtures) await fixtures.cleanup();
    } finally {
      try {
        if (context) await send("Target.disposeBrowserContext", { browserContextId: context });
      } finally {
        socket.close();
      }
    }
  }
}
