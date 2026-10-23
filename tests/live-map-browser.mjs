import assert from "node:assert/strict";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const debugUrl = process.env.CHROMIUM_DEBUG_URL ?? "http://127.0.0.1:9333";
const expectedReports = Number(process.env.EXPECTED_LIVE_INCIDENTS ?? "3");

const version = await fetch(`${debugUrl}/json/version`).then(response => response.json());
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

async function waitFor(evaluate, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await evaluate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function runAt(width, height) {
  const context = await send("Target.createBrowserContext");
  const target = await send("Target.createTarget", { url: "about:blank", browserContextId: context.browserContextId });
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  try {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Page.navigate", { url: appUrl }, sessionId);
    await waitFor(() => evaluate("document.querySelector('#hero-title')?.textContent.includes('Report road problems')"), "plain-language home page");
    const home = await evaluate(`({
      actions: Array.from(document.querySelectorAll('.actions a')).map(link => ({ label: link.textContent.trim(), href: new URL(link.href).pathname })),
      overflow: document.documentElement.scrollWidth <= window.innerWidth
    })`);
    assert.deepEqual(home.actions, [
      { label: "Report a problem →", href: "/planner" },
      { label: "Plan my route", href: "/planner" },
    ]);
    assert.equal(home.overflow, true, `${width}px home page must not overflow horizontally`);
    await send("Page.navigate", { url: `${appUrl}/traffic` }, sessionId);
    await waitFor(() => evaluate("document.querySelector('[data-testid=traffic-ready]') !== null"), "traffic explorer");
    await waitFor(() => evaluate(`document.querySelectorAll('[data-live-incident-marker]').length === ${expectedReports}`), "live report markers");

    const marker = await evaluate(`(() => { const element = document.querySelector('[data-live-incident-marker]'); const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...marker, button: "left", clickCount: 1 }, sessionId);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...marker, button: "left", clickCount: 1 }, sessionId);
    await waitFor(() => evaluate("document.querySelector('[aria-label=\"Selected community report\"]')?.innerText.includes('Reported')"), "selected live report details");

    const result = await evaluate(`({
      markers: document.querySelectorAll('[data-live-incident-marker]').length,
      details: document.querySelector('[aria-label="Selected community report"]')?.innerText,
      overflow: document.documentElement.scrollWidth <= window.innerWidth
    })`);
    assert.equal(result.markers, expectedReports);
    assert.match(result.details, /COMMUNITY REPORT/);
    assert.equal(result.overflow, true, `${width}px viewport must not overflow horizontally`);

    await send("Page.navigate", { url: `${appUrl}/planner` }, sessionId);
    await waitFor(() => evaluate("document.body?.innerText.includes('Find Best Route')"), "route planner");
    await waitFor(() => evaluate("document.body?.innerText.includes('Your selected route intersects a reported incident')"), "explicit route warning");
    const avoidButton = await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Avoid this route'))?.textContent ?? ''`);
    assert.match(avoidButton, /Avoid this route/);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Avoid this route'))?.click()`);
    await waitFor(() => evaluate("document.body?.innerText.includes('You chose this alternative')"), "chosen avoiding route");
  } finally {
    await send("Target.closeTarget", { targetId: target.targetId }).catch(() => undefined);
    await send("Target.disposeBrowserContext", { browserContextId: context.browserContextId }).catch(() => undefined);
  }
}

try {
  await runAt(1440, 1000);
  await runAt(390, 844);
  console.log("Live map browser checks passed at 1440px and 390px.");
} finally {
  socket.close();
}
