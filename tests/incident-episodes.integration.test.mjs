import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const client = () => createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
const episodeFields = ["id", "segment_id", "direction", "created_at", "first_observed_at", "last_observed_at", "report_count", "provenance"].sort();
const metadataFields = ["id", "segment_id", "direction", "created_at", "provenance"].sort();
const reportFields = ["id", "episode_id", "segment_id", "direction", "category", "observed_at", "received_at", "provenance", "location_provenance"].sort();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function rpc(who, name, input) {
  const result = await who.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(result.error, null, `${name} must succeed`);
  return result.data;
}
function verify(value) {
  assert.deepEqual(Object.keys(value).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
  assert.ok(Array.isArray(value.incident_episodes));
  assert.equal(new Set(value.incident_episodes.map(row => row.id)).size, value.incident_episodes.length);
  for (const report of value.reports) {
    assert.deepEqual(Object.keys(report).sort(), reportFields);
    assert.match(report.episode_id, uuid);
    assert.ok(value.incident_episodes.some(row => row.id === report.episode_id));
  }
  for (const row of value.incident_episodes) {
    assert.deepEqual(Object.keys(row).sort(), episodeFields);
    assert.match(row.id, uuid);
    assert.equal(row.provenance, "simulated");
    const members = value.reports.filter(report => report.episode_id === row.id);
    assert.ok(members.length > 0);
    assert.equal(row.report_count, members.length);
    assert.ok(members.every(report => report.segment_id === row.segment_id && report.direction === row.direction));
    assert.equal(Date.parse(row.first_observed_at), Math.min(...members.map(report => Date.parse(report.observed_at))));
    assert.equal(Date.parse(row.last_observed_at), Math.max(...members.map(report => Date.parse(report.observed_at))));
    assert.ok(value.fixture.segments.some(segment => segment.id === row.segment_id && segment.direction === row.direction));
  }
  if (!value.fixture) {
    assert.deepEqual(value.reports, []);
    assert.deepEqual(value.incident_episodes, []);
  }
}

// This probe performs no writes, including when the schema is missing.
const previous = await rpc(client(), "read_traffic_demo");
assert.ok(Array.isArray(previous.incident_episodes), "incident episode schema must expose incident_episodes before any test mutation");
verify(previous);
const schemaOnly = process.env.EPISODES_SCHEMA_ONLY === "true";
test("episode schema read-only probe", () => verify(previous));

if (!schemaOnly) {
  const users = [];
  const sources = [];
  const raceSegment = `episode-race-${crypto.randomUUID()}`;
  let raceCatalogCreated = false;
  const fixture = createTrafficFixture("slowdown", "2026-10-15T04:00:00.000Z");
  let prepared = false;
  async function actor(guest = false) {
    const who = client();
    let id;
    if (guest) {
      const signed = await who.auth.signInAnonymously();
      assert.equal(signed.error, null);
      id = signed.data.user.id;
    } else {
      const email = `episodes-${crypto.randomUUID()}@example.test`;
      const password = `Test-${crypto.randomUUID()}!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      id = created.data.user.id;
      users.push(id);
      assert.equal((await who.auth.signInWithPassword({ email, password })).error, null);
    }
    if (!users.includes(id)) users.push(id);
    const ready = await rpc(who, "prepare_report_source");
    assert.equal(ready.status, "ready");
    sources.push(ready.source.id);
    return { who, id, ready };
  }
  function input(actor, overrides = {}) {
    return { source_id: actor.ready.source.id, request_id: crypto.randomUUID(), segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: new Date(Date.parse(actor.ready.read_at) - 60000).toISOString(), ...overrides };
  }
  const submit = (actor, value) => rpc(actor.who, "submit_traffic_report", { p_input: value });
  async function snapshot(who = client()) {
    const value = await rpc(who, "read_traffic_demo");
    verify(value);
    return value;
  }
  before(async () => {
    prepared = true;
    await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
    await rpc(service, "set_reporting_enabled", { p_enabled: true });
  });
  after(async () => {
    if (!prepared) return;
    const failures = [];
    const attempt = async operation => { try { await operation(); } catch (error) { failures.push(error); } };
    if (sources.length) await attempt(() => rpc(service, "cleanup_traffic_reports", { p_source_ids: sources }));
    for (const id of users) await attempt(async () => assert.equal((await service.auth.admin.deleteUser(id)).error, null));
    await attempt(() => previous.fixture ? rpc(service, "replace_traffic_demo", { p_fixture: previous.fixture }) : rpc(service, "reset_traffic_demo"));
    if (raceCatalogCreated) {
      await attempt(async () => assert.equal((await service.from("incident_episodes").delete().eq("segment_id", raceSegment)).error, null));
      await attempt(async () => assert.equal((await service.from("report_segment_catalog").delete().eq("id", raceSegment)).error, null));
    }
    await attempt(() => rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled }));
    await attempt(async () => {
      const restored = await snapshot();
      assert.deepEqual(restored.reports, previous.reports, "unrelated public reports are unchanged");
      assert.deepEqual(restored.incident_episodes, previous.incident_episodes, "unrelated public episode summaries are unchanged");
    });
    assert.equal(failures.length, 0, "test-owned cleanup and prior fixture/gate restoration must succeed");
  });

  test("simultaneous new submissions, retries and conflicts retain one immutable assignment", async () => {
    assert.equal((await service.from("report_segment_catalog").insert({ id: raceSegment, corridor_id: fixture.corridor.id, direction: "outbound" })).error, null);
    raceCatalogCreated = true;
    assert.equal((await service.from("demo_traffic_segments").insert({ ...fixture.segments.find(segment => segment.direction === "outbound"), id: raceSegment, corridor_id: fixture.corridor.id })).error, null);
    const actors = await Promise.all([actor(), actor(true)]);
    const values = actors.map(current => input(current, { segment_id: raceSegment }));
    const results = await Promise.all(actors.flatMap((current, index) => Array.from({ length: 6 }, () => submit(current, values[index]))));
    assert.equal(results.filter(result => result.replayed === false).length, 2);
    assert.ok(results.every(result => result.status === "accepted"));
    assert.equal(new Set(results.map(result => result.report.episode_id)).size, 1);
    for (let index = 0; index < actors.length; index++) {
      const current = actors[index];
      const original = results[index * 6].report;
      const ack = await rpc(current.who, "get_report_acknowledgement", { p_source_id: values[index].source_id, p_request_id: values[index].request_id });
      assert.deepEqual(ack.report, original);
      const conflicts = await Promise.all(Array.from({ length: 4 }, () => submit(current, { ...values[index], category: "flood" })));
      assert.ok(conflicts.every(result => result.status === "conflict"));
      assert.deepEqual(await submit(current, { ...input(current), episode_id: original.episode_id }), { status: "invalid" });
      assert.deepEqual(await submit(actors[1 - index], values[index]), { status: "identity_changed" });
    }
    const mixed = await submit(actors[0], input(actors[0], { category: "accident", segment_id: raceSegment }));
    assert.equal(mixed.report.episode_id, results[0].report.episode_id);
    const inbound = await submit(actors[0], input(actors[0], { segment_id: "primary-west-inbound", direction: "inbound" }));
    assert.notEqual(inbound.report.episode_id, mixed.report.episode_id);
    const alternative = await submit(actors[0], input(actors[0], { segment_id: "alternative-west" }));
    assert.notEqual(alternative.report.episode_id, mixed.report.episode_id);
    await snapshot();
  });

  test("strict public projection denies internal bounds, private linkage, helper calls and writes", async () => {
    const signed = await actor();
    const guest = await actor(true);
    const accepted = await submit(signed, input(signed));
    assert.equal(accepted.status, "accepted");
    for (const who of [client(), signed.who, guest.who]) {
      await snapshot(who);
      const selected = await who.from("incident_episodes").select(metadataFields.join(","));
      assert.equal(selected.error, null);
      for (const row of selected.data) assert.deepEqual(Object.keys(row).sort(), metadataFields);
      for (const column of ["*", "assignment_lower", "assignment_upper", "observed_high_water"]) {
        assert.equal((await who.from("incident_episodes").select(column)).error?.code, "42501");
      }
      for (const table of ["report_sources", "traffic_reports_private"]) assert.equal((await who.from(table).select("*")).error?.code, "42501");
      assert.equal((await who.from("incident_episodes").delete().eq("id", accepted.report.episode_id)).error?.code, "42501");
      assert.equal((await who.from("incident_episodes").update({ provenance: "simulated" }).eq("id", accepted.report.episode_id)).error?.code, "42501");
      assert.equal((await who.rpc("assign_incident_episode", { p_segment_id: "primary-west", p_direction: "outbound", p_observed_at: accepted.report.observed_at, p_created_at: accepted.report.received_at })).error?.code, "42501");
    }
    assert.equal((await service.rpc("assign_incident_episode", { p_segment_id: "primary-west", p_direction: "outbound", p_observed_at: accepted.report.observed_at, p_created_at: accepted.report.received_at })).error?.code, "42501");
  });

  test("source and Auth deletion retain metadata, while reset hides and replacement restores membership", async () => {
    for (const removeAuth of [false, true]) {
      const current = await actor();
      const value = input(current);
      const accepted = await submit(current, value);
      assert.equal(accepted.status, "accepted");
      const id = accepted.report.episode_id;
      const metadata = await service.from("incident_episodes").select("*").eq("id", id).single();
      assert.equal(metadata.error, null);
      await rpc(service, "reset_traffic_demo");
      assert.deepEqual((await snapshot()).incident_episodes, []);
      assert.equal((await submit(current, value)).report.episode_id, id);
      await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
      assert.ok((await snapshot()).reports.some(report => report.id === accepted.report.id && report.episode_id === id));
      if (removeAuth) {
        assert.equal((await service.auth.admin.deleteUser(current.id)).error, null);
        users.splice(users.indexOf(current.id), 1);
      } else await rpc(service, "cleanup_traffic_reports", { p_source_ids: [current.ready.source.id] });
      const retained = await service.from("incident_episodes").select("*").eq("id", id).single();
      assert.equal(retained.error, null);
      assert.deepEqual(retained.data, metadata.data);
      assert.ok(!(await snapshot()).reports.some(report => report.id === accepted.report.id));
    }
  });

  test("concurrent reset, replacement and submissions preserve single-statement summary membership", async () => {
    const current = await actor();
    for (let round = 0; round < 3; round++) {
      const results = await Promise.all([
        snapshot(), submit(current, input(current)), snapshot(),
        rpc(service, "reset_traffic_demo"), snapshot(),
        rpc(service, "replace_traffic_demo", { p_fixture: fixture }), snapshot(),
      ]);
      assert.ok(["accepted", "unavailable_segment"].includes(results[1].status));
    }
  });
}
