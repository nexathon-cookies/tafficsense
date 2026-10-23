import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const credentials = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
const client = () => createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
const ownedUsers = [];
const ownedSources = [];
let previous;
let prepared = false;
const fixture = createTrafficFixture("slowdown", "2026-10-15T04:00:00.000Z");
const publicFields = ["id", "episode_id", "segment_id", "direction", "category", "observed_at", "received_at", "provenance", "location_provenance"].sort();

async function rpc(who, name, input) {
  const result = await who.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(result.error, null, `${name} must return a safe result, not an exception`);
  return result.data;
}
async function account(role = "commuter") {
  const email = `reports-${crypto.randomUUID()}@example.test`;
  const password = `Test-${crypto.randomUUID()}!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, "create test-owned account");
  const id = created.data.user.id;
  ownedUsers.push(id);
  assert.equal((await service.from("profiles").update({ role }).eq("id", id)).error, null);
  const who = client();
  assert.equal((await who.auth.signInWithPassword({ email, password })).error, null);
  return { who, id };
}
async function source(who) {
  const result = await rpc(who, "prepare_report_source");
  assert.equal(result.status, "ready");
  assert.deepEqual(Object.keys(result).sort(), ["read_at", "source", "status"]);
  assert.deepEqual(Object.keys(result.source).sort(), ["expires_at", "id", "kind"]);
  ownedSources.push(result.source.id);
  return result;
}
function input(preparation, overrides = {}) {
  return { source_id: preparation.source.id, request_id: crypto.randomUUID(), segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: new Date(preparation.read_at).toISOString(), ...overrides };
}
async function submit(who, value) { return rpc(who, "submit_traffic_report", { p_input: value }); }
async function lookup(who, value) { return rpc(who, "get_report_acknowledgement", { p_source_id: value.source_id, p_request_id: value.request_id }); }
function accepted(value, replayed = false) {
  assert.deepEqual(Object.keys(value).sort(), ["replayed", "report", "status"]);
  assert.equal(value.status, "accepted");
  assert.equal(value.replayed, replayed);
  assert.deepEqual(Object.keys(value.report).sort(), publicFields);
  assert.equal(value.report.provenance, "simulated");
  assert.equal(value.report.location_provenance, "manual");
}
async function clearOwnReports() {
  if (ownedSources.length) assert.equal((await service.from("traffic_reports_private").delete().in("source_id", ownedSources)).error, null);
}

before(async () => {
  previous = await rpc(client(), "read_traffic_demo");
  const gate = await service.rpc("set_reporting_enabled", { p_enabled: false });
  assert.equal(gate.error, null, "reporting migration must expose a service-only enabled gate");
  prepared = true;
  assert.equal((await service.rpc("replace_traffic_demo", { p_fixture: fixture })).error, null);
  await rpc(service, "set_reporting_enabled", { p_enabled: true });
});
after(async () => {
  if (!prepared) return;
  try {
    if (ownedSources.length) await rpc(service, "cleanup_traffic_reports", { p_source_ids: [...new Set(ownedSources)] });
    for (const id of ownedUsers) assert.equal((await service.auth.admin.deleteUser(id)).error, null, "remove only test-owned users");
    if (previous.fixture) await rpc(service, "replace_traffic_demo", { p_fixture: previous.fixture });
    else await rpc(service, "reset_traffic_demo");
  } finally {
    await rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled ?? false });
  }
});

test("sessionless clients are read-only and disabled reporting creates no sources", async () => {
  const who = client();
  for (const [name, args] of [["prepare_report_source", undefined], ["submit_traffic_report", { p_input: {} }], ["get_report_acknowledgement", { p_source_id: crypto.randomUUID(), p_request_id: crypto.randomUUID() }], ["set_reporting_enabled", { p_enabled: true }], ["cleanup_traffic_reports", { p_source_ids: null }]]) {
    assert.equal((await who.rpc(name, args)).error?.code, "42501", name);
  }
  const { who: signed } = await account();
  await rpc(service, "set_reporting_enabled", { p_enabled: false });
  assert.deepEqual(await rpc(signed, "prepare_report_source"), { status: "disabled" });
  const snapshot = await rpc(who, "read_traffic_demo");
  assert.deepEqual(Object.keys(snapshot).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
  assert.equal(snapshot.reporting_enabled, false);
  assert.equal((await who.auth.getSession()).data.session, null);
  await rpc(service, "set_reporting_enabled", { p_enabled: true });
});

test("claim helpers remain inaccessible to sessionless and account API callers", async () => {
  const { who } = await account();
  for (const actor of [client(), who]) {
    for (const name of ["report_request_claims", "report_request_user_id"]) {
      assert.equal((await actor.rpc(name)).error?.code, "42501", name);
    }
  }
});

test("all account roles submit ordinary reports without private storage or mutation privileges", async () => {
  for (const role of ["commuter", "employer", "authority", "admin"]) {
    const { who, id } = await account(role);
    const preparation = await source(who);
    assert.equal(preparation.source.kind, "account");
    assert.equal(preparation.source.expires_at, null);
    assert.equal((await source(who)).source.id, preparation.source.id);
    const value = input(preparation);
    const result = await submit(who, value);
    accepted(result);
    assert.notEqual(result.report.id, preparation.source.id);
    assert.notEqual(result.report.id, value.request_id);
    accepted(await lookup(who, value), true);
    for (const table of ["report_sources", "traffic_reports_private"]) assert.equal((await who.from(table).select("*")).error?.code, "42501");
    for (const table of ["public_traffic_reports", "report_sources", "traffic_reports_private", "report_segment_catalog", "reporting_settings"]) {
      assert.equal((await who.from(table).delete().not("id", "is", null)).error?.code, "42501", table);
    }
    assert.equal((await who.from("public_traffic_reports").insert(result.report)).error?.code, "42501");
    assert.equal((await who.rpc("set_reporting_enabled", { p_enabled: false })).error?.code, "42501");
    assert.equal((await who.rpc("cleanup_traffic_reports", { p_source_ids: [preparation.source.id] })).error?.code, "42501");
    assert.equal((await service.from("profiles").delete().eq("id", id)).error, null);
    assert.deepEqual(await rpc(who, "prepare_report_source"), { status: "denied" });
    assert.deepEqual(await submit(who, value), { status: "denied" });
    assert.equal((await service.from("profiles").insert({ id, role })).error, null);
  }
});

test("strict field and timestamp validation reject forged or malformed inputs without exceptions", async () => {
  const { who } = await account();
  const preparation = await source(who);
  const value = input(preparation);
  const invalid = [null, [], "text", {}, { ...value, user_id: crypto.randomUUID() }, { ...value, provenance: "gps" }, { ...value, received_at: value.observed_at }, { ...value, source_id: 4 }, { ...value, request_id: "bad" }, { ...value, category: null }, { ...value, category: "x".repeat(5000) }, { ...value, category: "confirmed" }, { ...value, observed_at: 123 }, { ...value, observed_at: value.observed_at.replace(".000Z", "Z").replace(/\.\d{3}Z$/, "Z") }, { ...value, observed_at: "2026-02-30T00:00:00.000Z" }, { ...value, observed_at: "2026-10-15T25:00:00.000Z" }, { ...value, observed_at: "2026-10-15T00:00:00.000+00:00" }, { ...value, observed_at: new Date(Date.parse(preparation.read_at) - 1200000).toISOString() }, { ...value, observed_at: new Date(Date.parse(preparation.read_at) + 60000).toISOString() }];
  for (const bad of invalid) assert.deepEqual(await submit(who, bad), { status: "invalid" });
  assert.deepEqual(await submit(who, { ...value, direction: "inbound" }), { status: "unavailable_segment" });
  assert.deepEqual(await submit(who, { ...value, segment_id: "not-canonical" }), { status: "unavailable_segment" });
  accepted(await submit(who, { ...value, observed_at: new Date(Date.parse(preparation.read_at) - 1190000).toISOString() }));
});

test("concurrent retries commit once, conflicting reuse never overwrites, and ownership binds every call", async () => {
  const { who } = await account();
  const other = await account();
  const preparation = await source(who);
  const value = input(preparation);
  const results = await Promise.all(Array.from({ length: 12 }, () => submit(who, value)));
  assert.equal(results.filter(result => result.replayed === false).length, 1);
  for (const result of results) { accepted(result, result.replayed); assert.deepEqual(result.report, results[0].report); }
  const conflicts = await Promise.all(Array.from({ length: 6 }, () => submit(who, { ...value, category: "accident" })));
  for (const result of conflicts) assert.deepEqual(result, { status: "conflict" });
  assert.deepEqual(await submit(other.who, value), { status: "identity_changed" });
  assert.deepEqual(await lookup(other.who, value), { status: "identity_changed" });
  assert.deepEqual(await lookup(who, { ...value, request_id: crypto.randomUUID() }), { status: "not_found" });
  assert.deepEqual(await lookup(who, { ...value, source_id: crypto.randomUUID() }), { status: "identity_changed" });
  const changed = input(preparation);
  const raced = await Promise.all([submit(who, changed), submit(who, { ...changed, category: "flood" })]);
  assert.deepEqual(raced.map(result => result.status).sort(), ["accepted", "conflict"]);
});

test("per-source quota races accept only five and replay consumes no extra reservation", async () => {
  const { who } = await account("admin");
  const preparation = await source(who);
  const values = Array.from({ length: 12 }, () => input(preparation));
  const results = await Promise.all(values.map(value => submit(who, value)));
  assert.equal(results.filter(result => result.status === "accepted").length, 5);
  assert.equal(results.filter(result => result.status === "rate_limited").length, 7);
  const index = results.findIndex(result => result.status === "accepted");
  accepted(await submit(who, values[index]), true);
  const rows = await service.from("traffic_reports_private").select("id", { count: "exact" }).eq("source_id", preparation.source.id);
  assert.equal(rows.error, null);
  assert.equal(rows.count, 5);
});

test("all supported categories persist and the public projection excludes private identifiers", async () => {
  const categories = ["accident", "road_repair", "flood", "landslide", "festival", "strike", "vip_movement", "heavy_traffic", "road_closed", "other", "unknown"];
  let context;
  for (let i = 0; i < categories.length; i++) {
    if (i % 5 === 0) { const { who } = await account(); context = { who, preparation: await source(who) }; }
    accepted(await submit(context.who, input(context.preparation, { category: categories[i] })));
  }
  const snapshot = await rpc(client(), "read_traffic_demo");
  for (const report of snapshot.reports) assert.deepEqual(Object.keys(report).sort(), publicFields);
  assert.ok(snapshot.reports.length >= categories.length);
  const publicRows = await client().from("public_traffic_reports").select("*");
  assert.equal(publicRows.error, null);
  for (const report of publicRows.data) assert.deepEqual(Object.keys(report).sort(), publicFields);
});

test("simulator reset/replacement preserves reports and retry acknowledgements while hiding unmatched rows", async () => {
  const { who } = await account();
  const preparation = await source(who);
  const value = input(preparation);
  const original = await submit(who, value);
  accepted(original);
  await rpc(service, "reset_traffic_demo");
  const empty = await rpc(client(), "read_traffic_demo");
  assert.equal(empty.fixture, null);
  assert.deepEqual(empty.reports, []);
  assert.deepEqual(empty.incident_episodes, []);
  assert.equal(empty.reporting_enabled, true);
  accepted(await submit(who, value), true);
  assert.deepEqual(await submit(who, input(preparation)), { status: "unavailable_segment" });
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    await rpc(service, "replace_traffic_demo", { p_fixture: createTrafficFixture(scenario, fixture.corridor.anchor_at) });
    const snapshot = await rpc(client(), "read_traffic_demo");
    assert.ok(snapshot.reports.some(report => report.id === original.report.id));
    assert.deepEqual((await lookup(who, value)).report, original.report);
  }
  await rpc(service, "set_reporting_enabled", { p_enabled: false });
  assert.deepEqual(await submit(who, value), { status: "disabled" });
  assert.deepEqual(await lookup(who, value), { status: "disabled" });
  await rpc(service, "set_reporting_enabled", { p_enabled: true });
});

test("global rolling-hour and retained budgets serialize races without partial projections", async () => {
  await clearOwnReports();
  const existing = await service.from("traffic_reports_private").select("id", { count: "exact", head: true });
  assert.equal(existing.error, null);
  assert.ok(existing.count < 1999, "budget boundary test needs retained capacity; never deletes other owners");
  const { who } = await account();
  const preparation = await source(who);
  const now = new Date(preparation.read_at).toISOString();
  const recent = await service.from("traffic_reports_private").select("id", { count: "exact", head: true }).gt("received_at", new Date(Date.parse(now) - 3600000).toISOString());
  assert.equal(recent.error, null);
  assert.ok(recent.count < 299, "budget boundary test needs rolling-hour capacity; never deletes other owners");
  const originalProjections = await service.from("public_traffic_reports").select("id", { count: "exact", head: true });
  assert.equal(originalProjections.error, null);
  const seed = (count, receivedAt) => Array.from({ length: count }, () => ({ source_id: preparation.source.id, request_id: crypto.randomUUID(), public_id: crypto.randomUUID(), canonical_input: input(preparation), received_at: receivedAt }));
  assert.equal((await service.from("traffic_reports_private").insert(seed(299 - recent.count, now))).error, null);
  const contenders = await Promise.all([account(), account()]);
  const ready = await Promise.all(contenders.map(({ who: actor }) => source(actor)));
  const results = await Promise.all(contenders.map(({ who: actor }, index) => submit(actor, input(ready[index]))));
  assert.deepEqual(results.map(result => result.status).sort(), ["accepted", "rate_limited"]);
  await clearOwnReports();
  const old = new Date(Date.parse(now) - 7200000).toISOString();
  for (let remaining = 1999 - existing.count; remaining > 0; remaining -= 500) {
    assert.equal((await service.from("traffic_reports_private").insert(seed(Math.min(remaining, 500), old))).error, null);
  }
  const retained = await Promise.all(contenders.map(({ who: actor }, index) => submit(actor, input(ready[index]))));
  assert.deepEqual(retained.map(result => result.status).sort(), ["accepted", "rate_limited"]);
  const projections = await service.from("public_traffic_reports").select("id", { count: "exact", head: true });
  assert.equal(projections.error, null);
  assert.equal(projections.count, originalProjections.count + 1, "rejected transactions must not leave public rows");
  await clearOwnReports();
});

test("real anonymous sessions skip profiles, expire absolutely and cannot obtain account access", async () => {
  const who = client();
  const signed = await who.auth.signInAnonymously({ options: { data: { role: "admin", is_anonymous: false } } });
  assert.equal(signed.error, null, "anonymous sign-in must succeed after coordinated enablement");
  const id = signed.data.user.id;
  ownedUsers.push(id);
  const profiles = await service.from("profiles").select("*").eq("id", id);
  assert.deepEqual(profiles.data, []);
  const preparation = await source(who);
  assert.equal(preparation.source.kind, "guest");
  assert.ok(Math.abs(Date.parse(preparation.source.expires_at) - Date.parse(preparation.read_at) - 86400000) < 1000);
  const value = input(preparation);
  accepted(await submit(who, value));
  assert.equal((await service.from("profiles").insert({ id, role: "employer" })).error, null);
  for (const table of ["profiles", "memberships", "organisations"]) assert.deepEqual((await who.from(table).select("*")).data, [], "even malformed legacy guest profiles remain private-ineligible");
  const expiryClock = Date.now();
  assert.equal((await service.from("report_sources").update({ created_at: new Date(expiryClock - 90000000).toISOString(), expires_at: new Date(expiryClock - 3600000).toISOString() }).eq("id", preparation.source.id)).error, null);
  assert.deepEqual(await rpc(who, "prepare_report_source"), { status: "expired" });
  assert.deepEqual(await submit(who, value), { status: "expired" });
  assert.deepEqual(await lookup(who, value), { status: "expired" });
  assert.equal((await who.auth.refreshSession()).error, null);
  assert.deepEqual(await rpc(who, "prepare_report_source"), { status: "expired" });
});

function operate(args, status = credentials) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../scripts/operate-reports.mjs", import.meta.url).pathname, ...args], { env: process.env, stdio: ["pipe", "pipe", "pipe"], timeout: 20000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(status));
  });
}

test("operator gate is locally guarded and denied operations never print credentials", async () => {
  for (const command of ["disable", "enable"]) {
    const result = await operate([command]);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
  }
  const denied = await operate(["disable"], { ...credentials, SERVICE_ROLE_KEY: credentials.ANON_KEY });
  assert.equal(denied.code, 1);
  assert.equal(denied.stdout, "");
  assert.match(denied.stderr, /Report operation failed/);
  for (const value of [credentials.ANON_KEY, credentials.SERVICE_ROLE_KEY]) assert.ok(!denied.stderr.includes(value));
  assert.equal((await operate(["cleanup"])).code, 1, "dataset cleanup requires explicit confirmation");
});
