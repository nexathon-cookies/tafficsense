import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { completedTraversalInput, retainedMotionSchedule, simulateTraversal, traversalTimestamp, traversalTimestampMicros } from "../apps/web/src/lib/traffic/traversals.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const anonymous = createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
async function rpc(client, name, input) {
  const response = await client.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(response.error, null, `${name} must succeed`);
  return response.data;
}
const check = id => rpc(service, "check_completed_traversal", { p_traversal_id: id });
const ingest = input => rpc(service, "ingest_completed_traversal", { p_traversal: input });
const cleanup = id => rpc(service, "cleanup_speed_evidence", { p_run_id: id });
async function ledger() {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await service.from("completed_traversals").select("*").order("traversal_id").range(offset, offset + 999);
    assert.equal(response.error, null); result.push(...response.data);
    if (response.data.length < 1000) return result;
  }
}

// Missing migration fails before any fixture or retained-ledger mutation.
assert.deepEqual(await check(crypto.randomUUID()), { status: "not_found" });
const before = await rpc(anonymous, "read_traffic_demo"), beforeLedger = await ledger();
const runs = [];
let prepared = false;
after(async () => {
  const failures = [];
  const attempt = async action => { try { await action(); } catch (error) { failures.push(error); } };
  for (const run of runs) await attempt(() => cleanup(run));
  if (prepared) await attempt(() => before.fixture ? rpc(service, "replace_traffic_demo", { p_fixture: before.fixture }) : rpc(service, "reset_traffic_demo"));
  await attempt(async () => {
    assert.deepEqual(await ledger(), beforeLedger, "pre-existing completion rows are unchanged");
    const restored = await rpc(anonymous, "read_traffic_demo");
    assert.deepEqual(restored.fixture, before.fixture); assert.deepEqual(restored.reports, before.reports);
    assert.deepEqual(restored.incident_episodes, before.incident_episodes); assert.equal(restored.reporting_enabled, before.reporting_enabled);
  });
  assert.equal(failures.length, 0, "owned cleanup and exact fixture/report preservation must succeed");
});
async function prepare() {
  prepared = true;
  const fixture = createTrafficFixture("slowdown", new Date(Date.now() - 360000).toISOString());
  await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
  const run = crypto.randomUUID(), batch = crypto.randomUUID(); runs.push(run);
  assert.equal((await rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: batch })).status, "accepted");
  const context = await rpc(service, "read_traversal_context", { p_run_id: run, p_batch_id: batch, p_source_id: "primary-west-source-1" });
  const anchor = traversalTimestampMicros(fixture.corridor.anchor_at);
  const entered = traversalTimestamp(anchor - 360000000), until = traversalTimestamp(anchor + 315000000);
  const motion = simulateTraversal(context.segment.length_m, retainedMotionSchedule(context), entered, until);
  const input = completedTraversalInput({ traversal_id: crypto.randomUUID(), run_id: run, batch_id: batch, source_id: context.source_id },
    { ...context.segment, id: context.segment.segment_id }, motion);
  return { run, batch, context, input, entered, until };
}
async function prepareMotion(speeds, offsetsMicros = []) {
  prepared = true;
  const first = (Date.now() - 17 * 60000) * 1000;
  const fixture = createTrafficFixture("normal", new Date(first / 1000 + Math.min(11, speeds.length) * 60000).toISOString());
  const source = fixture.sources.find(row => row.id === "primary-west-source-1");
  const segment = fixture.segments.find(row => row.id === source.segment_id);
  fixture.observations = speeds.map((speed_kph, index) => ({ source_id: source.id, segment_id: segment.id,
    observed_at: traversalTimestamp(first + index * 60000000 + (offsetsMicros[index] ?? 0)), speed_kph }));
  await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
  const run = crypto.randomUUID(), batch = crypto.randomUUID(); runs.push(run);
  assert.equal((await rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: batch })).status, "accepted");
  return { traversal_id: crypto.randomUUID(), run_id: run, batch_id: batch, source_id: source.id,
    segment_id: segment.id, direction: segment.direction, entered_at: traversalTimestamp(first),
    exited_at: traversalTimestamp(first + 675000000), distance_m: segment.length_m,
    baseline_seconds: segment.baseline_seconds, baseline_label: segment.baseline_label };
}
function accepted(value, id, replayed) {
  assert.deepEqual(Object.keys(value).sort(), ["accepted_at", "replayed", "status", "traversal_id"]);
  assert.equal(value.status, "accepted"); assert.equal(value.traversal_id, id); assert.equal(value.replayed, replayed);
  traversalTimestampMicros(value.accepted_at);
}
function operate(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../scripts/operate-traversals.mjs", import.meta.url).pathname, ...args], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 30000);
    child.stdout.on("data", value => { stdout += value; }); child.stderr.on("data", value => { stderr += value; });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("exit", code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
    child.stdin.end(JSON.stringify(credentials));
  });
}

test("actual deterministic generation persists exact complete traversal and immutable retries", async () => {
  const current = await prepare();
  const result = await operate(["generate", current.run, current.batch, current.context.source_id, current.input.traversal_id, current.entered, current.until]);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /SIMULATED/);
  const acknowledgement = await check(current.input.traversal_id); accepted(acknowledgement, current.input.traversal_id, true);
  assert.deepEqual(await ingest(current.input), acknowledgement);
  const stored = (await ledger()).filter(row => row.run_id === current.run);
  assert.equal(stored.length, 1); assert.equal(stored[0].distance_m, 1500);
  assert.equal(traversalTimestampMicros(stored[0].exited_at) - traversalTimestampMicros(stored[0].entered_at), 675000000);
  assert.equal(stored[0].accepted_at, acknowledgement.accepted_at);
});

test("concurrent same-key and alternative-key retries allocate only once", async () => {
  const { input } = await prepare();
  const results = await Promise.all(Array.from({ length: 8 }, () => ingest(input)));
  assert.equal(results.filter(row => row.replayed === false).length, 1);
  assert.ok(results.every(row => row.status === "accepted"));
  const acknowledgement = await check(input.traversal_id);
  const conflict = { ...input, traversal_id: crypto.randomUUID() };
  assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => ingest(conflict))), Array.from({ length: 4 }, () => ({ status: "conflict" })));
  for (const change of [{ baseline_seconds: 181 }, { baseline_label: "Other" }, { distance_m: 1499 }, { source_id: "primary-west-source-2" }, { run_id: crypto.randomUUID() }, { batch_id: crypto.randomUUID() }, { direction: "inbound" }, { exited_at: traversalTimestamp(traversalTimestampMicros(input.exited_at) + 1) }]) {
    assert.deepEqual(await ingest({ ...input, ...change }), { status: "conflict" });
    assert.deepEqual(await check(input.traversal_id), acknowledgement);
  }
});

test("partial, future, stale, malformed, foreign source and baseline records allocate nothing", async () => {
  const { input, run, context, entered } = await prepare();
  const partial = await operate(["generate", run, input.batch_id, input.source_id, input.traversal_id, entered,
    traversalTimestamp(traversalTimestampMicros(input.exited_at) - 1)]);
  assert.equal(partial.code, 1); assert.match(partial.stderr, /Incomplete|partial/);
  const now = Date.now() * 1000;
  for (const change of [{ distance_m: 1499 }, { distance_m: 1500.1 }, { baseline_seconds: 181 }, { source_id: "not-bound" }, { batch_id: crypto.randomUUID() },
    { exited_at: traversalTimestamp(now + 60000000) }, { entered_at: traversalTimestamp(now - 1201000000) },
    { entered_at: input.exited_at }, { entered_at: "2026-02-30T00:00:00Z" }, { delay_seconds: 495 }, { state: "complete" }, { baseline_label: "" }]) {
    assert.ok(["invalid", "conflict", "unavailable"].includes((await ingest({ ...input, ...change })).status));
  }
  assert.deepEqual(await check(input.traversal_id), { status: "not_found" });
  assert.equal((await ledger()).filter(row => row.run_id === run).length, 0);
  assert.equal(retainedMotionSchedule(context).length, 2);
});

test("direct RPC derives full distance from six continuous slow samples and rejects forged exit times", async () => {
  const input = await prepareMotion(Array(6).fill(8));
  for (const duration of [1000000, 674999999, 675000001, 676000000]) {
    assert.deepEqual(await ingest({ ...input, exited_at: traversalTimestamp(traversalTimestampMicros(input.entered_at) + duration) }), { status: "invalid" });
    assert.deepEqual(await check(input.traversal_id), { status: "not_found" });
  }
  assert.equal((await ledger()).filter(row => row.run_id === input.run_id).length, 0);
  accepted(await ingest(input), input.traversal_id, false);
  accepted(await ingest(input), input.traversal_id, true);
});

test("direct RPC rejects stationary, incomplete, gapped and off-grid retained source schedules", async () => {
  for (const [speeds, offsets] of [[Array(6).fill(0)], [[8]], [Array(5).fill(8)],
    [Array(6).fill(8), [0, 0, 60000000, 60000000, 60000000, 60000000]],
    [Array(6).fill(8), [0, 0, 1, 0, 0, 0]], [Array(6).fill(8), Array(6).fill(-1)]]) {
    const input = await prepareMotion(speeds, offsets);
    for (const duration of [1000000, 675000000]) {
      assert.deepEqual(await ingest({ ...input, exited_at: traversalTimestamp(traversalTimestampMicros(input.entered_at) + duration) }), { status: "invalid" });
      assert.deepEqual(await check(input.traversal_id), { status: "not_found" });
    }
    assert.equal((await ledger()).filter(row => row.run_id === input.run_id).length, 0);
  }
});

test("direct RPC integrates mixed retained speeds rather than the latest speed", async () => {
  const input = await prepareMotion([...Array(6).fill(8), ...Array(6).fill(28)]);
  const entry = traversalTimestampMicros(input.entered_at);
  for (const duration of [Math.ceil(1500 / (28 / 3.6) * 1000000), 449999999, 450000001, 675000000]) {
    assert.deepEqual(await ingest({ ...input, exited_at: traversalTimestamp(entry + duration) }), { status: "invalid" });
  }
  accepted(await ingest({ ...input, exited_at: traversalTimestamp(entry + 450000000) }), input.traversal_id, false);
  const stored = (await ledger()).find(row => row.traversal_id === input.traversal_id);
  assert.equal(traversalTimestampMicros(stored.exited_at) - traversalTimestampMicros(stored.entered_at), 450000000);
});

test("ordinary clients and direct service mutations are denied; caller-clock projection remains internal", async () => {
  const { input } = await prepare();
  assert.equal((await anonymous.from("completed_traversals").select("*")).error?.code, "42501");
  for (const [name, parameters] of [["ingest_completed_traversal", { p_traversal: input }], ["check_completed_traversal", { p_traversal_id: input.traversal_id }],
    ["read_traversal_context", { p_run_id: input.run_id, p_batch_id: input.batch_id, p_source_id: input.source_id }],
    ["project_completed_traversal", { p_run_id: input.run_id, p_segment_id: input.segment_id, p_direction: input.direction, p_read_at: input.exited_at }]]) {
    assert.equal((await anonymous.rpc(name, parameters)).error?.code, "42501");
  }
  assert.equal((await service.rpc("project_completed_traversal", { p_run_id: input.run_id, p_segment_id: input.segment_id, p_direction: input.direction, p_read_at: input.exited_at })).error?.code, "42501");
  for (const client of [anonymous, service]) {
    assert.equal((await client.rpc("expected_completed_traversal_exit", { p_run_id: input.run_id, p_batch_id: input.batch_id,
      p_source_id: input.source_id, p_segment_id: input.segment_id, p_direction: input.direction, p_entered_at: input.entered_at })).error?.code, "42501");
  }
  const row = { ...input, accepted_at: new Date().toISOString() }; delete row.baseline_seconds; delete row.baseline_label;
  assert.equal((await service.from("completed_traversals").insert(row)).error?.code, "42501");
  assert.equal((await service.from("completed_traversals").update({ distance_m: 1 }).eq("traversal_id", input.traversal_id)).error?.code, "42501");
  assert.equal((await service.from("completed_traversals").delete().eq("traversal_id", input.traversal_id)).error?.code, "42501");
});

test("committed-response loss checks survive fixture replacement/reset and explicit run cleanup cascades", async () => {
  const { input, run } = await prepare();
  let requests = 0, committed;
  const dropping = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, { ...options,
    global: { fetch: async (url, init) => {
      assert.ok(String(url).endsWith("/rpc/ingest_completed_traversal")); requests++;
      const response = await fetch(url, init); assert.ok(response.ok);
      committed = await response.json(); accepted(committed, input.traversal_id, false);
      throw new Error("Test-owned committed traversal response dropped");
    } },
  });
  const lost = await dropping.rpc("ingest_completed_traversal", { p_traversal: input }).abortSignal(AbortSignal.timeout(15000));
  assert.equal(requests, 1); assert.equal(lost.data, null); assert.ok(lost.error);
  const acknowledgement = await check(input.traversal_id);
  assert.deepEqual(acknowledgement, { ...committed, replayed: true });
  await rpc(service, "reset_traffic_demo");
  assert.deepEqual(await check(input.traversal_id), acknowledgement);
  assert.deepEqual(await ingest(input), acknowledgement);
  const checked = await operate(["check", input.traversal_id]); assert.equal(checked.code, 0, checked.stderr); assert.ok(checked.stdout.includes(acknowledgement.accepted_at));
  await rpc(service, "replace_traffic_demo", { p_fixture: createTrafficFixture("normal", new Date().toISOString()) });
  assert.deepEqual(await check(input.traversal_id), acknowledgement);
  await cleanup(run);
  assert.deepEqual(await check(input.traversal_id), { status: "not_found" });
});
