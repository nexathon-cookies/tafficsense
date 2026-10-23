import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { internalSupabaseUrl } from "../scripts/local-status.mjs";

const script = new URL("../scripts/simulate-traffic.mjs", import.meta.url);
function run(args, env = {}, input = "") {
  return spawnSync(process.execPath, [script.pathname, ...args], {
    env: { ...process.env, DEMO_MODE: "true", SUPABASE_URL: internalSupabaseUrl, ...env },
    input, encoding: "utf8", timeout: 5000,
  });
}

test("simulator CLI rejects non-local or disabled demo configuration before reading credentials", () => {
  for (const args of [["normal"], ["reset"]]) {
    for (const env of [{ DEMO_MODE: "false" }, { DEMO_MODE: "" }, { SUPABASE_URL: "https://example.com" }, { SUPABASE_URL: "" }]) {
      const result = run(args, env);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /restricted to the configured local demo/);
      assert.equal(result.stdout, "");
    }
  }
});

test("simulator CLI rejects unknown commands, extra arguments and invalid clocks before mutation", () => {
  for (const args of [[], ["unknown"], ["reset", "extra"], ["normal", "2026-10-15T04:00:00.000Z", "extra"], ["normal", "now"], ["recovery", "2026-02-30T00:00:00.000Z"]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:|canonical.*UTC/);
    assert.equal(result.stdout, "");
  }
});

test("simulator CLI refuses remote status and redacts malformed credential input", () => {
  const secret = "test-secret-must-not-appear";
  for (const args of [["normal"], ["slowdown"], ["recovery"], ["reset"]]) {
    for (const input of [secret, JSON.stringify({ API_URL: "https://example.com", ANON_KEY: secret, SERVICE_ROLE_KEY: secret }), JSON.stringify({ API_URL: "http://127.0.0.1:54321" })]) {
      const result = run(args, {}, input);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Could not read valid local Supabase status/);
      assert.ok(!result.stderr.includes(secret));
      assert.equal(result.stdout, "");
    }
  }
});
