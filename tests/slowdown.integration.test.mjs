import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parseTrafficSnapshot } from "../apps/web/src/lib/traffic/snapshot.ts";
import { assessSlowdown } from "../apps/web/src/lib/evidence/slowdown.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
// Run directly with node: the local status credentials arrive only through stdin.
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const anonymous = createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
const assessmentFields = ["segment_id", "direction", "status", "window_start", "window_end", "complete_source_count", "slow_source_count", "valid_until", "provenance"].sort();
const iso = time => new Date(time).toISOString();
const west = rows => rows.find(row => row.segment_id === "primary-west");
let previous;
let retained;
let prepared = false;

async function rpc(client, name, input) {
  const result = await client.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(result.error, null, `${name} must succeed`);
  return result.data;
}
async function retainedReports() {
  const state = {};
  for (const table of ["traffic_reports_private", "public_traffic_reports", "report_sources", "incident_episodes"]) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const page = await service.from(table).select("*").order("id").range(offset, offset + 499).abortSignal(AbortSignal.timeout(15000));
      assert.equal(page.error, null, "capture retained reports and retry/source records without modifying them");
      rows.push(...page.data);
      if (page.data.length < 500) break;
    }
    state[table] = rows;
  }
  return state;
}
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordered(entry)]));
  return value;
}
function canonical(timestamp) {
  const milliseconds = iso(Date.parse(timestamp));
  const remainder = /\.(\d{1,6})/.exec(timestamp)?.[1].padEnd(6, "0").slice(3) ?? "000";
  return Number(remainder) ? `${milliseconds.slice(0, -1)}${remainder}Z` : milliseconds;
}
async function read() {
  const raw = await rpc(anonymous, "read_traffic_demo");
  assert.deepEqual(Object.keys(raw).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
  const snapshot = parseTrafficSnapshot(raw);
  assert.equal(snapshot.read_at, canonical(raw.read_at), "the database clock must retain nonzero microseconds");
  const assessments = assessSlowdown(snapshot);
  assert.equal(assessments.length, snapshot.fixture?.segments.length ?? 0);
  for (const row of assessments) {
    assert.deepEqual(Object.keys(row).sort(), assessmentFields);
    assert.equal(row.provenance, "simulated");
    assert.ok(row.slow_source_count <= row.complete_source_count);
    assert.equal(snapshot.fixture.segments.find(segment => segment.id === row.segment_id)?.direction, row.direction);
  }
  return { snapshot, assessments };
}
async function currentFixture(scenario = "slowdown", offset = -2000) {
  const clock = await rpc(anonymous, "read_traffic_demo");
  return createTrafficFixture(scenario, iso(Date.parse(clock.read_at) + offset));
}
async function replace(fixture) {
  const result = await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
  assert.equal(result.observations, fixture.observations.length);
}
async function persist(fixture) {
  await replace(fixture);
  const result = await read();
  assert.deepEqual(ordered(result.snapshot.fixture), ordered(fixture), "ordinary RPC returns the exact persisted generation");
  return result;
}
function terminalOnly(fixture) {
  const start = Date.parse(fixture.corridor.anchor_at) - 300000;
  fixture.observations = fixture.observations.filter(row => row.segment_id === "primary-west" && Date.parse(row.observed_at) >= start);
  return fixture;
}

before(async () => {
  previous = await rpc(anonymous, "read_traffic_demo");
  parseTrafficSnapshot(previous);
  retained = await retainedReports();
  prepared = true;
  await rpc(service, "set_reporting_enabled", { p_enabled: false });
});
after(async () => {
  if (!prepared) return;
  const failures = [];
  const attempt = async operation => { try { await operation(); } catch (error) { failures.push(error); } };
  await attempt(async () => {
    if (previous.fixture) await replace(previous.fixture);
    else await rpc(service, "reset_traffic_demo");
  });
  await attempt(() => rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled }));
  await attempt(async () => {
    const restored = await rpc(anonymous, "read_traffic_demo");
    assert.deepEqual(ordered(restored.fixture), ordered(previous.fixture), "restore the original fixture, including its timestamp precision");
    assert.equal(restored.reporting_enabled, previous.reporting_enabled);
  });
  await attempt(async () => assert.ok(JSON.stringify(await retainedReports()) === JSON.stringify(retained), "all original reports, source identities and retry records must remain unchanged"));
  assert.equal(failures.length, 0, "fixture/gate restoration and retained-report preservation must all succeed");
});

test("real current-clock fixtures support only the directed slowdown segment and replacement is idempotent", async () => {
  const fixture = await currentFixture();
  let result = await persist(fixture);
  assert.equal(west(result.assessments).status, "supported");
  assert.equal(west(result.assessments).complete_source_count, 3);
  assert.equal(west(result.assessments).slow_source_count, 3);
  for (const row of result.assessments.filter(row => row.segment_id !== "primary-west")) {
    assert.equal(row.status, "not_supported");
    assert.equal(row.complete_source_count, 3);
    assert.equal(row.slow_source_count, 0);
  }
  const initial = result.assessments;
  result = await persist(fixture);
  assert.deepEqual(result.assessments, initial);
  for (const scenario of ["normal", "recovery"]) {
    result = await persist(createTrafficFixture(scenario, fixture.corridor.anchor_at));
    assert.equal(west(result.assessments).status, "not_supported", "loss of support does not claim recovery or clearance");
  }
});

test("changing only scenario names cannot change persisted L4 evidence", async () => {
  const fixture = await currentFixture();
  const expected = (await persist(fixture)).assessments;
  for (const scenario of ["normal", "recovery", "slowdown"]) {
    fixture.corridor.scenario = scenario;
    assert.deepEqual((await persist(fixture)).assessments, expected);
  }
});

test("numeric(6,2) serialization preserves strict threshold and unrounded baseline comparisons", async () => {
  const fixture = terminalOnly(await currentFixture());
  for (const [speed, status] of [[0, "supported"], [11.99, "supported"], [12, "not_supported"], [12.01, "not_supported"]]) {
    for (const row of fixture.observations) row.speed_kph = speed;
    const result = await persist(fixture);
    assert.equal(west(result.assessments).status, status);
    assert.ok(result.snapshot.fixture.observations.every(row => row.speed_kph === speed));
  }
  Object.assign(fixture.segments[0], { length_m: 1001, baseline_seconds: 144 });
  for (const row of fixture.observations) row.speed_kph = 10.01;
  assert.equal(west((await persist(fixture)).assessments).status, "not_supported", "exact 25.025 baseline must not round up to 25.03");
  for (const row of fixture.observations) row.speed_kph = 10;
  assert.equal(west((await persist(fixture)).assessments).status, "supported");
});

test("real microsecond samples retain cadence precision and floor expiry conservatively", async () => {
  const fixture = terminalOnly(await currentFixture());
  fixture.corridor.anchor_at = iso(Date.parse(fixture.corridor.anchor_at) + 1000);
  for (const row of fixture.observations) row.observed_at = row.observed_at.replace("Z", "123Z");
  const result = await persist(fixture);
  const row = west(result.assessments);
  assert.equal(row.status, "supported");
  assert.match(row.window_start, /\d{3}123Z$/);
  assert.match(row.window_end, /\d{3}123Z$/);
  assert.equal(row.valid_until, iso(Date.parse(row.window_start) + 1200000));
  for (const remainder of ["122", "124"]) {
    const irregular = structuredClone(fixture);
    irregular.observations[3].observed_at = irregular.observations[3].observed_at.replace(/123Z$/, `${remainder}Z`);
    const assessment = west((await persist(irregular)).assessments);
    assert.equal(assessment.status, "insufficient", "59.999999/60.000001 seconds is not a sixty-second interval");
    assert.equal(assessment.complete_source_count, 2);
  }
});

test("missing middle ticks, additional off-grid samples and newer incomplete sources exclude older favorable windows", async () => {
  const fixture = terminalOnly(await currentFixture());
  const missing = structuredClone(fixture);
  missing.observations.splice(3, 1);
  assert.equal(west((await persist(missing)).assessments).complete_source_count, 2);
  const offGrid = structuredClone(fixture);
  offGrid.observations.push({ ...offGrid.observations[0], observed_at: iso(Date.parse(offGrid.observations[0].observed_at) + 30000), speed_kph: 0 });
  assert.equal(west((await persist(offGrid)).assessments).complete_source_count, 2);
  const newer = structuredClone(fixture);
  const oldEnd = newer.corridor.anchor_at;
  newer.corridor.anchor_at = iso(Date.parse(oldEnd) + 1000);
  newer.sources.push({ id: "slowdown-test-new-source", segment_id: "primary-west", label: "SIMULATED incomplete source" });
  newer.observations.push({ ...newer.observations[0], source_id: "slowdown-test-new-source", observed_at: newer.corridor.anchor_at, speed_kph: 8 });
  const row = west((await persist(newer)).assessments);
  assert.equal(row.window_end, newer.corridor.anchor_at);
  assert.equal(row.status, "insufficient");
  assert.equal(row.complete_source_count, 0);
  const partial = await persist(fixture);
  assert.ok(partial.assessments.filter(row => row.segment_id !== "primary-west").every(row => row.status === "missing"));
  const empty = structuredClone(fixture);
  empty.observations = [];
  assert.ok((await service.rpc("replace_traffic_demo", { p_fixture: empty })).error, "The simulator rejects a completely empty observation collection.");
  const unchanged = await read();
  assert.deepEqual(unchanged.snapshot.fixture, partial.snapshot.fixture, "Rejected replacement preserves the previous fixture.");
  assert.deepEqual(unchanged.assessments, partial.assessments);
});

test("five timestamps and rotating real source cohorts remain insufficient", async () => {
  const fixture = terminalOnly(await currentFixture());
  const five = structuredClone(fixture);
  const start = iso(Date.parse(five.corridor.anchor_at) - 300000);
  five.observations = five.observations.filter(row => row.observed_at !== start);
  assert.equal(west((await persist(five)).assessments).complete_source_count, 0);
  const rotating = structuredClone(fixture);
  const boundary = iso(Date.parse(fixture.corridor.anchor_at) - 120000);
  for (const source of fixture.sources.filter(source => source.segment_id === "primary-west")) rotating.sources.push({ ...source, id: `${source.id}-later` });
  for (const row of rotating.observations) if (row.observed_at >= boundary) row.source_id += "-later";
  const assessment = west((await persist(rotating)).assessments);
  assert.equal(assessment.status, "insufficient");
  assert.equal(assessment.complete_source_count, 0);
});

test("real reads distinguish stale, future-only and mixed future samples without a caller clock", async () => {
  const stale = await currentFixture("slowdown", -16 * 60000);
  let row = west((await persist(stale)).assessments);
  assert.equal(row.status, "stale");
  assert.equal(row.complete_source_count, 0);
  assert.equal(row.slow_source_count, 0);
  assert.equal(row.valid_until, null);
  const future = await currentFixture("slowdown", 30 * 60000);
  row = west((await persist(future)).assessments);
  assert.equal(row.status, "future");
  assert.equal(row.window_start, null);
  assert.equal(row.valid_until, iso(Date.parse(future.corridor.anchor_at) - 11 * 60000));
  const mixed = terminalOnly(await currentFixture());
  const currentEnd = mixed.corridor.anchor_at;
  mixed.corridor.anchor_at = iso(Date.parse(currentEnd) + 60000);
  const next = mixed.corridor.anchor_at.replace("Z", "789Z");
  mixed.corridor.anchor_at = iso(Date.parse(mixed.corridor.anchor_at) + 1000);
  mixed.observations.push({ ...mixed.observations[0], observed_at: next, speed_kph: 30 });
  row = west((await persist(mixed)).assessments);
  assert.equal(row.status, "supported");
  assert.equal(row.window_end, currentEnd);
  assert.equal(row.valid_until, iso(Date.parse(next)));
  assert.ok((await anonymous.rpc("read_traffic_demo", { read_at: currentEnd })).error, "no public historical-clock overload");
});

test("snapshot boundary rejects invalid baselines, duplicates and cross-direction source bindings atomically", async () => {
  const fixture = await currentFixture();
  await persist(fixture);
  for (const mutate of [
    value => { value.segments[0].baseline_seconds = 0; },
    value => { delete value.segments[0].length_m; },
    value => { value.observations.push({ ...value.observations[0] }); },
    value => { value.observations[0].source_id = "primary-west-inbound-source-1"; },
  ]) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    const result = await service.rpc("replace_traffic_demo", { p_fixture: invalid }).abortSignal(AbortSignal.timeout(15000));
    assert.ok(result.error, "invalid replacement must be rejected");
    const current = await read();
    assert.deepEqual(ordered(current.snapshot.fixture), ordered(fixture), "rejected mutations leave the current fixture unchanged");
    assert.equal(west(current.assessments).status, "supported");
  }
});

test("reset hides all assessments but preserves reports and restores the same fixture", async () => {
  const fixture = await currentFixture();
  const prior = await persist(fixture);
  await rpc(service, "reset_traffic_demo");
  const empty = await read();
  assert.equal(empty.snapshot.fixture, null);
  assert.deepEqual(empty.snapshot.reports, []);
  assert.deepEqual(empty.snapshot.report_assessments, []);
  assert.deepEqual(empty.snapshot.incident_episodes, []);
  assert.deepEqual(empty.assessments, []);
  assert.ok(JSON.stringify(await retainedReports()) === JSON.stringify(retained), "reset must not delete unrelated reports or retry records");
  const restored = await persist(fixture);
  assert.deepEqual(restored.snapshot.reports, prior.snapshot.reports);
  assert.deepEqual(restored.snapshot.incident_episodes, prior.snapshot.incident_episodes);
  assert.deepEqual(restored.assessments, prior.assessments);
});

test("concurrent replacement/reset and public reads never combine fixture generations", async () => {
  const slowdown = await currentFixture();
  const normal = createTrafficFixture("normal", slowdown.corridor.anchor_at);
  await replace(slowdown);
  const snapshots = [];
  const capture = async () => snapshots.push(await read());
  for (let round = 0; round < 4; round++) {
    const operations = await Promise.allSettled([
      capture(), replace(normal), capture(), rpc(service, "reset_traffic_demo"), capture(), replace(slowdown), capture(),
    ]);
    for (const operation of operations) if (operation.status === "rejected") throw operation.reason;
  }
  assert.equal(snapshots.length, 16);
  for (const { snapshot, assessments } of snapshots) {
    if (!snapshot.fixture) {
      assert.deepEqual(assessments, []);
      assert.deepEqual(snapshot.reports, []);
      continue;
    }
    const expected = snapshot.fixture.corridor.scenario === "slowdown" ? slowdown : normal;
    assert.deepEqual(ordered(snapshot.fixture), ordered(expected));
    assert.equal(west(assessments).status, expected === slowdown ? "supported" : "not_supported");
    assert.equal(west(assessments).complete_source_count, 3);
    assert.equal(west(assessments).slow_source_count, expected === slowdown ? 3 : 0);
  }
});
