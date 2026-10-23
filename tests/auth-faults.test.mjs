import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

const base = "http://127.0.0.1:8000";
const request = (path, options) => fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(2000) });

test("organisation fault controls reject invalid and browser-originated changes", async () => {
  const child = spawn(process.execPath, ["tests/auth-faults.mjs"], { stdio: "ignore" });
  const exited = once(child, "exit");
  try {
    const deadline = Date.now() + 5000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try { ready = (await request("/__health")).ok; } catch { /* Wait for the test server's socket. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, "Test proxy did not become ready");
    const response = await request("/__test_fault", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "organisations" }),
    });
    assert.equal(response.status, 200, "Organisation-specific fault control must be accepted");
    for (const path of ["/rest/v1/organisations", "/rest/v1/organisations?select=id,name"]) {
      assert.equal((await request(path)).status, 503, "Organisation query must receive the injected outage");
    }
    for (const [body, headers, status] of [
      [{ mode: "healthy" }, { Origin: "http://example.test" }, 403],
      [{ mode: "unsupported" }, {}, 400],
      [{ mode: "healthy", extra: true }, {}, 400],
    ]) {
      const rejected = await request("/__test_fault", {
        method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
      });
      assert.equal(rejected.status, status);
      assert.equal((await request("/rest/v1/organisations")).status, 503, "Rejected control must not change the fault mode");
    }
    const lostResponse = await request("/__test_fault", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "report-response-loss" }),
    });
    assert.equal(lostResponse.status, 200, "The isolated proxy supports report-response loss after forwarding.");
  } finally {
    child.kill();
    await exited;
  }
});
