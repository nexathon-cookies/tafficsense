import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { internalSupabaseUrl } from "../scripts/local-status.mjs";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";

const script = new URL("../scripts/operate-traversals.mjs", import.meta.url);
const runId = "0b9c1f92-c6e7-41c8-8b4c-b109aa535897", batchId = "0c88e6d4-621c-417d-98c5-c2169c5bac42", traversalId = "aae744ae-0866-4c15-b672-6bc8bf994721";
const status = { API_URL: "http://127.0.0.1:54321", ANON_KEY: "test-anonymous", SERVICE_ROLE_KEY: "secret-must-not-appear" };
const anchor = "2026-10-16T10:00:00.123Z";
const fixture = createTrafficFixture("slowdown", anchor), selected = fixture.segments[0];
const context = { status: "ready", run_id: runId, batch_id: batchId, source_id: "primary-west-source-1", anchor_at: anchor, accepted_at: anchor,
  segment: { segment_id: selected.id, direction: selected.direction, length_m: selected.length_m, baseline_seconds: selected.baseline_seconds, baseline_label: selected.baseline_label },
  samples: fixture.observations.filter(row => row.source_id === "primary-west-source-1").map(({ observed_at, speed_kph }) => ({ observed_at, speed_kph })) };
const entered = "2026-10-16T09:54:00.123456Z", until = "2026-10-16T10:05:15.123456Z";
const generate = ["generate", runId, batchId, "primary-west-source-1", traversalId, entered, until];
const accepted = { status: "accepted", traversal_id: traversalId, accepted_at: "2026-10-16T10:05:16.123456+00:00", replayed: false };
function run(args, { env = {}, input = JSON.stringify(status), result = accepted, retained = context, fail = false } = {}) {
  const mock = `import assert from 'node:assert/strict'; export function createClient(url,key,options) {
    assert.equal(url, ${JSON.stringify(internalSupabaseUrl)}); assert.equal(key, ${JSON.stringify(status.SERVICE_ROLE_KEY)});
    assert.equal(options.auth.persistSession,false); assert.equal(options.auth.autoRefreshToken,false);
    return {rpc(name,input) {return {abortSignal(signal) {
      assert.ok(signal instanceof AbortSignal);
      if (${fail}) throw new Error(${JSON.stringify(status.SERVICE_ROLE_KEY)});
      if (name === 'read_traversal_context') {
        assert.deepEqual(input,{p_run_id:${JSON.stringify(runId)},p_batch_id:${JSON.stringify(batchId)},p_source_id:'primary-west-source-1'});
        return Promise.resolve({data:${JSON.stringify(retained)},error:null});
      }
      if (name === 'ingest_completed_traversal') {
        assert.equal(input.p_traversal.traversal_id,${JSON.stringify(traversalId)});
        assert.equal(input.p_traversal.entered_at,${JSON.stringify(entered)});
        assert.equal(input.p_traversal.exited_at,${JSON.stringify(until)});
        assert.equal(input.p_traversal.distance_m,1500);
        assert.equal(Object.hasOwn(input.p_traversal,'delay_seconds'),false);
      } else {assert.equal(name,'check_completed_traversal'); assert.deepEqual(input,{p_traversal_id:${JSON.stringify(traversalId)}});}
      return Promise.resolve({data:${JSON.stringify(result)},error:null});
    }}}};
  }`;
  const loader = `import {registerHooks} from 'node:module'; registerHooks({resolve(specifier,context,next) {return specifier === '@supabase/supabase-js' ? {url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(mock)}`)},shortCircuit:true}:next(specifier,context);}});`;
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(loader)}`, script.pathname, ...args], {
    env: { ...process.env, DEMO_MODE: "true", SUPABASE_URL: internalSupabaseUrl, ...env }, input, encoding: "utf8", timeout: 5000,
  });
}

test("traversal command enforces local guards, explicit stable IDs and exact timestamps", () => {
  for (const env of [{ DEMO_MODE: "false" }, { SUPABASE_URL: "https://remote.example" }]) {
    const result = run(generate, { env }); assert.equal(result.status, 1); assert.match(result.stderr, /restricted to the configured local demo/);
  }
  for (const args of [[], ["cleanup", traversalId], generate.slice(0, -1), [...generate, "extra"], ["check", "bad"], ["check", traversalId, "extra"], generate.map(value => value === entered ? "2026-02-30T00:00:00Z" : value)]) {
    const result = run(args); assert.equal(result.status, 1); assert.match(result.stderr, /Usage:/);
  }
});

test("generation sends only exact completed observation and check retains original acknowledgement", () => {
  const generated = run(generate); assert.equal(generated.status, 0, generated.stderr);
  assert.match(generated.stdout, /SIMULATED/); assert.match(generated.stdout, /not incident-caused/); assert.ok(generated.stdout.includes(traversalId));
  const checked = run(["check", traversalId], { result: { ...accepted, replayed: true } });
  assert.equal(checked.status, 0, checked.stderr); assert.ok(checked.stdout.includes(accepted.accepted_at));
  assert.equal(run(["check", traversalId], { result: { status: "not_found" } }).status, 0);
});

test("partial motion and malformed or mismatched retained context never ingest", () => {
  const partial = run([...generate.slice(0, -1), "2026-10-16T10:05:14.123456Z"]);
  assert.equal(partial.status, 1); assert.match(partial.stderr, /partial|incomplete/i); assert.equal(partial.stdout, "");
  for (const retained of [{ status: "not_found" }, { ...context, run_id: batchId }, { ...context, source_id: "other" }, { ...context, secret: status.SERVICE_ROLE_KEY }, { ...context, samples: context.samples.slice(1) }]) {
    const result = run(generate, { retained }); assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.ok(!result.stderr.includes(status.SERVICE_ROLE_KEY));
  }
});

test("unknown outcomes keep stable check guidance and sanitize providers and malformed acknowledgements", () => {
  for (const options of [{ fail: true }, { input: status.SERVICE_ROLE_KEY }, { result: null }, { result: { ...accepted, secret: status.SERVICE_ROLE_KEY } }, { result: { ...accepted, traversal_id: batchId } }, { result: { ...accepted, accepted_at: "2026-02-30T00:00:00Z" } }, { result: { ...accepted, replayed: "false" } }]) {
    const result = run(generate, options); assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.ok(!result.stderr.includes(status.SERVICE_ROLE_KEY));
  }
  const failed = run(generate, { fail: true }); assert.match(failed.stderr, new RegExp(`check ${traversalId}`));
  for (const state of ["invalid", "conflict", "unavailable", "limit_reached"]) {
    const result = run(generate, { result: { status: state } }); assert.equal(result.status, 1); assert.match(result.stderr, new RegExp(state)); assert.equal(result.stdout, "");
  }
});
