import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const anonymous = () => createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
const tables = ["runs", "segments", "sources", "batches", "observations", "batch_samples"].map(name => `speed_evidence_${name}`);
const runs = [];
const users = [];
const reportSources = [];
const newRun = () => { const id = crypto.randomUUID(); runs.push(id); return id; };
const args = (run, batch) => ({ p_run_id: run, p_batch_id: batch });
async function rpc(who, name, input) {
  const result = await who.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(result.error, null, `${name} must succeed`);
  return result.data;
}
const capture = (run, batch) => rpc(service, "capture_speed_evidence", args(run, batch));
const check = (run, batch) => rpc(service, "check_speed_evidence", args(run, batch));
const cleanup = run => rpc(service, "cleanup_speed_evidence", { p_run_id: run });
const replace = fixture => rpc(service, "replace_traffic_demo", { p_fixture: fixture });
const fresh = (offset = 0) => createTrafficFixture("normal", new Date(Date.now() - 10000 + offset).toISOString());
async function rows(table, run) {
  const order = {
    speed_evidence_runs: [], speed_evidence_segments: ["segment_id"], speed_evidence_sources: ["source_id"],
    speed_evidence_batches: ["batch_id"], speed_evidence_observations: ["source_id", "observed_at"],
    speed_evidence_batch_samples: ["batch_id", "ordinal"],
  };
  const values = [];
  for (let offset = 0; ; offset += 1000) {
    let query = service.from(table).select("*").order("run_id");
    if (run !== undefined) query = query.eq("run_id", run);
    for (const key of order[table]) query = query.order(key);
    const result = await query.range(offset, offset + 999);
    assert.equal(result.error, null);
    values.push(...result.data);
    if (result.data.length < 1000) return values;
  }
}
async function ledger(run) {
  const value = {};
  for (const table of tables) value[table.replace("speed_evidence_", "")] = await rows(table, run);
  return value;
}
const ordered = values => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const canonicalTime = value => value.replace(/\+00:00$/, "Z").replace(/(?:\.(\d{1,6}))?Z$/, (_match, fraction = "") => `.${fraction.padEnd(6, "0")}Z`);
function expectedGeneration(fixture) {
  const direction = id => fixture.segments.find(segment => segment.id === id).direction;
  const observations = fixture.observations.map(sample => ({ source_id: sample.source_id, observed_at: canonicalTime(sample.observed_at),
    segment_id: sample.segment_id, direction: direction(sample.segment_id), speed_kph: sample.speed_kph }));
  const membership = [...observations].sort((a, b) => a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : a.observed_at.localeCompare(b.observed_at));
  return {
    corridor_id: fixture.corridor.id, anchor_at: canonicalTime(fixture.corridor.anchor_at),
    segments: ordered(fixture.segments.map(segment => ({ segment_id: segment.id, direction: segment.direction,
      length_m: segment.length_m, baseline_seconds: segment.baseline_seconds, baseline_label: segment.baseline_label }))),
    sources: ordered(fixture.sources.map(source => ({ source_id: source.id, segment_id: source.segment_id,
      direction: direction(source.segment_id), label: source.label }))),
    observations: ordered(observations),
    batch_samples: membership.map((sample, index) => ({ source_id: sample.source_id, observed_at: sample.observed_at, ordinal: index + 1 })),
  };
}
function archivedGeneration(saved, ack) {
  assert.equal(saved.runs.length, 1);
  assert.equal(saved.batches.length, 1);
  assert.equal(saved.runs[0].created_at, ack.accepted_at);
  assert.equal(saved.runs[0].provenance, "simulated");
  const batch = saved.batches[0];
  assert.equal(batch.batch_id, ack.batch_id);
  assert.equal(batch.accepted_at, ack.accepted_at);
  assert.equal(batch.observation_count, ack.observation_count);
  assert.equal(batch.inserted_observation_count, ack.inserted_observation_count);
  assert.ok(saved.observations.every(sample => sample.first_batch_id === ack.batch_id));
  return {
    corridor_id: saved.runs[0].corridor_id, anchor_at: canonicalTime(batch.anchor_at),
    segments: ordered(saved.segments.map(segment => ({ segment_id: segment.segment_id, direction: segment.direction,
      length_m: segment.length_m, baseline_seconds: segment.baseline_seconds, baseline_label: segment.baseline_label }))),
    sources: ordered(saved.sources.map(source => ({ source_id: source.source_id, segment_id: source.segment_id,
      direction: source.direction, label: source.label }))),
    observations: ordered(saved.observations.map(sample => ({ source_id: sample.source_id, observed_at: canonicalTime(sample.observed_at),
      segment_id: sample.segment_id, direction: sample.direction, speed_kph: sample.speed_kph }))),
    batch_samples: saved.batch_samples.map(sample => ({ source_id: sample.source_id, observed_at: canonicalTime(sample.observed_at), ordinal: sample.ordinal })),
  };
}
function accepted(value, run, batch, count, inserted, replayed) {
  assert.deepEqual(Object.keys(value).sort(), ["status", "run_id", "batch_id", "accepted_at", "observation_count", "inserted_observation_count", "replayed"].sort());
  assert.equal(value.status, "accepted");
  assert.equal(value.run_id, run);
  assert.equal(value.batch_id, batch);
  assert.ok(Number.isFinite(Date.parse(value.accepted_at)));
  assert.equal(value.observation_count, count);
  assert.equal(value.inserted_observation_count, inserted);
  assert.equal(value.replayed, replayed);
}
function projection(value) {
  assert.deepEqual(Object.keys(value).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
  assert.ok(!JSON.stringify(value).includes("speed_evidence"));
}

// Missing schema fails before any fixture, Auth, settings or ledger mutation.
assert.deepEqual(await check(crypto.randomUUID(), crypto.randomUUID()), { status: "not_found" });
const previous = await rpc(anonymous(), "read_traffic_demo");
projection(previous);
const previousLedger = await ledger();
let prepared = false;
after(async () => {
  const failures = [];
  const attempt = async fn => { try { await fn(); } catch (error) { failures.push(error); } };
  for (const run of runs) await attempt(() => cleanup(run));
  if (reportSources.length) await attempt(() => rpc(service, "cleanup_traffic_reports", { p_source_ids: reportSources }));
  for (const id of users) await attempt(async () => assert.equal((await service.auth.admin.deleteUser(id)).error, null));
  if (prepared) {
    await attempt(() => previous.fixture ? replace(previous.fixture) : rpc(service, "reset_traffic_demo"));
    await attempt(() => rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled }));
  }
  await attempt(async () => {
    assert.deepEqual(await ledger(), previousLedger, "all pre-existing ledger rows are unchanged");
    const restored = await rpc(anonymous(), "read_traffic_demo");
    assert.deepEqual(restored.fixture, previous.fixture);
    assert.deepEqual(restored.reports, previous.reports);
    assert.deepEqual(restored.incident_episodes, previous.incident_episodes);
    assert.equal(restored.reporting_enabled, previous.reporting_enabled);
  });
  assert.equal(failures.length, 0, "owned cleanup and exact fixture/report/gate restoration must succeed");
});

test("capture archives descriptors, strict acknowledgements and immutable original retries", async () => {
  prepared = true;
  const fixture = fresh();
  await replace(fixture);
  const before = await rpc(anonymous(), "read_traffic_demo");
  const run = newRun(), batch = crypto.randomUUID();
  const first = await capture(run, batch);
  accepted(first, run, batch, fixture.observations.length, fixture.observations.length, false);
  assert.deepEqual(await capture(run, batch), { ...first, replayed: true });
  assert.deepEqual(await check(run, batch), { ...first, replayed: true });
  const segments = await rows("speed_evidence_segments", run);
  assert.equal(segments.length, fixture.segments.length);
  for (const segment of segments) {
    const original = fixture.segments.find(value => value.id === segment.segment_id);
    assert.deepEqual(segment, { run_id: run, segment_id: original.id, direction: original.direction, length_m: original.length_m, baseline_seconds: original.baseline_seconds, baseline_label: original.baseline_label });
  }
  const sources = await rows("speed_evidence_sources", run);
  assert.equal(sources.length, fixture.sources.length);
  for (const source of sources) {
    const original = fixture.sources.find(value => value.id === source.source_id);
    assert.deepEqual(source, { run_id: run, source_id: original.id, segment_id: original.segment_id, direction: fixture.segments.find(value => value.id === original.segment_id).direction, label: original.label });
  }
  assert.equal((await rows("speed_evidence_observations", run)).length, fixture.observations.length);
  assert.equal((await rows("speed_evidence_batch_samples", run)).length, fixture.observations.length);
  const afterCapture = await rpc(anonymous(), "read_traffic_demo");
  projection(afterCapture);
  assert.deepEqual({ ...afterCapture, read_at: before.read_at }, before);
});

test("overlapping equal-anchor batches deduplicate, late samples retain their first acceptance", async () => {
  const fixture = fresh();
  const full = structuredClone(fixture);
  fixture.observations = fixture.observations.slice(15);
  await replace(fixture);
  const run = newRun(), firstBatch = crypto.randomUUID(), secondBatch = crypto.randomUUID();
  accepted(await capture(run, firstBatch), run, firstBatch, 165, 165, false);
  await replace(full);
  accepted(await capture(run, secondBatch), run, secondBatch, 180, 15, false);
  const samples = await rows("speed_evidence_observations", run);
  assert.equal(samples.length, 180);
  assert.equal(samples.filter(row => row.first_batch_id === firstBatch).length, 165);
  assert.equal(samples.filter(row => row.first_batch_id === secondBatch).length, 15);
  assert.equal((await rows("speed_evidence_batch_samples", run)).length, 345);
  const next = structuredClone(full);
  next.corridor.anchor_at = new Date(Date.parse(full.corridor.anchor_at) + 1000).toISOString();
  next.observations = next.observations.slice(15);
  await replace(next);
  const thirdBatch = crypto.randomUUID();
  accepted(await capture(run, thirdBatch), run, thirdBatch, 165, 0, false);
  await replace(full);
  assert.deepEqual(await capture(run, crypto.randomUUID()), { status: "conflict" });
});

test("speed, baseline, label, roster and binding conflicts reject entire batches", async () => {
  const fixture = fresh();
  await replace(fixture);
  const run = newRun(), batch = crypto.randomUUID();
  const first = await capture(run, batch);
  const mutations = [
    value => { value.observations[0].speed_kph += 0.01; },
    value => { value.segments[0].baseline_seconds += 1; },
    value => { value.segments[0].baseline_label += " changed"; },
    value => { value.sources[0].label += " changed"; },
    value => { value.sources.push({ ...value.sources[0], id: "extra-source" }); },
    value => {
      const source = value.sources[0];
      source.segment_id = value.segments[1].id;
      for (const sample of value.observations.filter(row => row.source_id === source.id)) sample.segment_id = source.segment_id;
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(fixture);
    mutate(changed);
    await replace(changed);
    assert.deepEqual(await capture(run, batch), { status: "conflict" });
    assert.deepEqual(await capture(run, crypto.randomUUID()), { status: "conflict" });
    assert.equal((await rows("speed_evidence_batches", run)).length, 1);
    assert.equal((await rows("speed_evidence_observations", run)).length, 180);
    assert.deepEqual(await check(run, batch), { ...first, replayed: true });
  }
});

test("null IDs, missing fixture, stale and future input fail without partial allocation", async () => {
  assert.deepEqual(await capture(null, crypto.randomUUID()), { status: "invalid" });
  assert.deepEqual(await check(crypto.randomUUID(), null), { status: "invalid" });
  assert.deepEqual(await cleanup(null), { status: "invalid" });
  await rpc(service, "reset_traffic_demo");
  const run = newRun();
  assert.deepEqual(await capture(run, crypto.randomUUID()), { status: "unavailable" });
  for (const offset of [-21 * 60000, 2 * 60000]) {
    await replace(fresh(offset));
    assert.deepEqual(await capture(run, crypto.randomUUID()), { status: "invalid" });
  }
  for (const table of tables) assert.deepEqual(await rows(table, run), []);
});

test("identical and conflicting HTTP captures serialize, replacement never mixes generations", async () => {
  const fixture = fresh();
  await replace(fixture);
  const run = newRun(), batch = crypto.randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => capture(run, batch)));
  assert.equal(results.filter(row => !row.replayed).length, 1);
  assert.ok(results.every(row => row.status === "accepted"));
  const changed = structuredClone(fixture);
  changed.observations[0].speed_kph += 1;
  await replace(changed);
  assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => capture(run, batch))), Array.from({ length: 4 }, () => ({ status: "conflict" })));
  const generations = [structuredClone(fixture), structuredClone(fixture)];
  for (const [index, generation] of generations.entries()) {
    generation.corridor.anchor_at = new Date(Date.parse(fixture.corridor.anchor_at) + index * 1000).toISOString();
    for (const [position, segment] of generation.segments.entries()) {
      segment.length_m += index * (111 + position);
      segment.baseline_seconds += index * (17 + position);
      segment.baseline_label = `Synthetic generation ${index}, segment ${position}`;
    }
    for (const [position, source] of generation.sources.entries()) source.label = `Synthetic generation ${index}, source ${position}`;
    for (const [position, sample] of generation.observations.entries()) {
      sample.observed_at = new Date(Date.parse(sample.observed_at) + index * 1000).toISOString();
      sample.speed_kph += index * (1 + position % 3);
    }
  }
  const expected = generations.map(expectedGeneration);
  assert.ok(!isDeepStrictEqual(expected[0], expected[1]));
  await replace(generations[0]);
  for (let round = 0; round < 6; round++) {
    const current = newRun(), key = crypto.randomUUID();
    const outcomes = await Promise.all([replace(generations[round % 2]), capture(current, key), replace(generations[1 - round % 2])]);
    accepted(outcomes[1], current, key, 180, 180, false);
    const archived = archivedGeneration(await ledger(current), outcomes[1]);
    assert.equal(expected.filter(generation => isDeepStrictEqual(archived, generation)).length, 1,
      "every archived descriptor, binding, sample, membership and anchor must match one whole generation");
  }
});

test("anon/authenticated access and every direct service mutation are denied", async () => {
  await replace(fresh());
  const run = newRun(), batch = crypto.randomUUID();
  await capture(run, batch);
  const signed = anonymous();
  const created = await service.auth.admin.createUser({ email: `speed-evidence-${crypto.randomUUID()}@example.test`, password: `Test-${run}!`, email_confirm: true });
  assert.equal(created.error, null);
  users.push(created.data.user.id);
  assert.equal((await signed.auth.signInWithPassword({ email: created.data.user.email, password: `Test-${run}!` })).error, null);
  for (const who of [anonymous(), signed]) {
    for (const table of tables) assert.equal((await who.from(table).select("*")).error?.code, "42501");
    for (const name of ["capture_speed_evidence", "check_speed_evidence", "cleanup_speed_evidence"]) {
      assert.equal((await who.rpc(name, name === "cleanup_speed_evidence" ? { p_run_id: run } : args(run, batch))).error?.code, "42501");
    }
    projection(await rpc(who, "read_traffic_demo"));
  }
  for (const table of tables) {
    assert.equal((await service.from(table).delete().eq("run_id", run)).error?.code, "42501");
    assert.equal((await service.from(table).update({ run_id: run }).eq("run_id", run)).error?.code, "42501");
    assert.equal((await service.from(table).insert((await rows(table, run))[0])).error?.code, "42501");
  }
});

test("check survives reset and source cleanup; run cleanup is strict and repeatable", async () => {
  const fixture = fresh();
  await replace(fixture);
  const run = newRun(), other = newRun(), batch = crypto.randomUUID();
  const first = await capture(run, batch), second = await capture(other, batch);
  const saved = await ledger(run), savedOther = await ledger(other);
  const signed = anonymous();
  const email = `speed-evidence-source-${crypto.randomUUID()}@example.test`, password = `Test-${run}!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  const userId = created.data.user.id;
  users.push(userId);
  assert.equal((await signed.auth.signInWithPassword({ email, password })).error, null);
  await rpc(service, "set_reporting_enabled", { p_enabled: true });
  const source = await rpc(signed, "prepare_report_source");
  assert.equal(source.status, "ready");
  reportSources.push(source.source.id);
  const stored = await service.from("report_sources").select("id,user_id").eq("id", source.source.id).single();
  assert.equal(stored.error, null);
  assert.equal(stored.data.user_id, userId);
  assert.deepEqual(await rpc(service, "cleanup_traffic_reports", { p_source_ids: [source.source.id] }), { status: "ready", sources_removed: 1 });
  const removed = await service.from("report_sources").select("id").eq("id", source.source.id);
  assert.equal(removed.error, null);
  assert.deepEqual(removed.data, []);
  assert.deepEqual(await ledger(run), saved);
  assert.deepEqual(await ledger(other), savedOther);
  assert.deepEqual(await check(run, batch), { ...first, replayed: true });
  assert.equal((await service.auth.admin.deleteUser(userId)).error, null);
  users.splice(users.indexOf(userId), 1);
  assert.deepEqual(await ledger(run), saved);
  assert.deepEqual(await ledger(other), savedOther);
  assert.deepEqual(await check(run, batch), { ...first, replayed: true });
  assert.deepEqual(await check(other, batch), { ...second, replayed: true });
  await rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled });
  await rpc(service, "reset_traffic_demo");
  assert.deepEqual(await check(run, batch), { ...first, replayed: true });
  assert.deepEqual(await capture(run, batch), { status: "conflict" });
  await replace(fixture);
  const before = await rpc(anonymous(), "read_traffic_demo");
  assert.deepEqual(await cleanup(run), { status: "ready", removed: true });
  assert.deepEqual(await cleanup(run), { status: "ready", removed: false });
  assert.deepEqual(await check(run, batch), { status: "not_found" });
  assert.deepEqual(await check(other, batch), { ...second, replayed: true });
  for (const table of tables) assert.deepEqual(await rows(table, run), []);
  const afterCleanup = await rpc(anonymous(), "read_traffic_demo");
  assert.deepEqual({ ...afterCleanup, read_at: before.read_at }, before);
  accepted(await capture(run, batch), run, batch, 180, 180, false);
});

const operatorPath = new URL("../scripts/operate-speed-evidence.mjs", import.meta.url);
function operate(arguments_, status = credentials) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [operatorPath.pathname, ...arguments_], {
      env: process.env, stdio: ["pipe", "pipe", "pipe"], timeout: 20000,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(status));
  });
}
test("committed capture response loss is recovered by the original CLI check before and after reset", { skip: !existsSync(operatorPath) }, async () => {
  await replace(fresh());
  const run = newRun(), batch = crypto.randomUUID();
  let requests = 0, committed, dropped = false;
  const dropping = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, {
    ...options,
    global: { fetch: async (input, init) => {
      assert.ok(String(input).endsWith("/rpc/capture_speed_evidence"));
      requests++;
      const response = await fetch(input, init);
      assert.ok(response.ok, "real capture must commit successfully before its response is dropped");
      committed = await response.json();
      accepted(committed, run, batch, 180, 180, false);
      dropped = true;
      throw new Error("Test-owned committed response dropped");
    } },
  });
  const lost = await dropping.rpc("capture_speed_evidence", args(run, batch)).abortSignal(AbortSignal.timeout(15000));
  assert.equal(requests, 1, "unknown outcomes must not trigger silent capture retries");
  assert.equal(lost.data, null);
  assert.ok(lost.error, "caller must observe failure despite the real committed capture");
  assert.equal(dropped, true, "the drop must occur only after validating the successful real response");
  accepted(committed, run, batch, 180, 180, false);
  const original = { ...committed, replayed: true };
  const saved = await ledger(run);
  const recovered = await operate(["check", run, batch]);
  assert.equal(recovered.code, 0);
  assert.equal(recovered.stderr, "");
  assert.ok(recovered.stdout.includes(`run ${run}, batch ${batch}, accepted ${committed.accepted_at}; ${committed.observation_count} samples, ${committed.inserted_observation_count} originally inserted.`));
  assert.deepEqual(await check(run, batch), original);
  assert.deepEqual(await capture(run, batch), original);
  assert.deepEqual(await ledger(run), saved, "check and explicit identical retry must allocate nothing");
  await rpc(service, "reset_traffic_demo");
  const afterReset = await operate(["check", run, batch]);
  assert.deepEqual(afterReset, recovered, "the same CLI check retains exact original acceptance metadata after reset");
  assert.deepEqual(await check(run, batch), original);
  assert.deepEqual(await ledger(run), saved);
  assert.equal(saved.batches.length, 1);
  assert.equal(saved.observations.length, 180);
  assert.equal(saved.batch_samples.length, 180);
});

test("local CLI captures, replays, checks reset outcomes and confirms isolated cleanup", { skip: !existsSync(operatorPath) }, async () => {
  await replace(fresh());
  const run = newRun(), batch = crypto.randomUUID();
  for (const [command, pattern] of [["capture", /SIMULATED captured/], ["capture", /retained acknowledgement/], ["check", /retained acknowledgement/]]) {
    const result = await operate([command, run, batch]);
    assert.equal(result.code, 0, "CLI must accept real database acknowledgements");
    assert.equal(result.stderr, "");
    assert.match(result.stdout, pattern);
  }
  await rpc(service, "reset_traffic_demo");
  assert.equal((await operate(["check", run, batch])).code, 0);
  const conflict = await operate(["capture", run, batch]);
  assert.equal(conflict.code, 1);
  assert.match(conflict.stderr, /conflict/);
  const denied = await operate(["check", run, batch], { ...credentials, SERVICE_ROLE_KEY: credentials.ANON_KEY });
  assert.equal(denied.code, 1);
  for (const key of [credentials.ANON_KEY, credentials.SERVICE_ROLE_KEY]) assert.ok(!denied.stderr.includes(key));
  assert.equal((await operate(["cleanup", run])).code, 1);
  assert.equal((await check(run, batch)).status, "accepted");
  assert.equal((await operate(["cleanup", run, "--confirm"])).code, 0);
  assert.equal((await operate(["cleanup", run, "--confirm"])).code, 0);
  const missing = await operate(["check", run, batch]);
  assert.equal(missing.code, 0);
  assert.match(missing.stdout, /No retained acknowledgement/);
});
