import assert from "node:assert/strict";
import { test } from "node:test";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parsePhase4Snapshot } from "../apps/web/src/lib/traffic/phase4.ts";

const anchor = "2026-10-16T04:00:00.000001Z";
const fixture = createTrafficFixture("slowdown", "2026-10-16T04:00:00.000Z");
const id = "6c491f94-8c75-4a56-9c20-a332ae9de920";
function input() {
  return { traffic: { read_at: anchor, fixture, reports: [], incident_episodes: [], reporting_enabled: false,
    report_assessments: fixture.segments.map(s => ({ segment_id: s.id, direction: s.direction, report_count: 0,
      recent_report_count: 0, eligible_report_count: 0, eligible_source_count: 0, multiple_sources: false, valid_until: null, provenance: "simulated" })) },
  incidents: [{ id, segment_id: "primary-west", direction: "outbound", state: "supported", is_current: true,
    started_at: "2026-10-16T03:49:00.000001Z", last_supported_at: "2026-10-16T03:54:00.000001Z", cleared_at: null, recovery_end: null,
    valid_until: "2026-10-16T04:09:00.000001Z", supporting_source_count: 3, recovered_source_count: 0,
    prior_incident_id: null, report_episode_ids: [], provenance: "simulated", cause: "unknown" }],
  traversals: fixture.segments.map(s => ({ segment_id: s.id, direction: s.direction, status: "missing", id: null,
    entered_at: null, exited_at: null, baseline_seconds: null, baseline_label: null, delay_seconds: null, valid_until: null, provenance: "simulated" })) };
}

test("phase four read preserves original traffic and exact lifecycle timestamps", () => {
  const data = input();
  assert.deepEqual(parsePhase4Snapshot(data), data);
  assert.notEqual(parsePhase4Snapshot(data).incidents[0], data.incidents[0]);
  const empty = { traffic: { ...data.traffic, fixture: null, report_assessments: [] }, incidents: [], traversals: [] };
  assert.deepEqual(parsePhase4Snapshot(empty), empty);
});

test("phase four read rejects private fields, unknown references, contradictory support and partial envelopes", () => {
  for (const mutate of [
    v => { v.run_id = id; }, v => { v.incidents[0].source_id = "private"; }, v => { delete v.traversals; },
    v => { v.incidents.push(v.incidents[0]); }, v => { v.incidents[0].direction = "inbound"; },
    v => { v.incidents[0].state = "confirmed"; }, v => { v.incidents[0].cause = "accident"; },
    v => { v.incidents[0].supporting_source_count = 2; }, v => { v.incidents[0].valid_until = null; },
    v => { v.incidents[0].last_supported_at = "2026-10-16T04:00:00.000002Z"; },
    v => { v.incidents[0].prior_incident_id = id; }, v => { v.incidents[0].report_episode_ids = [id]; },
    v => { v.incidents[0].cleared_at = anchor; }, v => { v.traversals.pop(); },
    v => { v.traversals[0].delay_seconds = 0; }, v => { v.traversals[0].status = "available"; },
  ]) { const data = input(); mutate(data); assert.throws(() => parsePhase4Snapshot(data), undefined, mutate.toString()); }
});

test("reopening orders observation windows rather than database arrival timestamps", () => {
  const data = input();
  const prior = { ...data.incidents[0], state: "cleared", recovery_end: "2026-10-16T03:55:00.000001Z",
    cleared_at: anchor, recovered_source_count: 3, valid_until: null };
  data.incidents = [prior, { ...data.incidents[0], id: "dfed11cc-b09a-4d8a-8d74-1acee5143308",
    started_at: "2026-10-16T03:56:00.000001Z", last_supported_at: anchor,
    valid_until: "2026-10-16T04:15:00.000001Z", prior_incident_id: prior.id }];
  assert.deepEqual(parsePhase4Snapshot(data), data);
  data.incidents[1].started_at = prior.recovery_end;
  assert.throws(() => parsePhase4Snapshot(data));
});

test("completed traversal excess preserves microseconds and matches the frozen baseline", () => {
  const data = input();
  Object.assign(data.traversals[0], { status: "available", id, entered_at: "2026-10-16T03:48:45.000001Z", exited_at: anchor,
    baseline_seconds: 180, baseline_label: fixture.segments[0].baseline_label, delay_seconds: 495,
    valid_until: "2026-10-16T04:08:45.000001Z" });
  assert.deepEqual(parsePhase4Snapshot(data), data);
  for (const patch of [ { delay_seconds: 494.999999 }, { baseline_seconds: 181 }, { baseline_label: "another assumption" },
    { entered_at: "2026-10-16T04:00:00.000002Z" }, { exited_at: "2026-10-16T04:00:00.000002Z" },
    { valid_until: "2026-10-16T04:08:45.000002Z" }, { status: "stale" }, { run_id: id } ]) {
    const invalid = structuredClone(data); Object.assign(invalid.traversals[0], patch); assert.throws(() => parsePhase4Snapshot(invalid));
  }
});
