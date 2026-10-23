import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePhase5Snapshot } from "../apps/web/src/lib/route-alerts/snapshot.ts";
import { deriveRouteAlerts } from "../apps/web/src/lib/route-alerts/rules.ts";
import { addReport, input, unavailable, readUs, timestamp } from "./route-alerts-fixtures.mjs";

const primary = data => deriveRouteAlerts(parsePhase5Snapshot(data))[0];
test("every segment gets a directed decision and the threshold uses exact microseconds", () => {
  for (const savings of [299_000_000, 299_999_999, 300_000_000, 300_000_001]) {
    const rows = deriveRouteAlerts(parsePhase5Snapshot(input(savings)));
    assert.equal(rows.length, 5);
    assert.equal(rows[0].kind, savings >= 300_000_000 ? "alert" : "abstain");
    assert.equal(rows[0].reason, savings >= 300_000_000 ? null : "below_threshold");
    assert.equal(rows[0].savings_us, savings);
    assert.equal(rows[1].reason, "unsupported_incident");
    for (const row of rows.slice(2)) assert.equal(row.reason, "unrelated_selection");
    assert.equal(rows[4].direction, "inbound");
  }
});

test("only current unexpired persisted support in the comparison's private context can alert", () => {
  for (const mutate of [
    d => { d.phase4.incidents = []; },
    d => { d.phase4.incidents[0].state = "unconfirmed"; },
    d => { d.phase4.incidents[0].is_current = false; },
    d => { d.phase4.incidents[0].state = "stale"; d.phase4.incidents[0].valid_until = timestamp(readUs); },
    d => { Object.assign(d.phase4.incidents[0], { state: "cleared", valid_until: null, recovered_source_count: 3,
      cleared_at: timestamp(readUs - 1), recovery_end: timestamp(readUs - 1) }); },
    () => {},
  ]) {
    const data = input(); data.route_comparison.supported_incident_ids = []; mutate(data);
    assert.equal(primary(data).reason, "unsupported_incident");
  }
  const data = input();
  data.phase4.incidents[0].valid_until = timestamp(readUs + 1);
  assert.equal(primary(data).valid_until, timestamp(readUs + 1));
  data.phase4.incidents[0].valid_until = timestamp(readUs + 900_000_000);
  assert.equal(primary(data).valid_until, data.route_comparison.valid_until);
});

test("unavailable comparisons have explicit reasons and malformed numeric inputs fail closed", () => {
  for (const status of ["missing", "stale", "future", "invalid", "incompatible", "mixed_runs"]) {
    assert.equal(primary(unavailable(input(), status)).reason, status);
  }
  for (const value of [NaN, Infinity, -Infinity, 300_000_000.1, Number.MAX_SAFE_INTEGER + 1]) {
    const data = parsePhase5Snapshot(input()); data.route_comparison.savings_us = value;
    assert.equal(deriveRouteAlerts(data)[0].kind, "abstain");
    assert.equal(deriveRouteAlerts(data)[0].reason, "invalid");
    for (const row of deriveRouteAlerts(data).slice(2)) assert.equal(row.reason, "unrelated_selection");
  }
  const data = input();
  data.phase4.traffic.fixture.routes[1].id = "another-alternative";
  data.phase4.traffic.fixture.route_segments.filter(s => s.route_id === "alternative").forEach(s => { s.route_id = "another-alternative"; });
  unavailable(data, "no_routes"); data.route_comparison.alternative_segment_ids = [];
  assert.equal(primary(data).reason, "no_alternative");
});

test("current alternative supported incidents block, historical or withdrawn incidents do not", () => {
  const data = input();
  data.phase4.incidents.push({ ...data.phase4.incidents[0], id: "dfed11cc-b09a-4d8a-8d74-1acee5143308", segment_id: "alternative-east" });
  assert.equal(primary(data).reason, "alternative_slowdown");
  data.phase4.incidents[1].is_current = false;
  assert.equal(primary(data).kind, "alert");
  data.phase4.incidents[1].is_current = true; data.phase4.incidents[1].state = "unconfirmed";
  assert.equal(primary(data).kind, "alert");
});

test("only explicit directed hazard categories block, without claiming a verified cause", () => {
  for (const category of ["accident", "road_repair", "flood", "landslide", "road_closed"]) {
    assert.equal(primary(addReport(input(), category)).reason, "alternative_hazard");
    assert.equal(primary(addReport(input(), category, readUs, readUs, "alternative-east")).reason, "alternative_hazard");
    assert.equal(primary(addReport(input(), category, readUs, readUs, "primary-west-inbound")).kind, "alert");
    assert.equal(primary(addReport(input(), category, readUs, readUs, "primary-east")).kind, "alert");
  }
  for (const category of ["unknown", "festival", "strike", "vip_movement", "heavy_traffic", "other"]) {
    assert.equal(primary(addReport(input(), category)).kind, "alert");
  }
});

test("hazard freshness is (read minus twenty minutes, read] at exact microseconds", () => {
  for (const [observed, received, reason] of [
    [readUs - 1_200_000_000, readUs, null], [readUs - 1_200_000_000 + 1, readUs, "alternative_hazard"],
    [readUs, readUs, "alternative_hazard"], [readUs + 1, readUs + 1, null], [readUs, readUs + 1, null],
  ]) assert.equal(primary(addReport(input(), "accident", observed, received)).reason, reason);
});

test("L3 counts and transient fixture slowdown cannot replace persisted lifecycle support", () => {
  const data = addReport(input(), "heavy_traffic", readUs, readUs, "primary-west");
  const report = data.phase4.traffic.reports[0];
  data.phase4.traffic.reports.push(...[1, 2].map(index => ({ ...report, id: `dfed11cc-b09a-4d8a-8d74-1acee514330${index}` })));
  data.phase4.traffic.incident_episodes[0].report_count = 3;
  Object.assign(data.phase4.traffic.report_assessments[0], { report_count: 3, recent_report_count: 3,
    eligible_report_count: 3, eligible_source_count: 3, multiple_sources: true });
  data.phase4.incidents = []; data.route_comparison.supported_incident_ids = [];
  assert.equal(primary(data).reason, "unsupported_incident");
});

test("empty snapshots produce no rows and negative differences abstain", () => {
  assert.equal(primary(input(-1)).reason, "below_threshold");
  const data = unavailable(input(), "no_routes");
  Object.assign(data.phase4, { traffic: { ...data.phase4.traffic, fixture: null, report_assessments: [] }, incidents: [], traversals: [] });
  Object.assign(data.route_comparison, { primary_segment_ids: [], alternative_segment_ids: [] });
  assert.deepEqual(deriveRouteAlerts(parsePhase5Snapshot(data)), []);
});

test("missing or inconsistent exact report clocks fail closed instead of using rounded display times", () => {
  const data = parsePhase5Snapshot(addReport(input(), "accident", readUs - 1_200_000_000 + 1));
  for (const report_times of [undefined, [], [...data.report_times, ...data.report_times],
    [{ ...data.report_times[0], observed_at: "invalid" }], [{ ...data.report_times[0], id: "unknown" }]]) {
    assert.equal(deriveRouteAlerts({ ...data, report_times })[0].reason, "invalid");
  }
  assert.equal(deriveRouteAlerts(JSON.parse(JSON.stringify(data)))[0].reason, "alternative_hazard");
});

test("historical clearance never erases a newer reported hazard", () => {
  const data = addReport(input(), "road_closed");
  data.phase4.incidents.push({ ...data.phase4.incidents[0], id: "dfed11cc-b09a-4d8a-8d74-1acee5143308",
    segment_id: "alternative-west", state: "cleared", is_current: false, valid_until: null,
    recovered_source_count: 3, cleared_at: timestamp(readUs - 1), recovery_end: timestamp(readUs - 1) });
  assert.equal(primary(data).reason, "alternative_hazard");
});
