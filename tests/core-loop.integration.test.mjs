import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parseTrafficSnapshot } from "../apps/web/src/lib/traffic/snapshot.ts";
import { queryRoute, reportAssessmentRouteIncidents } from "../apps/web/src/lib/routing/engine.ts";
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

async function rpc(who, name, args) {
  const result = await who.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
  assert.equal(result.error, null, `${name} must succeed: ${result.error?.message}`);
  return result.data;
}

async function reporter() {
  const email = `core-loop-${crypto.randomUUID()}@example.test`;
  const password = `Test-${crypto.randomUUID()}!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, "create a test-owned commuter");
  ownedUsers.push(created.data.user.id);
  const who = client();
  assert.equal((await who.auth.signInWithPassword({ email, password })).error, null, "sign in reporter");
  const preparation = await rpc(who, "prepare_report_source");
  assert.equal(preparation.status, "ready");
  ownedSources.push(preparation.source.id);
  return { who, preparation };
}

async function submit(actor) {
  const result = await rpc(actor.who, "submit_traffic_report", {
    p_input: {
      source_id: actor.preparation.source.id,
      request_id: crypto.randomUUID(),
      segment_id: "primary-west",
      direction: "outbound",
      category: "heavy_traffic",
      observed_at: new Date(Date.parse(actor.preparation.read_at) - 60_000).toISOString(),
    },
  });
  assert.equal(result.status, "accepted");
}

before(async () => {
  previous = await rpc(client(), "read_traffic_demo");
  await rpc(service, "replace_traffic_demo", { p_fixture: createTrafficFixture("normal", new Date().toISOString()) });
  await rpc(service, "set_reporting_enabled", { p_enabled: true });
});

after(async () => {
  if (ownedSources.length) await rpc(service, "cleanup_traffic_reports", { p_source_ids: ownedSources });
  for (const id of ownedUsers) assert.equal((await service.auth.admin.deleteUser(id)).error, null, "remove only test-owned user");
  if (previous.fixture) await rpc(service, "replace_traffic_demo", { p_fixture: previous.fixture });
  else await rpc(service, "reset_traffic_demo");
  await rpc(service, "set_reporting_enabled", { p_enabled: previous.reporting_enabled });
});

test("core loop: one report is L1, three sources are L3, and the route avoids the reported segment", async () => {
  const [first, second, third] = await Promise.all([reporter(), reporter(), reporter()]);
  await submit(first);

  let snapshot = parseTrafficSnapshot(await rpc(client(), "read_traffic_demo"));
  let assessment = snapshot.report_assessments.find((row) => row.segment_id === "primary-west");
  assert.equal(assessment?.eligible_source_count, 1);
  assert.equal(assessment?.multiple_sources, false, "one source is L1 only");

  await submit(second);
  await submit(third);
  snapshot = parseTrafficSnapshot(await rpc(client(), "read_traffic_demo"));
  assessment = snapshot.report_assessments.find((row) => row.segment_id === "primary-west");
  assert.equal(assessment?.eligible_source_count, 3);
  assert.equal(assessment?.multiple_sources, true, "three distinct report sources reach L3");

  const warnings = reportAssessmentRouteIncidents(snapshot);
  assert.deepEqual(warnings.map((warning) => warning.level), ["L3"]);
  const affected = snapshot.fixture.segments.find((segment) => segment.id === "primary-west");
  const [start, destination] = [affected.geometry.coordinates[0], affected.geometry.coordinates.at(-1)];
  const route = await queryRoute(start, destination, warnings, async () => new Response(JSON.stringify({
    code: "Ok",
    routes: [
      { distance: 900, duration: 180, geometry: { coordinates: affected.geometry.coordinates } },
      { distance: 1200, duration: 240, geometry: { coordinates: [[74.81, 12.84], [74.82, 12.845], destination] } },
    ],
  }), { status: 200 }));

  assert.equal(route.ok, true);
  assert.equal(route.routes[0].avoids_incident, true);
  assert.match(route.routes[0].avoided_incident_reason, /verified L3/i);
});
