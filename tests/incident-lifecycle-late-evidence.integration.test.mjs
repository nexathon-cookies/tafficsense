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
async function rpc(client, name, input) {
  const result = await client.rpc(name, input).abortSignal(AbortSignal.timeout(20000));
  assert.equal(result.error, null, `${name} must succeed`);
  return result.data;
}
const before = await rpc(guest, "read_traffic_phase4");
const run = crypto.randomUUID();
let prepared = false;
after(async () => {
  const failures = [];
  for (const action of [
    () => rpc(service, "cleanup_speed_evidence", { p_run_id: run }),
    async () => { if (prepared) await rpc(service, before.traffic.fixture ? "replace_traffic_demo" : "reset_traffic_demo", before.traffic.fixture ? { p_fixture: before.traffic.fixture } : undefined); },
  ]) {
    try { await action(); } catch (error) { failures.push(error); }
  }
  const restored = await rpc(guest, "read_traffic_phase4");
  assert.deepEqual(restored.traffic.fixture, before.traffic.fixture);
  assert.deepEqual(restored.traffic.reports, before.traffic.reports);
  assert.equal(restored.traffic.reporting_enabled, before.traffic.reporting_enabled);
  assert.equal(failures.length, 0, "Test-owned cleanup and fixture restoration must succeed");
});
const anchor = Date.now() - 8 * 60000;
const time = tick => new Date(anchor + tick * 60000).toISOString();
function fixture(first, last, mode = "all") {
  const value = createTrafficFixture("normal", time(last));
  value.sources.push({ id: "late-extra", segment_id: "primary-west", label: "SIMULATED extra source" });
  value.observations = value.sources.flatMap(source => {
    if (source.segment_id === "primary-west" && ((mode === "extra") !== (source.id === "late-extra"))) return [];
    if (mode === "partial" && source.segment_id === "primary-west" && source.id !== "primary-west-source-1") return [];
    return Array.from({ length: last - first + 1 }, (_, index) => ({ source_id: source.id, segment_id: source.segment_id,
      observed_at: time(first + index), speed_kph: source.segment_id === "primary-west" ? 8 : 30 }));
  });
  return value;
}
const capture = async value => {
  await rpc(service, "replace_traffic_demo", { p_fixture: value });
  assert.equal((await rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: crypto.randomUUID() })).status, "accepted");
};
async function history() {
  const saved = {};
  for (const name of ["cycles", "events", "event_samples", "cursors"]) {
    const result = await service.from(`incident_lifecycle_${name}`).select("*").eq("run_id", run);
    assert.equal(result.error, null);
    saved[name] = result.data.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return saved;
}
const incident = async id => (await rpc(guest, "read_traffic_phase4")).incidents.find(row => row.id === id);

test("public reads withdraw late-invalidated support without history mutation or equal-terminal repromotion", async () => {
  prepared = true;
  const initial = fixture(-5, 0);
  await capture(initial);
  const saved = await history(), id = saved.cycles[0].id;
  assert.equal((await incident(id)).state, "supported");
  initial.observations.push({ segment_id: "primary-west", source_id: "primary-west-source-1", observed_at: time(-0.5), speed_kph: 8 });
  await capture(initial);
  assert.equal((await incident(id)).state, "unconfirmed");
  assert.equal((await incident(id)).cleared_at, null);
  assert.deepEqual(await history(), saved, "Accepted off-grid evidence and repeated public reads cannot change events, references or cursor");
  await capture(fixture(-5, 0, "extra"));
  assert.equal((await incident(id)).state, "unconfirmed", "An extra favorable cohort cannot erase earlier equal-terminal withdrawal");
  assert.deepEqual(await history(), saved);
  await capture(fixture(1, 6));
  assert.equal((await incident(id)).state, "supported", "A new processed terminal restores support normally");
  assert.equal((await history()).events.length, 2);
  await capture(fixture(7, 7, "partial"));
  const withdrawn = await history();
  assert.equal((await incident(id)).state, "unconfirmed");
  await capture(fixture(7, 7));
  assert.equal((await incident(id)).state, "unconfirmed", "A persisted withdrawal cannot be promoted by equal-terminal completion");
  assert.deepEqual(await history(), withdrawn);
  await capture(fixture(8, 8));
  assert.equal((await incident(id)).state, "supported");
  assert.ok((await history()).events.every(row => row.kind !== "cleared"));
});
