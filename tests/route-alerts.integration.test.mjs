import assert from "node:assert/strict";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { completedTraversalInput, simulateTraversal, traversalTimestamp, traversalTimestampMicros } from "../apps/web/src/lib/traffic/traversals.ts";
import { internalSupabaseUrl, readLocalStatus } from "../scripts/local-status.mjs";

async function rpc(client, name, input) {
  const response = await client.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
  assert.equal(response.error, null, `${name} must succeed: ${response.error?.message}`);
  return response.data;
}

// These helpers also prepare real retained motion for the serial browser acceptance runner.
export function routeAlertFixture(savingsUs = 300000000, anchor = new Date(Date.now() - 300000).toISOString()) {
  assert.ok([299000000, 299999999, 300000000, 300000001].includes(savingsUs));
  const fixture = createTrafficFixture("slowdown", anchor);
  const transition = Date.parse(anchor) - 360000;
  for (const observation of fixture.observations) {
    if (observation.segment_id === "primary-west") {
      observation.speed_kph = Date.parse(observation.observed_at) < transition ? (savingsUs > 300000000 ? 0 : 18) : 9;
    }
  }
  return fixture;
}

export async function completeRouteAlertEvidence(service, { run, batch, fixture, savingsUs = 300000000, omit = [] }) {
  const completions = [];
  const anchor = traversalTimestampMicros(fixture.corridor.anchor_at);
  for (const membership of fixture.route_segments) {
    if (omit.includes(membership.segment_id)) continue;
    const source = `${membership.segment_id}-source-1`;
    const context = await rpc(service, "read_traversal_context", { p_run_id: run, p_batch_id: batch, p_source_id: source });
    assert.equal(context.status, "ready");
    const schedule = context.samples.map((sample, index) => ({
      started_at: sample.observed_at,
      ended_at: context.samples[index + 1]?.observed_at ?? traversalTimestamp(anchor + 1200000000),
      speed_kph: sample.speed_kph,
    }));
    const entry = membership.segment_id === "primary-west"
      ? anchor - 360000000 - Math.abs(savingsUs - 300000000)
      : anchor - 360000000;
    const motion = simulateTraversal(context.segment.length_m, schedule, traversalTimestamp(entry), traversalTimestamp(anchor + 240000000));
    const input = completedTraversalInput({ run_id: run, batch_id: batch, source_id: source, traversal_id: crypto.randomUUID() },
      { ...context.segment, id: context.segment.segment_id }, motion);
    assert.equal((await rpc(service, "ingest_completed_traversal", { p_traversal: input })).status, "accepted");
    completions.push(input);
  }
  return completions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.DEMO_MODE, "true");
  assert.equal(process.env.SUPABASE_URL, internalSupabaseUrl);
  const credentials = await readLocalStatus();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(internalSupabaseUrl, credentials.ANON_KEY, options);
  const read = () => rpc(anonymous, "read_traffic_phase5");
  const original = await rpc(anonymous, "read_traffic_phase4");
  const runs = [];
  let modified = false;
  after(async () => {
    for (const run of runs) assert.equal((await rpc(service, "cleanup_speed_evidence", { p_run_id: run })).status, "ready");
    if (modified) await rpc(service, original.traffic.fixture ? "replace_traffic_demo" : "reset_traffic_demo",
      original.traffic.fixture ? { p_fixture: original.traffic.fixture } : undefined);
    const restored = await rpc(anonymous, "read_traffic_phase4");
    for (const key of ["fixture", "reports", "incident_episodes", "reporting_enabled"]) assert.deepEqual(restored.traffic[key], original.traffic[key]);
  });
  async function prepare(savingsUs = 300000000, complete = true) {
    const fixture = routeAlertFixture(savingsUs);
    modified = true;
    await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
    const run = crypto.randomUUID(), batch = crypto.randomUUID(); runs.push(run);
    assert.equal((await rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: batch })).status, "accepted");
    const context = { run, batch, fixture, savingsUs };
    if (complete) context.completions = await completeRouteAlertEvidence(service, context);
    return context;
  }
  function unavailable(comparison, status) {
    assert.equal(comparison.status, status);
    for (const field of ["primary_duration_us", "alternative_duration_us", "savings_us", "valid_until"]) assert.equal(comparison[field], null);
    assert.deepEqual(comparison.supported_incident_ids, []);
  }

  test("anonymous enclosing RPC has the exact private-identity-free contract and rejects caller clocks", async () => {
    const data = await read();
    assert.deepEqual(Object.keys(data).sort(), ["phase4", "route_comparison"]);
    assert.deepEqual(Object.keys(data.route_comparison).sort(), ["alternative_duration_us", "alternative_route_id", "alternative_segment_ids", "direction",
      "primary_duration_us", "primary_route_id", "primary_segment_ids", "provenance", "savings_us", "status", "supported_incident_ids", "valid_until"]);
    const old = await rpc(anonymous, "read_traffic_phase4");
    assert.deepEqual(data.phase4.traffic.fixture, old.traffic.fixture);
    assert.deepEqual(data.phase4.traffic.reports, old.traffic.reports);
    assert.equal((await anonymous.rpc("read_traffic_phase5", { p_read_at: old.traffic.read_at })).error?.code, "PGRST202");
    for (const role of [anonymous, service]) {
      assert.equal((await role.rpc("project_completed_traversal", { p_run_id: crypto.randomUUID(), p_segment_id: "primary-west", p_direction: "outbound", p_read_at: old.traffic.read_at })).error?.code, "42501");
    }
    for (const table of ["incident_lifecycle_cycles", "completed_traversals", "speed_evidence_batches", "traffic_reports_private"]) {
      assert.equal((await anonymous.from(table).select("*")).error?.code, "42501");
    }
    for (const name of ["run_id", "batch_id", "source_id", "owner_id", "assignment_lower", "assignment_upper"]) {
      assert.equal(JSON.stringify(data.route_comparison).includes(`"${name}"`), false);
    }
  });

  test("same-run actual motion preserves all four threshold microseconds and current primary support", async () => {
    for (const savings of [299000000, 299999999, 300000000, 300000001]) {
      const context = await prepare(savings);
      const data = await read(), comparison = data.route_comparison;
      assert.equal(comparison.status, "available");
      assert.equal(comparison.primary_duration_us, 420000000 + savings);
      assert.equal(comparison.alternative_duration_us, 420000000);
      assert.equal(comparison.savings_us, savings);
      assert.deepEqual(comparison.primary_segment_ids, ["primary-west", "primary-east"]);
      assert.deepEqual(comparison.alternative_segment_ids, ["alternative-west", "alternative-east"]);
      const current = data.phase4.incidents.filter(row => row.is_current && row.state === "supported" && comparison.primary_segment_ids.includes(row.segment_id));
      assert.ok(current.length > 0);
      assert.deepEqual(comparison.supported_incident_ids, current.map(row => row.id).sort());
      const deadline = Math.min(...context.completions.map(row => traversalTimestampMicros(row.entered_at) + 1200000000));
      assert.equal(traversalTimestampMicros(comparison.valid_until), deadline);
    }
  });

  test("missing completions and a newer complete-descriptor run never borrow older favorable motion", async () => {
    await prepare();
    const context = await prepare(300000000, false);
    unavailable((await read()).route_comparison, "missing");
    await completeRouteAlertEvidence(service, { ...context, omit: ["alternative-east"] });
    unavailable((await read()).route_comparison, "missing");
    await completeRouteAlertEvidence(service, { ...context, omit: ["primary-west", "primary-east", "alternative-west"] });
    assert.equal((await read()).route_comparison.status, "available");
  });

  for (const route of ["primary", "alternative"]) {
    const other = route === "primary" ? "alternative" : "primary";
    for (const variant of ["removed", "substituted", "reordered"]) {
      test(`${route} ${variant} actual membership cannot qualify a shortened or changed fixed route`, async () => {
        const context = await prepare();
        assert.equal((await read()).route_comparison.status, "available");
        const changed = structuredClone(context.fixture);
        if (variant === "removed") {
          changed.route_segments = changed.route_segments.filter(row => row.route_id !== route || row.position !== 2);
        } else if (variant === "substituted") {
          changed.route_segments.find(row => row.route_id === route && row.position === 2).segment_id = `${other}-east`;
        } else {
          for (const row of changed.route_segments.filter(row => row.route_id === route)) row.position = 3 - row.position;
        }
        try {
          await rpc(service, "replace_traffic_demo", { p_fixture: changed });
          const data = await read();
          assert.deepEqual(data.phase4.traffic.fixture.route_segments, [...changed.route_segments]
            .sort((a, b) => a.route_id.localeCompare(b.route_id) || a.position - b.position));
          for (const id of [route, other]) assert.deepEqual(data.route_comparison[`${id}_segment_ids`], changed.route_segments
            .filter(row => row.route_id === id).sort((a, b) => a.position - b.position).map(row => row.segment_id));
          unavailable(data.route_comparison, "incompatible");
        } finally {
          await rpc(service, "replace_traffic_demo", { p_fixture: context.fixture });
          assert.equal((await read()).route_comparison.status, "available");
        }
      });
    }
    test(`missing entire ${route} route stays no_routes with actual empty membership`, async () => {
      const context = await prepare();
      try {
        const deletion = await service.from("demo_traffic_routes").delete().eq("corridor_id", "mangaluru-central-v1").eq("id", route);
        assert.equal(deletion.error, null);
        const data = await read();
        unavailable(data.route_comparison, "no_routes");
        assert.deepEqual(data.route_comparison[`${route}_segment_ids`], []);
        assert.deepEqual(data.route_comparison[`${other}_segment_ids`], [`${other}-west`, `${other}-east`]);
      } finally {
        await rpc(service, "replace_traffic_demo", { p_fixture: context.fixture });
        assert.equal((await read()).route_comparison.status, "available");
      }
    });
  }

  test("changed baseline abstains; reset has no routes; restoring fixture restores exact memberships", async () => {
    const context = await prepare();
    const changed = structuredClone(context.fixture);
    changed.segments.find(row => row.id === "primary-west").baseline_seconds++;
    await rpc(service, "replace_traffic_demo", { p_fixture: changed });
    unavailable((await read()).route_comparison, "incompatible");
    await rpc(service, "reset_traffic_demo");
    const empty = await read();
    unavailable(empty.route_comparison, "no_routes");
    assert.deepEqual(empty.route_comparison.primary_segment_ids, []);
    assert.deepEqual(empty.route_comparison.alternative_segment_ids, []);
    await rpc(service, "replace_traffic_demo", { p_fixture: context.fixture });
    assert.equal((await read()).route_comparison.status, "available");
  });

  test("elapsed sums do not substitute baseline plus clamped delay for faster completed movement", async () => {
    const fixture = routeAlertFixture();
    for (const observation of fixture.observations) if (observation.segment_id === "primary-east") observation.speed_kph = 60;
    await rpc(service, "replace_traffic_demo", { p_fixture: fixture });
    const run = crypto.randomUUID(), batch = crypto.randomUUID(); runs.push(run);
    assert.equal((await rpc(service, "capture_speed_evidence", { p_run_id: run, p_batch_id: batch })).status, "accepted");
    await completeRouteAlertEvidence(service, { run, batch, fixture });
    const data = await read();
    assert.equal(data.route_comparison.status, "available");
    assert.equal(data.route_comparison.primary_duration_us, 660000000);
    assert.equal(data.route_comparison.savings_us, 240000000);
    assert.equal(data.phase4.traversals.find(row => row.segment_id === "primary-east").delay_seconds, 0);
  });
}
