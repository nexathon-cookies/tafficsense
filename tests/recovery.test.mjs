import assert from "node:assert/strict";
import { test } from "node:test";
import { assessRecovery } from "../apps/web/src/lib/evidence/recovery.ts";
import { assessSlowdown } from "../apps/web/src/lib/evidence/slowdown.ts";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parseTrafficSnapshot } from "../apps/web/src/lib/traffic/snapshot.ts";

const end = "2026-10-16T04:00:00.000Z";
const iso = milliseconds => new Date(milliseconds).toISOString();
const fields = ["segment_id", "direction", "status", "slowdown_start", "slowdown_end", "recovery_start", "recovery_end", "complete_source_count", "prior_slow_source_count", "recovered_source_count", "continuous_source_count", "conflicting_source_count", "valid_until", "provenance"].sort();
function snapshot(count = 3) {
  const fixture = createTrafficFixture("recovery", end);
  fixture.sources = Array.from({ length: count }, (_, index) => ({ id: `source-${index}`, segment_id: "primary-west", label: "SIMULATED source" }));
  fixture.observations = fixture.sources.flatMap(source => Array.from({ length: 12 }, (_, index) => ({
    segment_id: source.segment_id, source_id: source.id, observed_at: iso(Date.parse(end) - (11 - index) * 60000), speed_kph: index < 6 ? 8 : 28,
  })));
  return { read_at: end, fixture, reports: [], incident_episodes: [], reporting_enabled: false, report_assessments: fixture.segments.map(segment => ({
    segment_id: segment.id, direction: segment.direction, report_count: 0, recent_report_count: 0, eligible_report_count: 0,
    eligible_source_count: 0, multiple_sources: false, valid_until: null, provenance: "simulated",
  })) };
}
const west = value => assessRecovery(value).find(row => row.segment_id === "primary-west");
const isRecovery = row => Date.parse(row.observed_at) >= Date.parse(end) - 5 * 60000;
function speeds(value, before, after) {
  for (const row of value.fixture.observations) row.speed_kph = isRecovery(row) ? after : before;
  return value;
}
function phase(value, remainder) {
  for (const row of value.fixture.observations) row.observed_at = row.observed_at.replace("Z", `${String(remainder).padStart(3, "0")}Z`);
  value.read_at = value.read_at.replace("Z", `${String(remainder).padStart(3, "0")}Z`);
  return value;
}

test("recovery returns an allowlisted simulated proof without mutation or persistent clearance", () => {
  const value = parseTrafficSnapshot(snapshot());
  const before = structuredClone(value);
  const rows = assessRecovery(value);
  assert.equal(rows.length, 5);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), fields);
  assert.deepEqual(west(value), { segment_id: "primary-west", direction: "outbound", status: "supported",
    slowdown_start: "2026-10-16T03:49:00.000Z", slowdown_end: "2026-10-16T03:54:00.000Z",
    recovery_start: "2026-10-16T03:55:00.000Z", recovery_end: end, complete_source_count: 3,
    prior_slow_source_count: 3, recovered_source_count: 3, continuous_source_count: 3, conflicting_source_count: 0,
    valid_until: "2026-10-16T04:09:00.000Z", provenance: "simulated" });
  assert.deepEqual(value, before);
  assert.deepEqual(assessRecovery({ ...value, fixture: null }), []);
  assert.equal(assessSlowdown(value)[0].status, "not_supported", "Historical support must not become current L4.");
});

test("the actual recovery fixture proves its samples, while normal and slowdown do not", () => {
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    const value = snapshot(); value.fixture = createTrafficFixture(scenario, end);
    assert.equal(west(parseTrafficSnapshot(value)).status === "supported", scenario === "recovery");
    for (const row of assessRecovery(value).filter(row => row.segment_id !== "primary-west")) assert.notEqual(row.status, "supported");
  }
  const value = snapshot(); const expected = assessRecovery(value);
  for (const scenario of ["normal", "slowdown"]) {
    value.fixture.corridor.scenario = scenario;
    value.reports = [{ category: "accident", episode_id: "ignored" }];
    value.incident_episodes = [{ id: "ignored" }];
    value.report_assessments = [{ multiple_sources: true, eligible_source_count: 999 }];
    assert.deepEqual(assessRecovery(value), expected, "Labels, reports and L3 cannot change the recovery proof.");
  }
});

test("strict recovery threshold rejects exactly seventy percent and uses every sample", () => {
  for (const [speed, supported] of [[0, false], [20.99, false], [21, false], [21.01, true], [160, true]]) {
    const row = west(speeds(snapshot(), 8, speed));
    assert.equal(row.status === "supported", supported);
    assert.equal(row.recovered_source_count, supported ? 3 : 0);
  }
  const value = snapshot(); value.fixture.observations.find(isRecovery).speed_kph = 21;
  assert.equal(west(value).status, "threshold_not_met");
  assert.equal(west(value).recovered_source_count, 2);
});

test("decimal cross-products do not round baseline speeds or accept exact equality", () => {
  const value = speeds(snapshot(), 0, 17.5);
  Object.assign(value.fixture.segments[0], { length_m: 1000, baseline_seconds: 144 });
  assert.equal(west(value).status, "threshold_not_met");
  Object.assign(value.fixture.segments[0], { length_m: 1001, baseline_seconds: 144 });
  assert.equal(west(value).status, "threshold_not_met", "17.5 is below the unrounded 17.5175 threshold.");
  for (const row of value.fixture.observations.filter(isRecovery)) row.speed_kph = 17.52;
  assert.equal(west(value).status, "supported");
  Object.assign(value.fixture.segments[0], { length_m: 1001, baseline_seconds: 300 });
  for (const row of value.fixture.observations.filter(isRecovery)) row.speed_kph = 8.4084;
  assert.equal(west(value).status, "threshold_not_met", "Exact decimal equality must fail even beyond persisted speed precision.");
});

test("earlier support reuses the existing strict forty-percent rule", () => {
  for (const [speed, expected] of [[0, "supported"], [11.99, "supported"], [12, "no_prior_slowdown"], [12.01, "no_prior_slowdown"]]) {
    assert.equal(west(speeds(snapshot(), speed, 28)).status, expected);
  }
});

test("three complete sources are required across both windows, not a rotating union", () => {
  for (const count of [0, 1, 2, 3, 4, 6]) {
    const row = west(snapshot(count));
    assert.equal(row.status, count === 0 ? "missing" : count < 3 ? "insufficient" : "supported");
    assert.equal(row.continuous_source_count, count);
  }
  const rotated = snapshot(6);
  rotated.fixture.observations = rotated.fixture.observations.filter(row => (Number(row.source_id.slice(-1)) < 3) !== isRecovery(row));
  assert.equal(west(rotated).status, "insufficient");
  assert.equal(west(rotated).complete_source_count, 0);
  const split = snapshot(6);
  for (const row of split.fixture.observations) {
    const first = Number(row.source_id.slice(-1)) < 3;
    row.speed_kph = isRecovery(row) ? first ? 15 : 28 : first ? 8 : 30;
  }
  assert.equal(west(split).prior_slow_source_count, 3);
  assert.equal(west(split).recovered_source_count, 3);
  assert.equal(west(split).continuous_source_count, 0);
  assert.equal(west(split).status, "cohort_mismatch");
});

test("another complete slowdown cohort blocks recovery even if it lacks prior-window samples", () => {
  const value = snapshot(6);
  for (const row of value.fixture.observations) if (Number(row.source_id.slice(-1)) >= 3) row.speed_kph = 8;
  assert.equal(west(value).status, "conflicting");
  assert.equal(west(value).conflicting_source_count, 3);
  value.fixture.observations = value.fixture.observations.filter(row => Number(row.source_id.slice(-1)) < 3 || isRecovery(row));
  assert.equal(west(value).status, "conflicting");
  assert.equal(west(value).complete_source_count, 3);
});

test("partially overlapping supporting cohorts need exactly three common sources", () => {
  for (const shared of [2, 3]) {
    const value = snapshot(6);
    for (const row of value.fixture.observations) {
      const index = Number(row.source_id.slice(-1));
      const recovering = index >= 4 - shared && index < 8 - shared;
      row.speed_kph = isRecovery(row) ? recovering ? 28 : 15 : index < 4 ? 8 : 30;
    }
    const row = west(value);
    assert.equal(row.prior_slow_source_count, 4); assert.equal(row.recovered_source_count, 4);
    assert.equal(row.continuous_source_count, shared);
    assert.equal(row.status, shared === 3 ? "supported" : "cohort_mismatch");
  }
});

test("only three eligible terminal slowdown sources block an otherwise supported recovery", () => {
  for (const defect of ["two", "missing", "duplicate", "off-grid", "threshold"]) {
    const value = snapshot(6);
    for (const row of value.fixture.observations) if (Number(row.source_id.slice(-1)) >= 3) row.speed_kph = 8;
    const target = value.fixture.observations.find(row => row.source_id === "source-3" && isRecovery(row));
    if (defect === "two") for (const row of value.fixture.observations.filter(row => row.source_id === "source-3" && isRecovery(row))) row.speed_kph = 15;
    if (defect === "missing") value.fixture.observations.splice(value.fixture.observations.indexOf(target), 1);
    if (defect === "duplicate") value.fixture.observations.push({ ...target });
    if (defect === "off-grid") value.fixture.observations.push({ ...target, observed_at: "2026-10-16T03:57:30.000Z" });
    if (defect === "threshold") target.speed_kph = 12;
    assert.equal(west(value).conflicting_source_count, 2, defect);
    assert.equal(west(value).status, "supported", defect);
  }
});

test("five ticks, missing, duplicate and off-grid observations cannot complete a proof", () => {
  for (const index of [0, 3, 5, 6, 8, 11]) {
    const value = snapshot(); value.fixture.observations.splice(index, 1);
    assert.equal(west(value).complete_source_count, 2);
    assert.equal(west(value).status, "insufficient");
  }
  for (const time of ["2026-10-16T03:51:30.000Z", "2026-10-16T03:54:30.000Z", "2026-10-16T03:57:30.000Z", "2026-10-16T03:55:00.000Z"]) {
    const value = snapshot(); value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: time });
    assert.equal(west(value).complete_source_count, 2);
    assert.equal(west(value).status, "insufficient");
  }
  const outside = snapshot(); outside.fixture.observations.push({ ...outside.fixture.observations[0], observed_at: "2026-10-16T03:48:59.999Z" });
  assert.equal(west(outside).status, "supported");
  const shuffled = snapshot(); shuffled.fixture.observations.reverse(); assert.equal(west(shuffled).status, "supported");
});

test("windows must be adjacent, ordered, non-overlapping and terminal", () => {
  const reversed = speeds(snapshot(), 28, 8); assert.notEqual(west(reversed).status, "supported");
  for (const shift of [-60000, 1, 60000]) {
    const value = snapshot();
    for (const row of value.fixture.observations.filter(row => !isRecovery(row))) row.observed_at = iso(Date.parse(row.observed_at) + shift);
    assert.notEqual(west(value).status, "supported");
  }
  for (const speed of [8, 15, 28]) {
    const value = snapshot(); value.read_at = "2026-10-16T04:01:00.000Z";
    value.fixture.sources.push({ id: "new", segment_id: "primary-west", label: "SIMULATED incomplete source" });
    value.fixture.observations.push({ ...value.fixture.observations[0], source_id: "new", observed_at: value.read_at, speed_kph: speed });
    assert.equal(west(value).recovery_end, value.read_at); assert.equal(west(value).status, "insufficient");
  }
});

test("bindings isolate opposite and parallel segments and reject duplicated identities", () => {
  for (const segment_id of ["primary-west-inbound", "alternative-west"]) {
    const value = snapshot(2);
    value.fixture.sources.push({ id: "other", segment_id, label: "SIMULATED other" });
    value.fixture.observations.push(...value.fixture.observations.slice(0, 12).map(row => ({ ...row, source_id: "other", segment_id })));
    value.fixture.observations.push({ ...value.fixture.observations[0], source_id: "other", observed_at: "2026-10-16T04:00:01.000Z" });
    value.fixture.observations.push({ ...value.fixture.observations[0], source_id: "unknown" });
    assert.equal(west(value).complete_source_count, 2); assert.equal(west(value).valid_until, "2026-10-16T04:09:00.000Z");
    assert.equal(assessRecovery(value).find(row => row.segment_id === segment_id).complete_source_count, 1);
  }
  const duplicated = snapshot(); duplicated.fixture.sources.push({ ...duplicated.fixture.sources[0] });
  assert.equal(west(duplicated).complete_source_count, 2);
});

test("freshness uses the earliest proof sample, with exact microsecond boundaries", () => {
  const value = phase(snapshot(), 999);
  value.read_at = "2026-10-16T04:09:00.000998Z";
  assert.equal(west(value).status, "supported"); assert.equal(west(value).valid_until, "2026-10-16T04:09:00.000Z");
  value.read_at = "2026-10-16T04:09:00.000999Z";
  const stale = west(value); assert.equal(stale.status, "stale"); assert.equal(stale.valid_until, null);
  for (const [key, count] of Object.entries(stale).filter(([key]) => key.endsWith("_count"))) assert.equal(count, 0, key);
  value.read_at = "2026-10-16T04:10:00.000Z"; assert.equal(west(value).status, "stale", "A recent recovery does not freshen its earlier slowdown.");
});

test("arbitrary millisecond phase and microsecond cadence stay exact", () => {
  const value = phase(snapshot(), 123);
  assert.equal(west(value).status, "supported"); assert.equal(west(value).recovery_end, "2026-10-16T04:00:00.000123Z");
  for (const remainder of [122, 124]) {
    const irregular = structuredClone(value);
    irregular.fixture.observations[7].observed_at = `2026-10-16T03:56:00.000${remainder}Z`;
    assert.equal(west(irregular).complete_source_count, 2);
  }
  const shifted = snapshot();
  for (const row of shifted.fixture.observations) row.observed_at = iso(Date.parse(row.observed_at) + 17321);
  shifted.read_at = iso(Date.parse(end) + 17321); assert.equal(west(shifted).status, "supported");
});

test("future observations require a new read and conservatively bound the deadline", () => {
  const value = snapshot(); value.read_at = "2026-10-16T03:48:00.000Z";
  assert.equal(west(value).status, "future"); assert.equal(west(value).recovery_end, null); assert.equal(west(value).valid_until, "2026-10-16T03:49:00.000Z");
  value.read_at = "2026-10-16T04:00:00.000100Z";
  value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: "2026-10-16T04:00:00.000101Z" });
  assert.equal(west(value).status, "supported"); assert.equal(west(value).valid_until, end);
  value.read_at = "2026-10-16T04:00:00.000101Z"; assert.notEqual(west(value).status, "supported");
  const stale = snapshot(); stale.read_at = "2026-10-16T04:10:00.000Z";
  stale.fixture.observations.push({ ...stale.fixture.observations[0], observed_at: "2026-10-16T04:11:00.123456Z" });
  assert.equal(west(stale).status, "stale"); assert.equal(west(stale).valid_until, "2026-10-16T04:11:00.123Z");
});

test("invalid clocks, baselines and bound observations abstain without throwing", () => {
  for (const read_at of ["bad", "2026-02-30T00:00:00.000Z", "2200-01-01T00:00:00.000Z"]) assert.equal(west({ ...snapshot(), read_at }).status, "unavailable");
  for (const patch of [{ length_m: 0 }, { length_m: NaN }, { baseline_seconds: 0 }, { baseline_seconds: 1.5 }, { baseline_label: "" }]) {
    const value = snapshot(); Object.assign(value.fixture.segments[0], patch); assert.equal(west(value).status, "unavailable");
  }
  for (const patch of [{ speed_kph: -1 }, { speed_kph: 161 }, { speed_kph: NaN }, { observed_at: "bad" }]) {
    const value = snapshot(); Object.assign(value.fixture.observations[0], patch); assert.equal(west(value).status, "unavailable");
  }
});
