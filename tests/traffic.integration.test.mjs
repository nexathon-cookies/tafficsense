import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture, DEMO_CORRIDOR_ID } from "../apps/web/src/lib/traffic/simulator.ts";
import { parseTrafficSnapshot } from "../apps/web/src/lib/traffic/snapshot.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

assert.equal(process.env.DEMO_MODE, "true");
assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
const status = await readLocalStatus();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(internalSupabaseUrl, status.SERVICE_ROLE_KEY, options);
const publicClient = () => createClient(internalSupabaseUrl, status.ANON_KEY, options);
const accounts = JSON.parse(readFileSync("supabase/.temp/demo-accounts.json", "utf8"));
assert.deepEqual(accounts.map(account => account.label).sort(), ["admin", "authority", "commuter", "employer-a", "employer-b", "employer-unassigned"]);
const tables = {
  segments: "demo_traffic_segments", routes: "demo_traffic_routes", route_segments: "demo_traffic_route_segments",
  sources: "demo_traffic_sources", observations: "demo_traffic_observations",
};
const fixture = createTrafficFixture("slowdown", "2026-10-15T04:00:00.000Z");
const sentinel = `unrelated-${crypto.randomUUID()}`;
let previous;
let prepared = false;
let authBefore;

async function readFixture(client = service, id = DEMO_CORRIDOR_ID) {
  const corridor = await client.from("demo_traffic_corridors").select("*").eq("id", id).maybeSingle();
  assert.equal(corridor.error, null, "corridor query must succeed");
  if (!corridor.data) return null;
  const result = { corridor: corridor.data };
  for (const [key, table] of Object.entries(tables)) {
    const response = await client.from(table).select("*").eq("corridor_id", id);
    assert.equal(response.error, null, `${table} query must succeed`);
    result[key] = response.data.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
}
function orderedFixture(value) {
  const result = structuredClone(value);
  result.corridor.anchor_at = new Date(result.corridor.anchor_at).toISOString();
  for (const row of result.observations) row.observed_at = new Date(row.observed_at).toISOString();
  const stableJson = row => JSON.stringify(row, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  for (const key of Object.keys(tables)) result[key].sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  return result;
}

async function readSnapshot(client = publicClient()) {
  const started = Date.now();
  const response = await client.rpc("read_traffic_demo");
  assert.equal(response.error, null, "public snapshot RPC must succeed");
  assert.deepEqual(Object.keys(response.data).sort(), ["fixture", "incident_episodes", "read_at", "report_assessments", "reporting_enabled", "reports"]);
  const readAt = Date.parse(response.data.read_at);
  assert.ok(Number.isFinite(readAt) && readAt >= started - 1000 && readAt <= Date.now() + 1000, "snapshot uses the current database statement clock");
  const parsed = parseTrafficSnapshot(response.data);
  const milliseconds = new Date(response.data.read_at).toISOString();
  const remainder = (/\.(\d{1,6})/.exec(response.data.read_at)?.[1] ?? "").padEnd(6, "0").slice(3);
  assert.equal(parsed.read_at, Number(remainder) ? milliseconds.replace("Z", `${remainder}Z`) : milliseconds);
  const value = response.data.fixture;
  if (value === null) {
    assert.deepEqual(response.data.reports, []);
    assert.deepEqual(response.data.incident_episodes, []);
    return response.data;
  }
  assert.deepEqual(orderedFixture(parsed.fixture), orderedFixture(value));
  assert.deepEqual(Object.keys(value).sort(), Object.keys(fixture).sort());
  assert.deepEqual(Object.keys(value.corridor).sort(), Object.keys(fixture.corridor).sort());
  for (const key of Object.keys(tables)) {
    for (const row of value[key]) assert.deepEqual(Object.keys(row).sort(), Object.keys(fixture[key][0]).sort(), `${key} must retain the explicit public field allowlist`);
  }
  assert.equal(value.corridor.id, DEMO_CORRIDOR_ID, "unrelated corridors must never enter the snapshot");
  assert.equal(value.corridor.provenance, "simulated");
  assert.deepEqual(orderedFixture(value), orderedFixture(createTrafficFixture(value.corridor.scenario, new Date(value.corridor.anchor_at).toISOString())), "a read must contain one complete scenario, never mixed generations");
  return response.data;
}

async function authSnapshot() {
  const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.equal(users.error, null);
  assert.ok(users.data.users.length < 1000, "snapshot must cover all local users");
  const result = { users: users.data.users.map(({ id, email }) => JSON.stringify({ id, email })).sort() };
  for (const table of ["profiles", "organisations", "memberships"]) {
    const response = await service.from(table).select("*");
    assert.equal(response.error, null);
    result[table] = response.data.map(row => JSON.stringify(row)).sort();
  }
  return result;
}
async function replace(value = fixture) {
  const result = await service.rpc("replace_traffic_demo", { p_fixture: value });
  assert.equal(result.error, null, "atomic fixture replacement must succeed");
  assert.equal(result.data.observations, value.observations.length);
}

before(async () => {
  previous = await readFixture();
  authBefore = await authSnapshot();
  prepared = true;
  const inserted = await service.from("demo_traffic_corridors").insert({ ...fixture.corridor, id: sentinel });
  assert.equal(inserted.error, null);
  for (const [key, table] of Object.entries(tables)) {
    const rows = fixture[key].map(row => ({ ...row, corridor_id: sentinel,
      ...(key === "observations" ? { anchor_at: fixture.corridor.anchor_at } : {}),
    }));
    assert.equal((await service.from(table).insert(rows)).error, null);
  }
  await replace();
});
after(async () => {
  if (!prepared) return;
  try {
    assert.equal((await service.rpc("reset_traffic_demo")).error, null);
    if (previous) await replace(previous);
  } finally {
    assert.equal((await service.from("demo_traffic_corridors").delete().eq("id", sentinel)).error, null);
  }
});

test("anonymous traffic reads contain only public synthetic fields and create no session", async () => {
  const client = publicClient();
  const stored = await readFixture(client);
  assert.equal(stored.corridor.provenance, "simulated");
  assert.equal(stored.observations.length, 180);
  for (const row of stored.observations) {
    assert.deepEqual(Object.keys(row).sort(), ["anchor_at", "corridor_id", "observed_at", "provenance", "segment_id", "source_id", "speed_kph"]);
    assert.equal(row.provenance, "simulated");
  }
  assert.equal((await client.auth.getSession()).data.session, null);
  const privateRows = await client.from("profiles").select("*");
  assert.ok(privateRows.error || privateRows.data.length === 0);
});

test("public and service snapshots expose only the fixed owned fixture without an auth session", async () => {
  const client = publicClient();
  assert.equal((await readSnapshot(client)).fixture.observations.length, 180);
  assert.equal((await readSnapshot(service)).fixture.observations.length, 180);
  assert.equal((await client.auth.getSession()).data.session, null);
});

test("all account roles and anonymous clients can read but cannot write or run simulator RPCs", async () => {
  const clients = [publicClient()];
  try {
    for (const account of accounts) {
      const client = publicClient();
      const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      assert.equal(login.error, null, `sign in ${account.label}`);
      clients.push(client);
    }
    for (const client of clients) {
      assert.equal((await readFixture(client)).observations.length, 180);
      assert.equal((await readSnapshot(client)).fixture.observations.length, 180);
      for (const table of ["demo_traffic_corridors", ...Object.values(tables)]) {
        const response = await service.from(table).select("*").limit(1).single();
        assert.equal(response.error, null);
        for (const operation of [
          client.from(table).insert(response.data), client.from(table).upsert(response.data),
          client.from(table).update(response.data).eq(table === "demo_traffic_corridors" ? "id" : "corridor_id", DEMO_CORRIDOR_ID),
          client.from(table).delete().eq(table === "demo_traffic_corridors" ? "id" : "corridor_id", DEMO_CORRIDOR_ID),
        ]) assert.equal((await operation).error?.code, "42501", `${table}: writes must be denied by privilege`);
      }
      assert.equal((await client.rpc("replace_traffic_demo", { p_fixture: fixture })).error?.code, "42501");
      assert.equal((await client.rpc("reset_traffic_demo")).error?.code, "42501");
    }
  } finally {
    for (const client of clients) await client.auth.signOut({ scope: "local" });
  }
});

test("identical replacement is idempotent and scenario changes replace rather than accumulate samples", async () => {
  const before = await readFixture();
  await replace();
  assert.deepEqual(await readFixture(), before);
  await replace(createTrafficFixture("recovery", fixture.corridor.anchor_at));
  const recovery = await readFixture();
  assert.equal(recovery.corridor.scenario, "recovery");
  assert.equal(recovery.observations.length, 180);
  assert.notDeepEqual(recovery.observations, before.observations);
  await replace();
  assert.deepEqual(await readFixture(), before);
});

test("constraints reject malformed geometry, times, references and duplicates with atomic rollback", async () => {
  const before = await readFixture();
  const invalid = [
    value => { value.corridor.id = sentinel; },
    value => { value.corridor.provenance = "gps"; },
    value => { value.segments[0].geometry.coordinates[0][0] = 181; },
    value => { value.segments[0].geometry.coordinates = [[74, 12]]; },
    value => { value.segments[0].baseline_seconds = 0; },
    value => { value.route_segments[0].segment_id = "primary-west-inbound"; },
    value => { value.route_segments[0].position = 9; },
    value => { value.observations[0].speed_kph = -1; },
    value => { value.observations[0].observed_at = "2026-10-15T04:01:00.000Z"; },
    value => { value.observations[0].source_id = "alternative-west-source-1"; },
    value => { value.observations.push(value.observations[0]); },
  ];
  for (const mutate of invalid) {
    const value = structuredClone(fixture);
    mutate(value);
    const result = await service.rpc("replace_traffic_demo", { p_fixture: value });
    assert.ok(["22023", "23514", "23503", "23505"].includes(result.error?.code), "invalid fixtures must be rejected by validation/constraints");
    assert.deepEqual(await readFixture(), before, "rejected replacement must leave the previous snapshot intact");
  }
});

test("concurrent replacements yield one complete fixture and scoped reset preserves unrelated data", async () => {
  const unrelatedBefore = await readFixture(service, sentinel);
  await Promise.all([replace(fixture), replace(createTrafficFixture("normal", fixture.corridor.anchor_at))]);
  const snapshot = await readFixture();
  assert.equal(snapshot.observations.length, 180);
  const expected = createTrafficFixture(snapshot.corridor.scenario, new Date(snapshot.corridor.anchor_at).toISOString());
  assert.deepEqual(snapshot.observations.map(({ segment_id, source_id, observed_at, speed_kph }) => ({ segment_id, source_id, observed_at: new Date(observed_at).toISOString(), speed_kph })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), expected.observations.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  assert.equal((await service.rpc("reset_traffic_demo")).error, null);
  assert.equal(await readFixture(publicClient()), null);
  for (const table of Object.values(tables)) {
    const response = await service.from(table).select("*", { count: "exact" }).eq("corridor_id", DEMO_CORRIDOR_ID);
    assert.equal(response.error, null);
    assert.equal(response.count, 0, "reset must remove all owned children");
  }
  assert.deepEqual(await readFixture(service, sentinel), unrelatedBefore);
  assert.deepEqual(await authSnapshot(), authBefore, "reset must not touch authentication or organisation data");
  assert.equal((await service.rpc("reset_traffic_demo")).error, null, "reset is idempotent");
  await Promise.all([replace(), service.rpc("reset_traffic_demo").then(result => assert.equal(result.error, null))]);
  const raced = await readFixture();
  if (raced) {
    assert.equal(raced.corridor.scenario, "slowdown");
    assert.equal(raced.observations.length, 180);
  } else {
    for (const table of Object.values(tables)) {
      const response = await service.from(table).select("*", { count: "exact" }).eq("corridor_id", DEMO_CORRIDOR_ID);
      assert.equal(response.error, null);
      assert.equal(response.count, 0);
    }
  }
  assert.deepEqual(await readFixture(service, sentinel), unrelatedBefore);
  await replace();
});

test("snapshot returns null after reset and stays atomic during same-anchor replacements and resets", async () => {
  const unrelatedBefore = await readFixture(service, sentinel);
  assert.equal((await service.rpc("reset_traffic_demo")).error, null);
  for (const client of [publicClient(), service]) assert.equal((await readSnapshot(client)).fixture, null);
  await replace();
  for (let round = 0; round < 12; round++) {
    const operations = [
      readSnapshot(),
      replace(createTrafficFixture("normal", fixture.corridor.anchor_at)),
      readSnapshot(), readSnapshot(service),
      replace(createTrafficFixture("recovery", fixture.corridor.anchor_at)),
      readSnapshot(),
      service.rpc("reset_traffic_demo").then(result => assert.equal(result.error, null)),
      readSnapshot(),
      replace(),
      readSnapshot(),
    ];
    const results = await Promise.allSettled(operations);
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  assert.deepEqual(await readFixture(service, sentinel), unrelatedBefore);
  assert.deepEqual(await authSnapshot(), authBefore);
  await replace();
});

function runCommand(args, credentials = status) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../scripts/simulate-traffic.mjs", import.meta.url).pathname, ...args], {
      env: process.env, stdio: ["pipe", "pipe", "pipe"], timeout: 20000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(credentials));
  });
}

test("local CLI persists each scenario, resets, and reports denied backend operations without leaking credentials", async () => {
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    const result = await runCommand([scenario, fixture.corridor.anchor_at]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, new RegExp(`SIMULATED ${scenario}: stored 180 observations`));
    assert.equal(result.stderr, "");
    const stored = await readFixture();
    assert.equal(stored.corridor.scenario, scenario);
    assert.equal(stored.observations.length, 180);
  }
  const before = await readFixture();
  for (const args of [["normal"], ["reset"]]) {
    const denied = await runCommand(args, { ...status, SERVICE_ROLE_KEY: status.ANON_KEY });
    assert.equal(denied.code, 1);
    assert.equal(denied.stdout, "");
    assert.match(denied.stderr, /Traffic operation failed/);
    assert.ok(!denied.stderr.includes(status.ANON_KEY));
    assert.ok(!denied.stderr.includes(status.SERVICE_ROLE_KEY));
    assert.deepEqual(await readFixture(), before);
  }
  const reset = await runCommand(["reset"]);
  assert.equal(reset.code, 0);
  assert.match(reset.stdout, /Removed owned synthetic corridor/);
  assert.equal(await readFixture(), null);
  await replace();
});
