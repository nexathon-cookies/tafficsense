import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const guest = createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
const runs = [];
const newRun = () => { const id = crypto.randomUUID(); runs.push(id); return id; };
const tables = ["cycles", "events", "event_samples", "episode_links", "cursors"].map(name => `incident_lifecycle_${name}`);
async function rpc(client, name, input) {
  const result = await client.rpc(name, input).abortSignal(AbortSignal.timeout(20000));
  assert.equal(result.error, null, `${name} must succeed`);
  return result.data;
}
const capture = (run, batch = crypto.randomUUID()) => rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: batch });
const replace = fixture => rpc(service, "replace_traffic_demo", { p_fixture: fixture });
async function rows(table, run) {
  const result = await service.from(table).select("*").eq("run_id", run);
  assert.equal(result.error, null);
  return result.data;
}
// Missing migration fails before fixture or ledger mutations.
assert.equal((await service.from("incident_lifecycle_cycles").select("id").limit(1)).error, null);
const previous = await rpc(guest, "read_traffic_demo");
let changed = false;
after(async () => {
  const failures = [];
  for (const run of runs) {
    try { await rpc(service, "cleanup_speed_evidence", { p_run_id: run }); } catch (error) { failures.push(error); }
  }
  if (changed) {
    try { if (previous.fixture) await replace(previous.fixture); else await rpc(service, "reset_traffic_demo"); } catch (error) { failures.push(error); }
  }
  const restored = await rpc(guest, "read_traffic_demo");
  assert.deepEqual(restored.fixture, previous.fixture);
  assert.deepEqual(restored.reports, previous.reports);
  assert.equal(restored.reporting_enabled, previous.reporting_enabled);
  assert.equal(failures.length, 0, "All test-owned cleanup and fixture restoration must succeed");
});
const anchor = Date.now() - 13 * 60000;
function fixture(first, last, speed, partial = false) {
  const value = createTrafficFixture("normal", new Date(anchor + last * 60000).toISOString());
  value.observations = value.sources.flatMap(source => Array.from({ length: last - first + 1 }, (_, index) => ({
    segment_id: source.segment_id, source_id: source.id,
    observed_at: new Date(anchor + (first + index) * 60000).toISOString(),
    speed_kph: source.segment_id === "primary-west" ? speed : 30,
  })));
  if (partial) {
    const firstSource = value.sources.find(source => source.segment_id === "primary-west").id;
    value.observations = value.observations.filter(row => row.segment_id !== "primary-west" || row.source_id === firstSource);
  }
  return value;
}

test("concurrent immutable capture creates one slowdown-only cycle, withdraws, clears and reopens in order", async () => {
  changed = true;
  const run = newRun(), batch = crypto.randomUUID();
  await replace(fixture(-5, 0, 8));
  const results = await Promise.all(Array.from({ length: 6 }, () => capture(run, batch)));
  assert.equal(results.filter(row => !row.replayed).length, 1);
  assert.ok(results.every(row => row.status === "accepted"));
  const cycles = await rows("incident_lifecycle_cycles", run);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].segment_id, "primary-west");
  assert.equal(cycles[0].direction, "outbound");
  assert.equal(cycles[0].prior_cycle_id, null);
  const first = await rows("incident_lifecycle_events", run);
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, "supported");
  assert.equal(first[0].slow_source_count, 3);
  assert.equal((await rows("incident_lifecycle_event_samples", run)).length, 18);

  await replace(fixture(1, 1, 28, true));
  assert.equal((await capture(run)).status, "accepted");
  assert.equal((await rows("incident_lifecycle_events", run)).filter(row => row.kind === "withdrawn").length, 1);
  await replace(fixture(1, 1, 28));
  assert.equal((await capture(run)).status, "accepted");
  assert.equal((await rows("incident_lifecycle_events", run)).length, 2, "Equal-terminal completion cannot rewrite history");
  await replace(fixture(2, 6, 28));
  assert.equal((await capture(run)).status, "accepted");
  const cleared = (await rows("incident_lifecycle_events", run)).find(row => row.kind === "cleared");
  assert.ok(cleared);
  assert.equal(cleared.cycle_id, cycles[0].id);
  assert.equal(cleared.continuous_source_count, 3);
  assert.equal((await rows("incident_lifecycle_event_samples", run)).filter(row => row.event_id === cleared.event_id).length, 36);
  await replace(fixture(7, 12, 8));
  assert.equal((await capture(run)).status, "accepted");
  const reopened = await rows("incident_lifecycle_cycles", run);
  assert.equal(reopened.length, 2);
  assert.equal(reopened.find(row => row.id !== cycles[0].id).prior_cycle_id, cycles[0].id);
  assert.deepEqual((await rows("incident_lifecycle_events", run)).find(row => row.event_id === first[0].event_id), first[0]);
  const retained = await rows("incident_lifecycle_events", run);
  await rpc(service, "reset_traffic_demo");
  assert.deepEqual(await rows("incident_lifecycle_events", run), retained);
  await replace(fixture(7, 12, 28));
  const other = newRun();
  assert.equal((await capture(other)).status, "accepted");
  assert.deepEqual(await rows("incident_lifecycle_cycles", other), [], "Different run cannot inherit earlier slowdown");
  assert.deepEqual(await rows("incident_lifecycle_events", run), retained, "Different run cannot clear or overwrite old cycles");
});

test("public clients cannot read private lifecycle state or supply a projection/process clock", async () => {
  for (const table of tables) assert.equal((await guest.from(table).select("*")).error?.code, "42501");
  for (const client of [guest, service]) {
    assert.equal((await client.rpc("project_incident_lifecycle", { p_read_at: new Date().toISOString() })).error?.code, "42501");
    assert.equal((await client.rpc("process_incident_lifecycle", { p_run_id: crypto.randomUUID(), p_batch_id: crypto.randomUUID() })).error?.code, "42501");
  }
  for (const table of tables) {
    const key = table.endsWith("episode_links") ? "event_id" : "run_id";
    assert.equal((await service.from(table).delete().eq(key, crypto.randomUUID())).error?.code, "42501");
  }
  const current = await rpc(guest, "read_traffic_demo");
  assert.deepEqual(Object.keys(current).sort(), Object.keys(previous).sort(), "Original reporting snapshot envelope remains unchanged");
});
