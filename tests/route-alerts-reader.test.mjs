import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePhase4Snapshot } from "../apps/web/src/lib/traffic/phase4.ts";
import { parsePhase5Snapshot } from "../apps/web/src/lib/route-alerts/snapshot.ts";
import { addReport, input, unavailable, incidentId, readAt, readUs, timestamp } from "./route-alerts-fixtures.mjs";

test("phase five delegates unchanged Phase 4 and retains exact public report clocks separately", () => {
  const data = addReport(input(), "accident", readUs - 1);
  const parsed = parsePhase5Snapshot(data);
  assert.deepEqual(parsed.phase4, parsePhase4Snapshot(data.phase4));
  assert.deepEqual(parsed.route_comparison, data.route_comparison);
  assert.deepEqual(parsed.report_times, data.phase4.traffic.reports.map(({ id, observed_at, received_at }) => ({ id, observed_at, received_at })));
  assert.notEqual(parsed.route_comparison, data.route_comparison);
});

test("exact elapsed sums, ordered coverage, earliest deadline and allowlisted keys are enforced", () => {
  for (const mutate of [
    d => { d.private_run = "private"; }, d => { d.route_comparison.run_id = "private"; },
    d => { d.phase4.incidents[0].source_id = "private"; }, d => { delete d.route_comparison.direction; },
    d => { d.route_comparison.primary_segment_ids.reverse(); }, d => { d.route_comparison.primary_segment_ids.pop(); },
    d => { d.route_comparison.alternative_segment_ids.push("alternative-west"); },
    d => { d.route_comparison.alternative_segment_ids[0] = "unknown"; },
    d => { d.route_comparison.primary_segment_ids[0] = "primary-west-inbound"; },
    d => { d.route_comparison.direction = "inbound"; }, d => { d.route_comparison.primary_route_id = "alternative"; },
    d => { d.route_comparison.primary_duration_us++; }, d => { d.route_comparison.alternative_duration_us++; },
    d => { d.route_comparison.savings_us++; }, d => { d.route_comparison.valid_until = timestamp(readUs + 999_000_000); },
    d => { d.phase4.traversals[2].status = "stale"; d.phase4.traversals[2].delay_seconds = null; },
    d => { d.route_comparison.status = "no_routes"; }, d => { d.route_comparison.provenance = "live"; },
    d => { d.route_comparison.supported_incident_ids.push(incidentId); },
    d => { d.route_comparison.supported_incident_ids = ["dfed11cc-b09a-4d8a-8d74-1acee5143308"]; },
    d => { d.phase4.incidents[0].is_current = false; }, d => { d.phase4.incidents[0].state = "unconfirmed"; },
    d => { d.phase4.incidents[0].segment_id = "alternative-west"; },
  ]) { const data = input(); mutate(data); assert.throws(() => parsePhase5Snapshot(data), undefined, mutate.toString()); }
  for (const value of [NaN, Infinity, -Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1, "300000000", null]) {
    const data = input(); data.route_comparison.savings_us = value;
    assert.throws(() => parsePhase5Snapshot(data));
  }
});

test("changing the actual fixed route membership cannot remove duration or hazard coverage", () => {
  for (const route of ["primary", "alternative"]) {
    const data = addReport(input(299_000_000), "road_closed", readUs, readUs, "alternative-east");
    const ids = data.route_comparison[`${route}_segment_ids`];
    const omitted = ids.pop();
    data.phase4.traffic.fixture.route_segments = data.phase4.traffic.fixture.route_segments.filter(row => row.segment_id !== omitted);
    data.route_comparison[`${route}_duration_us`] -= 180_000_000;
    data.route_comparison.savings_us = data.route_comparison.primary_duration_us - data.route_comparison.alternative_duration_us;
    assert.throws(() => parsePhase5Snapshot(data), "A shortened fixed route must not qualify as available.");
    assert.equal(parsePhase5Snapshot(unavailable(data, "incompatible")).route_comparison.status, "incompatible");
  }
  const reordered = input();
  const members = reordered.phase4.traffic.fixture.route_segments.filter(row => row.route_id === "primary");
  [members[0].position, members[1].position] = [members[1].position, members[0].position];
  reordered.route_comparison.primary_segment_ids.reverse();
  assert.throws(() => parsePhase5Snapshot(reordered), "Matching reordered arrays cannot redefine the fixed route.");
});

test("all unavailable statuses stay null and cannot convey private-run support", () => {
  for (const status of ["missing", "stale", "future", "invalid", "incompatible", "mixed_runs"]) {
    const data = unavailable(input(), status);
    assert.equal(parsePhase5Snapshot(data).route_comparison.status, status);
    for (const patch of [{ savings_us: 300_000_000 }, { valid_until: readAt }, { supported_incident_ids: [incidentId] }]) {
      assert.throws(() => parsePhase5Snapshot({ ...data, route_comparison: { ...data.route_comparison, ...patch } }));
    }
  }
  const data = unavailable(input(), "no_routes");
  Object.assign(data.phase4, { traffic: { ...data.phase4.traffic, fixture: null, report_assessments: [] }, incidents: [], traversals: [] });
  Object.assign(data.route_comparison, { primary_segment_ids: [], alternative_segment_ids: [] });
  assert.equal(parsePhase5Snapshot(data).route_comparison.status, "no_routes");
});

test("comparison covers every ordered route member and does not use opposite-direction deadlines", () => {
  const data = input();
  const opposite = data.phase4.traversals[4];
  Object.assign(opposite, { entered_at: timestamp(readUs - 1_199_000_000), delay_seconds: 1019, valid_until: timestamp(readUs + 1_000_000) });
  data.phase4.traffic.fixture.route_segments.reverse();
  assert.equal(parsePhase5Snapshot(data).route_comparison.savings_us, 300_000_000);
  data.phase4.traffic.fixture.route_segments.find(s => s.segment_id === "primary-west").position = 2;
  data.phase4.traffic.fixture.route_segments.find(s => s.segment_id === "primary-east").position = 1;
  assert.throws(() => parsePhase5Snapshot(data));
});
