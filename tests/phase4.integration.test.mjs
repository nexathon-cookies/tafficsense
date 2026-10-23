import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parsePhase4Snapshot } from "../apps/web/src/lib/traffic/phase4.ts";
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
const read = async () => parsePhase4Snapshot(await rpc(anonymous, "read_traffic_phase4"));
const original = await read();
const runs = [];
let modified = false;
after(async () => {
  for (const run of runs) assert.equal((await rpc(service, "cleanup_speed_evidence", { p_run_id: run })).status, "ready");
  if (modified) await rpc(service, original.traffic.fixture ? "replace_traffic_demo" : "reset_traffic_demo", original.traffic.fixture ? { p_fixture: original.traffic.fixture } : undefined);
  const restored = await read();
  assert.deepEqual(restored.traffic.fixture, original.traffic.fixture);
  assert.deepEqual(restored.traffic.reports, original.traffic.reports);
  assert.deepEqual(restored.traffic.incident_episodes, original.traffic.incident_episodes);
  assert.equal(restored.traffic.reporting_enabled, original.traffic.reporting_enabled);
});
async function prepare() {
  const fixture = createTrafficFixture("slowdown", new Date(Date.now() - 360000).toISOString());
  modified = true;
  await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
  const run = crypto.randomUUID(), batch = crypto.randomUUID(); runs.push(run);
  assert.equal((await rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: batch })).status, "accepted");
  return { run, batch, fixture };
}
async function complete({ run, batch, fixture }) {
  const context = await rpc(service, "read_traversal_context", { p_run_id: run, p_batch_id: batch, p_source_id: "primary-west-source-1" });
  const anchor = traversalTimestampMicros(fixture.corridor.anchor_at);
  const motion = simulateTraversal(context.segment.length_m, retainedMotionSchedule(context), traversalTimestamp(anchor - 360000000), traversalTimestamp(anchor + 315000000));
  const input = completedTraversalInput({ run_id: run, batch_id: batch, source_id: context.source_id, traversal_id: crypto.randomUUID() }, { ...context.segment, id: context.segment.segment_id }, motion);
  assert.equal((await rpc(service, "ingest_completed_traversal", { p_traversal: input })).status, "accepted");
}

test("coherent anonymous read round-trips the strict contract without caller clock or private identity", async () => {
  await prepare();
  const data = await read();
  assert.equal(data.traversals.length, data.traffic.fixture.segments.length);
  assert.ok(data.incidents.some(row => row.segment_id === "primary-west" && row.state === "supported" && row.is_current));
  assert.ok(data.traversals.every(row => row.status === "missing" && row.delay_seconds === null));
  for (const table of ["incident_lifecycle_cycles", "incident_lifecycle_events", "speed_evidence_runs", "completed_traversals"]) {
    assert.equal((await anonymous.from(table).select("*")).error?.code, "42501");
  }
  assert.equal((await anonymous.rpc("read_traffic_phase4", { p_read_at: data.traffic.read_at })).error?.code, "PGRST202");
  for (const name of ["run_id", "batch_id", "assignment_lower", "assignment_upper", "source_id", "owner_id"]) {
    assert.equal(JSON.stringify({ incidents: data.incidents, traversals: data.traversals }).includes(`"${name}"`), false);
  }
});

test("completed motion produces 495 seconds, and a newer run never borrows that completion", async () => {
  const context = await prepare(); await complete(context);
  let data = await read();
  const available = data.traversals.find(row => row.segment_id === "primary-west");
  assert.equal(available.status, "available"); assert.equal(available.delay_seconds, 495);
  const supported = data.incidents.find(row => row.segment_id === "primary-west" && row.is_current);
  assert.ok(supported);
  await prepare(); data = await read();
  assert.equal(data.traversals.find(row => row.segment_id === "primary-west").status, "missing");
  assert.equal(data.incidents.find(row => row.id === supported.id).is_current, false);
});

test("reset hides retained history without clearing; restored fixture returns identical incident references", async () => {
  const context = await prepare(); await complete(context);
  const before = await read();
  await rpc(service, "reset_traffic_demo");
  const empty = await read();
  assert.equal(empty.traffic.fixture, null); assert.deepEqual(empty.incidents, []); assert.deepEqual(empty.traversals, []);
  await rpc(service, "replace_traffic_demo", { p_fixture: context.fixture });
  const restored = await read();
  assert.deepEqual(restored.incidents, before.incidents); assert.deepEqual(restored.traversals, before.traversals);
});

test("a changed active baseline yields incompatible delay instead of substituting an old assumption", async () => {
  const context = await prepare(); await complete(context);
  const changed = structuredClone(context.fixture); changed.segments.find(row => row.id === "primary-west").baseline_seconds++;
  await rpc(service, "replace_traffic_demo", { p_fixture: changed });
  const data = await read();
  assert.equal(data.traversals.find(row => row.segment_id === "primary-west").status, "incompatible");
  assert.equal(data.traversals.find(row => row.segment_id === "primary-west").delay_seconds, null);
  assert.ok(data.incidents.filter(row => row.segment_id === "primary-west").every(row => !row.is_current));
});
