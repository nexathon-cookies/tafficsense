import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parseTrafficSnapshot } from "../apps/web/src/lib/traffic/snapshot.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const client = () => createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
const ownedUsers = [];
const ownedSources = [];
const fixture = createTrafficFixture("slowdown", "2026-10-15T04:00:00.000Z");
const assessmentFields = ["segment_id", "direction", "report_count", "recent_report_count", "eligible_report_count", "eligible_source_count", "multiple_sources", "valid_until", "provenance"].sort();
const reportFields = ["id", "episode_id", "segment_id", "direction", "category", "observed_at", "received_at", "provenance", "location_provenance"].sort();
let previous;
let prepared = false;

async function rpc(who, name, input) {
  const result = await who.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(result.error, null, `${name} must succeed`);
  return result.data;
}
async function rows(table, columns) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const page = await service.from(table).select(columns).order("id").range(offset, offset + 499);
    assert.equal(page.error, null, `read ${table} for test-only expectations`);
    result.push(...page.data);
    if (page.data.length < 500) return result;
  }
}
async function identities() {
  const [reports, sources] = await Promise.all([
    rows("traffic_reports_private", "id,public_id,source_id"),
    rows("report_sources", "id,kind,created_at,expires_at"),
  ]);
  const bySource = new Map(sources.map(source => [source.id, source]));
  return new Map(reports.map(report => [report.public_id, bySource.get(report.source_id)]));
}
function expected(segment, reports, readAt, links) {
  const matching = reports.filter(report => report.segment_id === segment.id && report.direction === segment.direction);
  const time = Date.parse(readAt);
  let recentCount = 0;
  let eligibleCount = 0;
  const sources = new Set();
  const deadlines = [];
  for (const report of matching) {
    const observed = Date.parse(report.observed_at);
    const received = Date.parse(report.received_at);
    const coherent = report.provenance === "simulated" && report.location_provenance === "manual" && observed <= received;
    if (!coherent) continue;
    if (received > time) {
      if (observed > received - 1200000) deadlines.push(received);
      continue;
    }
    if (observed <= time - 1200000) continue;
    recentCount++;
    deadlines.push(observed + 1200000);
    const source = links.get(report.id);
    if (observed <= time - 900000 || !source || received < Date.parse(source.created_at)) continue;
    if (source.kind !== "account" && source.kind !== "guest") continue;
    if (source.kind === "account" && source.expires_at !== null) continue;
    if (source.kind === "guest" && !(Date.parse(source.expires_at) > time)) continue;
    eligibleCount++;
    sources.add(source.id);
    deadlines.push(observed + 900000);
    if (source.kind === "guest") deadlines.push(Date.parse(source.expires_at));
  }
  return {
    segment_id: segment.id, direction: segment.direction, report_count: matching.length,
    recent_report_count: recentCount, eligible_report_count: eligibleCount,
    eligible_source_count: sources.size, multiple_sources: sources.size >= 3,
    valid_until: deadlines.length ? Math.min(...deadlines) : null, provenance: "simulated",
  };
}
function verify(snapshot, links) {
  parseTrafficSnapshot(snapshot);
  assert.deepEqual(Object.keys(snapshot).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
  assert.ok(Number.isFinite(Date.parse(snapshot.read_at)));
  assert.ok(Array.isArray(snapshot.report_assessments));
  const segments = snapshot.fixture?.segments ?? [];
  assert.equal(snapshot.report_assessments.length, segments.length);
  assert.equal(new Set(snapshot.report_assessments.map(row => `${row.segment_id}/${row.direction}`)).size, segments.length);
  for (const report of snapshot.reports) assert.deepEqual(Object.keys(report).sort(), reportFields);
  if (!snapshot.fixture) assert.deepEqual(snapshot.reports, []);
  for (const segment of segments) {
    const actual = snapshot.report_assessments.find(row => row.segment_id === segment.id && row.direction === segment.direction);
    assert.ok(actual, "every active directed segment has one assessment");
    assert.deepEqual(Object.keys(actual).sort(), assessmentFields);
    const wanted = expected(segment, snapshot.reports, snapshot.read_at, links);
    const { valid_until: deadline, ...counts } = actual;
    const { valid_until: nextChange, ...expectedCounts } = wanted;
    assert.deepEqual(counts, expectedCounts);
    if (nextChange === null) assert.equal(deadline, null);
    else {
      assert.ok(Date.parse(deadline) > Date.parse(snapshot.read_at), "deadline is in the future");
      assert.ok(Date.parse(deadline) <= nextChange + 1, "deadline never outlives the first time-driven change");
    }
  }
}
async function snapshot(who = client()) {
  const links = await identities();
  const value = await rpc(who, "read_traffic_demo");
  verify(value, links);
  return { value, links };
}
async function actor(kind = "account", role = "commuter") {
  const who = client();
  let id;
  if (kind === "guest") {
    const result = await who.auth.signInAnonymously();
    assert.equal(result.error, null, "real guest API must be enabled for this serial local suite");
    id = result.data.user.id;
    ownedUsers.push(id);
  } else {
    const email = `evidence-${crypto.randomUUID()}@example.test`;
    const password = `Test-${crypto.randomUUID()}!`;
    const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(result.error, null, "create only a test-owned account");
    id = result.data.user.id;
    ownedUsers.push(id);
    assert.equal((await service.from("profiles").update({ role }).eq("id", id)).error, null);
    assert.equal((await who.auth.signInWithPassword({ email, password })).error, null);
  }
  const preparation = await rpc(who, "prepare_report_source");
  assert.equal(preparation.status, "ready");
  assert.equal(preparation.source.kind, kind);
  ownedSources.push(preparation.source.id);
  return { who, id, preparation };
}
function input(actor, overrides = {}) {
  return {
    source_id: actor.preparation.source.id, request_id: crypto.randomUUID(),
    segment_id: "primary-west", direction: "outbound", category: "unknown",
    observed_at: new Date(Date.parse(actor.preparation.read_at) - 60000).toISOString(), ...overrides,
  };
}
async function submit(actor, overrides = {}) {
  const result = await rpc(actor.who, "submit_traffic_report", { p_input: input(actor, overrides) });
  assert.equal(result.status, "accepted", "report needs available retained/hour/source quota; unrelated reports are never deleted");
  return result.report;
}
function ownContribution(value, links, ids, wanted, segmentId = "primary-west") {
  const segment = value.fixture.segments.find(segment => segment.id === segmentId);
  const all = expected(segment, value.reports, value.read_at, links);
  const others = expected(segment, value.reports.filter(report => !ids.includes(report.id)), value.read_at, links);
  for (const [key, count] of Object.entries(wanted)) assert.equal(all[key] - others[key], count, key);
}
async function clearOwnReports() {
  if (ownedSources.length) assert.equal((await service.from("traffic_reports_private").delete().in("source_id", ownedSources)).error, null);
}

before(async () => {
  // The missing-function baseline fails before any fixture or gate mutation.
  const baseline = await rpc(client(), "read_report_assessments");
  assert.ok(Array.isArray(baseline));
  previous = await rpc(client(), "read_traffic_demo");
  assert.ok(Array.isArray(previous.report_assessments));
  prepared = true;
  await rpc(service, "set_reporting_enabled", { p_enabled: false });
  await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
  await rpc(service, "set_reporting_enabled", { p_enabled: true });
});
afterEach(async () => {
  if (prepared) {
    await clearOwnReports();
    await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
    await rpc(service, "set_reporting_enabled", { p_enabled: true });
  }
});
after(async () => {
  if (!prepared) return;
  const failures = [];
  const attempt = async operation => { try { await operation(); } catch (error) { failures.push(error); } };
  await attempt(async () => {
    if (ownedSources.length) await rpc(service, "cleanup_traffic_reports", { p_source_ids: ownedSources });
  });
  for (const id of ownedUsers) await attempt(async () => assert.equal((await service.auth.admin.deleteUser(id)).error, null));
  await attempt(async () => {
    if (previous.fixture) await rpc(service, "replace_traffic_demo", { p_fixture: previous.fixture });
    else await rpc(service, "reset_traffic_demo");
  });
  await attempt(() => rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled }));
  assert.equal(failures.length, 0, "all test-owned cleanup and prior fixture/gate restoration must succeed");
});

test("aggregate projection is public without exposing private records, identifiers, or a caller clock", async () => {
  const account = await actor();
  const guest = await actor("guest");
  const reports = [await submit(account), await submit(guest)];
  const anonymous = client();
  for (const who of [anonymous, account.who, guest.who, service]) {
    const { value } = await snapshot(who);
    const aggregates = await rpc(who, "read_report_assessments");
    assert.equal(aggregates.length, value.fixture.segments.length);
    for (const row of aggregates) assert.deepEqual(Object.keys(row).sort(), assessmentFields);
    const serialized = JSON.stringify(aggregates);
    for (const secret of [account.id, guest.id, account.preparation.source.id, guest.preparation.source.id, ...reports.map(report => report.id)]) {
      assert.ok(!serialized.includes(secret), "aggregate response excludes identifying values");
    }
    for (const secret of [account.id, guest.id, account.preparation.source.id, guest.preparation.source.id]) {
      assert.ok(!JSON.stringify(value).includes(secret), "snapshot excludes account and private source identifiers");
    }
    for (const episode of value.incident_episodes) {
      assert.deepEqual(Object.keys(episode).sort(), ["created_at", "direction", "first_observed_at", "id", "last_observed_at", "provenance", "report_count", "segment_id"]);
    }
    assert.ok((await who.rpc("read_report_assessments", { read_at: value.read_at })).error, "no public historical-clock overload");
  }
  for (const who of [anonymous, account.who, guest.who]) {
    for (const table of ["traffic_reports_private", "report_sources"]) assert.equal((await who.from(table).select("*")).error?.code, "42501");
    assert.equal((await who.from("public_traffic_reports").update({ category: "accident" }).eq("id", reports[0].id)).error?.code, "42501");
  }
  assert.equal((await anonymous.auth.getSession()).data.session, null);
});

test("repeated fabricated causes and concurrent retries count one source across mixed categories", async () => {
  const first = await actor();
  const value = input(first, { category: "accident" });
  const retries = await Promise.all(Array.from({ length: 8 }, () => rpc(first.who, "submit_traffic_report", { p_input: value })));
  assert.equal(retries.filter(result => result.replayed === false).length, 1);
  for (const result of retries) assert.equal(result.status, "accepted");
  const ids = [retries[0].report.id];
  for (const category of ["flood", "festival", "road_closed", "unknown"]) ids.push((await submit(first, { category })).id);
  let checked = await snapshot();
  ownContribution(checked.value, checked.links, ids, { report_count: 5, recent_report_count: 5, eligible_report_count: 5, eligible_source_count: 1 });
  assert.deepEqual(await rpc(first.who, "submit_traffic_report", { p_input: { ...value, category: "flood" } }), { status: "conflict" });
  const second = await actor("guest");
  const third = await actor("account", "admin");
  ids.push((await submit(second, { category: "heavy_traffic" })).id, (await submit(third, { category: "other" })).id);
  checked = await snapshot();
  ownContribution(checked.value, checked.links, ids, { report_count: 7, recent_report_count: 7, eligible_report_count: 7, eligible_source_count: 3 });
  assert.equal(checked.value.report_assessments.find(row => row.segment_id === "primary-west").multiple_sources, true);
  const inbound = await submit(third, { segment_id: "primary-west-inbound", direction: "inbound" });
  const alternative = await submit(third, { segment_id: "alternative-west" });
  checked = await snapshot();
  ownContribution(checked.value, checked.links, [inbound.id], { report_count: 1, eligible_source_count: 1 }, "primary-west-inbound");
  ownContribution(checked.value, checked.links, [alternative.id], { report_count: 1, eligible_source_count: 1 }, "alternative-west");
});

test("eligibility uses all retained reports rather than newest-ten details or receipt order", async () => {
  const older = await actor();
  const oldReport = await submit(older, { observed_at: new Date(Date.parse(older.preparation.read_at) - 720000).toISOString() });
  const ids = [oldReport.id];
  for (let group = 0; group < 3; group++) {
    const current = await actor();
    for (let index = 0; index < (group === 2 ? 1 : 5); index++) ids.push((await submit(current)).id);
  }
  const { value, links } = await snapshot();
  ownContribution(value, links, ids, { report_count: 12, recent_report_count: 12, eligible_report_count: 12, eligible_source_count: 4 });
  const newest = value.reports.filter(report => report.segment_id === "primary-west").sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at)).slice(0, 10);
  assert.ok(!newest.some(report => report.id === oldReport.id));
  assert.ok(Date.parse(oldReport.observed_at) < Date.parse(older.preparation.read_at), "manual observations may predate source preparation");
});

test("twenty-minute recency is separate from fifteen-minute evidence and retained totals", async () => {
  const current = await actor();
  const ids = [];
  for (const minutes of [1, 17, 19]) ids.push((await submit(current, { observed_at: new Date(Date.parse(current.preparation.read_at) - minutes * 60000).toISOString() })).id);
  const stale = await submit(current);
  ids.push(stale.id);
  assert.equal((await service.from("public_traffic_reports").update({ observed_at: new Date(Date.parse(current.preparation.read_at) - 1260000).toISOString() }).eq("id", stale.id)).error, null);
  const { value, links } = await snapshot();
  ownContribution(value, links, ids, { report_count: 4, recent_report_count: 3, eligible_report_count: 1, eligible_source_count: 1 });
});

test("guest expiry invalidates evidence before cleanup while account evidence has no source expiry", async () => {
  const guest = await actor("guest");
  const account = await actor();
  const ids = [(await submit(guest)).id, (await submit(account)).id];
  const clock = Date.parse((await rpc(client(), "read_traffic_demo")).read_at);
  const expiresAt = clock + 120000;
  assert.equal((await service.from("report_sources").update({ created_at: new Date(expiresAt - 86400000).toISOString(), expires_at: new Date(expiresAt).toISOString() }).eq("id", guest.preparation.source.id)).error, null);
  let checked = await snapshot();
  ownContribution(checked.value, checked.links, ids, { report_count: 2, recent_report_count: 2, eligible_report_count: 2, eligible_source_count: 2 });
  assert.ok(Date.parse(checked.value.report_assessments.find(row => row.segment_id === "primary-west").valid_until) <= expiresAt);
  assert.equal((await service.from("report_sources").update({ created_at: new Date(clock - 86401000).toISOString(), expires_at: new Date(clock - 1000).toISOString() }).eq("id", guest.preparation.source.id)).error, null);
  checked = await snapshot();
  ownContribution(checked.value, checked.links, ids, { report_count: 2, recent_report_count: 2, eligible_report_count: 1, eligible_source_count: 1 });
  assert.deepEqual(await rpc(guest.who, "prepare_report_source"), { status: "expired" });
  await rpc(service, "cleanup_traffic_reports", { p_source_ids: [guest.preparation.source.id] });
  checked = await snapshot();
  assert.ok(!checked.value.reports.some(report => report.id === ids[0]));
  ownContribution(checked.value, checked.links, ids, { report_count: 1, eligible_source_count: 1 });
});

test("disabled writes preserve assessments and empty reset hides rather than deletes evidence", async () => {
  const current = await actor();
  const report = await submit(current);
  const episodes = (await snapshot()).value.incident_episodes;
  await rpc(service, "set_reporting_enabled", { p_enabled: false });
  const disabled = await snapshot();
  assert.equal(disabled.value.reporting_enabled, false);
  assert.ok(disabled.value.reports.some(row => row.id === report.id));
  assert.deepEqual(await rpc(current.who, "prepare_report_source"), { status: "disabled" });
  await rpc(service, "reset_traffic_demo");
  const empty = await snapshot();
  assert.equal(empty.value.fixture, null);
  assert.deepEqual(empty.value.report_assessments, []);
  assert.deepEqual(empty.value.incident_episodes, []);
  assert.deepEqual(await rpc(client(), "read_report_assessments"), []);
  const retained = await service.from("public_traffic_reports").select("id").eq("id", report.id);
  assert.deepEqual(retained.data, [{ id: report.id }]);
  await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
  const restored = (await snapshot()).value;
  assert.ok(restored.reports.some(row => row.id === report.id));
  assert.deepEqual(restored.incident_episodes, episodes);
});

test("concurrent public reads never mix report/assessment or fixture generations", async () => {
  const current = await actor();
  await submit(current);
  const snapshots = [];
  const read = async () => snapshots.push(await rpc(client(), "read_traffic_demo"));
  for (let round = 0; round < 4; round++) {
    const value = input(current);
    const operations = [
      read(), rpc(current.who, "submit_traffic_report", { p_input: value }), read(),
      rpc(service, "replace_traffic_demo", { p_fixture: createTrafficFixture("normal", fixture.corridor.anchor_at) }),
      read(), rpc(service, "reset_traffic_demo"), read(),
      rpc(service, "replace_traffic_demo", { p_fixture: fixture }), read(),
    ];
    const results = await Promise.allSettled(operations);
    for (const result of results) if (result.status === "rejected") throw result.reason;
    assert.ok(["accepted", "unavailable_segment"].includes(results[1].value.status));
  }
  const links = await identities();
  for (const value of snapshots) verify(value, links);
  assert.equal(snapshots.length, 20);
});
