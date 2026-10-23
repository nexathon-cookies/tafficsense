import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { internalSupabaseUrl } from "../scripts/local-status.mjs";

const script = new URL("../scripts/operate-speed-evidence.mjs", import.meta.url);
const runId = "d20e6d70-26aa-46f1-8aef-c0497dd83b02";
const batchId = "8b8d7c31-e5ba-4c18-ae14-7d988a9d253d";
const status = { API_URL: "http://127.0.0.1:54321", ANON_KEY: "test-anonymous-key", SERVICE_ROLE_KEY: "test-secret-must-not-appear" };
const accepted = replayed => ({ status: "accepted", run_id: runId, batch_id: batchId, accepted_at: "2026-10-16T04:00:00.123456+00:00", observation_count: 180, inserted_observation_count: 180, replayed });
function run(args, { env = {}, input = "", response, error = null, throws = false, expectedName } = {}) {
  const options = [];
  if (response !== undefined || error || throws) {
    const mock = `import assert from 'node:assert/strict';
      export function createClient(url, key, options) {
        assert.equal(url, ${JSON.stringify(internalSupabaseUrl)});
        assert.equal(key, ${JSON.stringify(status.SERVICE_ROLE_KEY)});
        assert.equal(options.auth.persistSession, false); assert.equal(options.auth.autoRefreshToken, false);
        return { rpc(name, input) {
          assert.equal(name, ${JSON.stringify(expectedName)});
          assert.deepEqual(input, ${JSON.stringify(expectedName === "cleanup_speed_evidence" ? { p_run_id: runId } : { p_run_id: runId, p_batch_id: batchId })});
          return { abortSignal(signal) {
            assert.ok(signal instanceof AbortSignal); assert.equal(signal.aborted, false);
            if (${throws}) throw new Error(${JSON.stringify(status.SERVICE_ROLE_KEY)});
            return Promise.resolve({ data: ${JSON.stringify(response ?? null)}, error: ${JSON.stringify(error)} });
          }};
        }};
      }`;
    const loader = `import {registerHooks} from 'node:module'; registerHooks({resolve(specifier, context, next) {
      return specifier === '@supabase/supabase-js' ? {url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(mock)}`)}, shortCircuit:true} : next(specifier, context);
    }});`;
    options.push("--import", `data:text/javascript,${encodeURIComponent(loader)}`);
  }
  return spawnSync(process.execPath, [...options, script.pathname, ...args], {
    env: { ...process.env, DEMO_MODE: "true", SUPABASE_URL: internalSupabaseUrl, ...env },
    input, encoding: "utf8", timeout: 5000,
  });
}
const capture = ["capture", runId, batchId];
const check = ["check", runId, batchId];
const cleanup = ["cleanup", runId, "--confirm"];
function mockRun(args, response, extra = {}) {
  return run(args, { input: JSON.stringify(status), response, expectedName: `${args[0]}_speed_evidence`, ...extra });
}

test("speed-evidence CLI enforces local demo guards before credential or mutation work", () => {
  for (const args of [capture, check, cleanup]) for (const env of [{ DEMO_MODE: "false" }, { DEMO_MODE: "" }, { SUPABASE_URL: "https://example.com" }, { SUPABASE_URL: "" }]) {
    const result = run(args, { env });
    assert.equal(result.status, 1); assert.match(result.stderr, /restricted to the configured local demo/); assert.equal(result.stdout, "");
  }
});

test("speed-evidence CLI requires explicit valid IDs, exact commands and cleanup confirmation", () => {
  for (const args of [[], ["unknown"], ["capture"], ["capture", runId], ["capture", runId, batchId, "extra"],
    ["capture", "bad", batchId], ["capture", runId, "00000000-0000-0000-0000-000000000000"], ["capture", runId.toUpperCase(), batchId],
    ["check", runId], ["cleanup", runId], ["cleanup", runId, "yes"], ["cleanup", runId, "--confirm", "extra"]]) {
    const result = run(args); assert.equal(result.status, 1); assert.match(result.stderr, /Usage:/); assert.equal(result.stdout, "");
  }
});

test("speed-evidence CLI rejects remote or malformed status without printing credentials", () => {
  for (const args of [capture, check, cleanup]) for (const input of [status.SERVICE_ROLE_KEY, "{}", JSON.stringify({ ...status, API_URL: "https://example.com" })]) {
    const result = run(args, { input }); assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not read valid local Supabase status/);
    assert.ok(!result.stderr.includes(status.SERVICE_ROLE_KEY)); assert.equal(result.stdout, "");
  }
});

test("capture and check validate original acknowledgements and retain exact acceptance timestamps", () => {
  for (const [args, replayed] of [[capture, false], [capture, true], [check, true]]) {
    const result = mockRun(args, accepted(replayed)); assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SIMULATED/); assert.ok(result.stdout.includes(runId)); assert.ok(result.stdout.includes(batchId));
    assert.match(result.stdout, /180/); assert.ok(result.stdout.includes("2026-10-16T04:00:00.123456+00:00"));
    assert.match(result.stdout, replayed ? /acknowledgement/ : /captured/); assert.match(result.stdout, /not clearance/);
    assert.equal(result.stderr, "");
  }
  const notFound = mockRun(check, { status: "not_found" }); assert.equal(notFound.status, 0); assert.match(notFound.stdout, /No retained acknowledgement/);
  for (const removed of [true, false]) {
    const result = mockRun(cleanup, { status: "ready", removed }); assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, removed ? /Removed/ : /No retained run/); assert.match(result.stdout, /never reuse/);
  }
});

test("expected rejection states are sanitized and never printed as successful capture", () => {
  for (const state of ["conflict", "unavailable", "invalid", "limit_reached"]) {
    const result = mockRun(capture, { status: state }); assert.equal(result.status, 1);
    assert.equal(result.stdout, ""); assert.ok(result.stderr.includes(state)); assert.match(result.stderr, /No new evidence was accepted/);
  }
});

test("malformed results, provider failures and unknown outcomes never cause automatic retry", () => {
  for (const response of [null, {}, { status: "not_found" }, { ...accepted(false), private_key: status.SERVICE_ROLE_KEY },
    { ...accepted(false), run_id: batchId }, { ...accepted(false), batch_id: runId }, { ...accepted(false), accepted_at: "2026-02-30T04:00:00.000Z" },
    { ...accepted(false), observation_count: 5001 }, { ...accepted(false), inserted_observation_count: 181 },
    { ...accepted(false), replayed: "false" }, { status: "conflict", detail: status.SERVICE_ROLE_KEY }]) {
    const result = mockRun(capture, response); assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.match(result.stderr, /outcome may be unknown/); assert.match(result.stderr, new RegExp(`check ${runId} ${batchId}`));
    assert.ok(!result.stderr.includes(status.SERVICE_ROLE_KEY));
  }
  const invalidCheck = mockRun(check, accepted(false)); assert.equal(invalidCheck.status, 1);
  const invalidCleanup = mockRun(cleanup, { status: "ready", removed: "yes" }); assert.equal(invalidCleanup.status, 1);
  for (const extra of [{ error: { message: status.SERVICE_ROLE_KEY } }, { throws: true }]) {
    const result = mockRun(capture, accepted(false), extra); assert.equal(result.status, 1);
    assert.match(result.stderr, /outcome may be unknown/); assert.ok(!result.stderr.includes(status.SERVICE_ROLE_KEY)); assert.equal(result.stdout, "");
  }
});
