import assert from "node:assert/strict";
import { test } from "node:test";
import { assessSlowdown } from "../apps/web/src/lib/evidence/slowdown.ts";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { parseTrafficSnapshot } from "../apps/web/src/lib/traffic/snapshot.ts";

const end = "2026-10-16T04:00:00.000Z";
const fields = ["segment_id", "direction", "status", "window_start", "window_end", "complete_source_count", "slow_source_count", "valid_until", "provenance"].sort();
const iso = milliseconds => new Date(milliseconds).toISOString();
function snapshot(count = 3, ticks = 6, speed = 8) {
  const fixture = createTrafficFixture("slowdown", end);
  fixture.sources = Array.from({ length: count }, (_, index) => ({ id: `source-${index}`, segment_id: "primary-west", label: "SIMULATED source" }));
  fixture.observations = fixture.sources.flatMap(source => Array.from({ length: ticks }, (_, index) => ({
    segment_id: source.segment_id, source_id: source.id, observed_at: iso(Date.parse(end) - (ticks - 1 - index) * 60000), speed_kph: speed,
  })));
  return { read_at: end, fixture, reports: [], incident_episodes: [], reporting_enabled: false, report_assessments: fixture.segments.map(segment => ({
    segment_id: segment.id, direction: segment.direction, report_count: 0, recent_report_count: 0, eligible_report_count: 0,
    eligible_source_count: 0, multiple_sources: false, valid_until: null, provenance: "simulated",
  })) };
}
const west = value => assessSlowdown(value).find(row => row.segment_id === "primary-west");
function shift(value, milliseconds) {
  for (const observation of value.fixture.observations) observation.observed_at = iso(Date.parse(observation.observed_at) + milliseconds);
  value.read_at = iso(Date.parse(value.read_at) + milliseconds);
  return value;
}
function micros(timestamp, remainder) { return timestamp.replace(/Z$/, `${String(remainder).padStart(3, "0")}Z`); }

test("one minimal simulated assessment per active segment, no fixture gives no rows, and inputs stay unchanged", () => {
  const value = snapshot();
  const before = structuredClone(value);
  const rows = assessSlowdown(value);
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), fields);
    assert.equal(row.provenance, "simulated");
  }
  assert.deepEqual(west(value), { segment_id: "primary-west", direction: "outbound", status: "supported",
    window_start: "2026-10-16T03:55:00.000Z", window_end: end, complete_source_count: 3, slow_source_count: 3,
    valid_until: "2026-10-16T04:15:00.000Z", provenance: "simulated" });
  assert.deepEqual(value, before);
  assert.deepEqual(assessSlowdown({ ...value, fixture: null, report_assessments: [] }), []);
});

test("zero, one, two, three and additional sources are counted across all six timestamps", () => {
  for (const count of [0, 1, 2, 3, 4, 6]) {
    const row = west(snapshot(count));
    assert.equal(row.status, count === 0 ? "missing" : count < 3 ? "insufficient" : "supported");
    assert.equal(row.complete_source_count, count);
    assert.equal(row.slow_source_count, count);
  }
  const value = snapshot(4);
  value.fixture.observations.find(row => row.source_id === "source-3").speed_kph = 30;
  assert.equal(west(value).status, "supported");
  assert.equal(west(value).slow_source_count, 3);
});

test("five timestamps are only four intervals; the six samples must span five exact minutes", () => {
  assert.equal(west(snapshot(3, 5)).status, "insufficient");
  const short = snapshot();
  for (const observation of short.fixture.observations) if (observation.observed_at.endsWith("55:00.000Z")) observation.observed_at = "2026-10-16T03:55:00.001Z";
  assert.equal(west(short).complete_source_count, 0);
  const phased = shift(snapshot(), 17321);
  assert.equal(west(phased).status, "supported");
  assert.equal(west(phased).window_start, "2026-10-16T03:55:17.321Z");
});

test("strict threshold uses all six samples, permits zero and rejects exactly forty percent", () => {
  for (const [speed, status] of [[0, "supported"], [11.99, "supported"], [12, "not_supported"], [12.01, "not_supported"]]) {
    const value = snapshot(3, 6, speed);
    assert.equal(west(value).status, status);
    assert.equal(west(value).complete_source_count, 3);
  }
  const value = snapshot();
  value.fixture.observations[2].speed_kph = 12;
  assert.equal(west(value).status, "not_supported");
  assert.equal(west(value).slow_source_count, 2);
});

test("baseline comparison never rounds the assumed baseline and handles decimal threshold equality", () => {
  const value = snapshot(3, 6, 4.8);
  Object.assign(value.fixture.segments[0], { length_m: 1001, baseline_seconds: 300 });
  assert.equal(west(value).status, "supported", "4.8 is below the unrounded 4.8048 threshold");
  Object.assign(value.fixture.segments[0], { length_m: 1000, baseline_seconds: 300 });
  assert.equal(west(value).status, "not_supported", "4.8 equals the exact threshold");
  Object.assign(value.fixture.segments[0], { length_m: 1001, baseline_seconds: 144 });
  for (const row of value.fixture.observations) row.speed_kph = 10.01;
  assert.equal(west(value).status, "not_supported", "numeric(6,2) equality must not slip through floating point multiplication");
  Object.assign(value.fixture.segments[0], { length_m: 1001, baseline_seconds: 301 });
  for (const row of value.fixture.observations) row.speed_kph = 4.79;
  assert.equal(west(value).status, "not_supported", "rounding a 11.972... baseline to 12 would incorrectly support 4.79");
});

test("missing middle tick and rotating cohorts cannot form three complete sources", () => {
  const value = snapshot();
  value.fixture.observations.splice(2, 1);
  assert.equal(west(value).complete_source_count, 2);
  assert.equal(west(value).status, "insufficient");
  const rotating = snapshot(6);
  rotating.fixture.observations = rotating.fixture.observations.filter(row => (Number(row.source_id.slice(-1)) < 3) === (row.observed_at < "2026-10-16T03:58:00.000Z"));
  assert.equal(west(rotating).complete_source_count, 0);
});

test("off-grid observations exclude their source even if slow; out-of-window rows do not", () => {
  for (const speed of [0, 30]) {
    const value = snapshot();
    value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: "2026-10-16T03:57:30.000Z", speed_kph: speed });
    assert.equal(west(value).complete_source_count, 2);
    assert.equal(west(value).status, "insufficient");
  }
  const outside = snapshot();
  outside.fixture.observations.push({ ...outside.fixture.observations[0], observed_at: "2026-10-16T03:54:59.999Z", speed_kph: 30 });
  assert.equal(west(outside).status, "supported");
});

test("source binding, opposite direction and parallel alternatives cannot contribute or move the terminal time", () => {
  const value = snapshot(2);
  const source = { id: "inbound", segment_id: "primary-west-inbound", label: "SIMULATED inbound" };
  value.fixture.sources.push(source);
  value.fixture.observations.push(...value.fixture.observations.slice(0, 6).map(row => ({ ...row, source_id: source.id, segment_id: source.segment_id })));
  value.fixture.observations.push({ ...value.fixture.observations[0], source_id: source.id, observed_at: "2026-10-16T04:00:01.000Z" });
  value.fixture.observations.push({ ...value.fixture.observations[0], source_id: "unknown" });
  assert.equal(west(value).complete_source_count, 2);
  assert.equal(west(value).valid_until, "2026-10-16T04:15:00.000Z");
  const rows = assessSlowdown(value);
  assert.equal(rows.find(row => row.segment_id === source.segment_id).complete_source_count, 1);
  assert.equal(rows.find(row => row.segment_id === "alternative-west").status, "missing");
});

test("shuffled rows do not matter and duplicate or conflicting ticks cannot inflate a source", () => {
  const value = snapshot();
  value.fixture.observations.reverse();
  assert.equal(west(value).status, "supported");
  for (const speed of [8, 30]) {
    const duplicate = snapshot();
    duplicate.fixture.observations.push({ ...duplicate.fixture.observations[0], speed_kph: speed });
    assert.equal(west(duplicate).complete_source_count, 2);
    assert.throws(() => parseTrafficSnapshot(duplicate), /Invalid traffic snapshot/);
  }
});

test("terminal observations across every bound source prevent cherry-picking earlier slowdown", () => {
  for (const speed of [8, 15, 30]) {
    const value = snapshot();
    value.read_at = "2026-10-16T04:01:00.000Z";
    value.fixture.sources.push({ id: "new", segment_id: "primary-west", label: "SIMULATED incomplete source" });
    value.fixture.observations.push({ ...value.fixture.observations[0], source_id: "new", observed_at: value.read_at, speed_kph: speed });
    assert.equal(west(value).window_end, value.read_at);
    assert.equal(west(value).status, "insufficient");
    assert.equal(west(value).complete_source_count, 0);
  }
  for (const speed of [15, 28]) {
    const value = snapshot(3, 12);
    for (const row of value.fixture.observations) if (row.observed_at === end) row.speed_kph = speed;
    assert.equal(west(value).status, "not_supported");
  }
});

test("oldest sample is the freshness boundary; stale windows have zero current counts", () => {
  const value = snapshot();
  value.read_at = "2026-10-16T04:14:59.999999Z";
  assert.equal(west(value).status, "supported");
  value.read_at = "2026-10-16T04:15:00.000Z";
  assert.equal(west(value).status, "stale");
  assert.equal(west(value).complete_source_count, 0);
  assert.equal(west(value).slow_source_count, 0);
  assert.equal(west(value).valid_until, null);
  value.read_at = "2026-10-16T04:16:00.000Z";
  assert.equal(west(value).status, "stale", "a sixteen-minute-old latest sample does not keep a twenty-one-minute-old start fresh");
});

test("future-only, missing and mixed future samples stay distinct and require a new server read", () => {
  const value = snapshot();
  value.read_at = "2026-10-16T03:54:00.000Z";
  assert.equal(west(value).status, "future");
  assert.equal(west(value).window_start, null);
  assert.equal(west(value).window_end, null);
  assert.equal(west(value).valid_until, "2026-10-16T03:55:00.000Z");
  value.read_at = end;
  value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: "2026-10-16T04:00:10.123456Z", speed_kph: 30 });
  assert.equal(west(value).status, "supported");
  assert.equal(west(value).valid_until, "2026-10-16T04:00:10.123Z");
  value.read_at = "2026-10-16T04:00:10.123456Z";
  assert.equal(west(value).status, "insufficient");
  const missing = west(snapshot(0));
  assert.equal(missing.status, "missing");
  assert.equal(missing.valid_until, null);
  assert.equal(missing.window_start, null);
});

test("stale windows keep only a future-observation deadline and current windows use the earlier deadline", () => {
  const value = snapshot();
  value.read_at = "2026-10-16T04:16:00.000Z";
  value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: "2026-10-16T04:17:00.000001Z" });
  assert.equal(west(value).status, "stale");
  assert.equal(west(value).valid_until, "2026-10-16T04:17:00.000Z");
  value.read_at = end;
  assert.equal(west(value).valid_until, "2026-10-16T04:15:00.000Z");
});

test("microsecond cadence is exact, including 59.999999 and 60.000001 seconds", () => {
  const value = snapshot();
  for (const row of value.fixture.observations) row.observed_at = micros(row.observed_at, 123);
  value.read_at = micros(end, 123);
  assert.equal(west(value).status, "supported");
  assert.equal(west(value).window_start, "2026-10-16T03:55:00.000123Z");
  assert.equal(west(value).window_end, "2026-10-16T04:00:00.000123Z");
  assert.equal(west(value).valid_until, "2026-10-16T04:15:00.000Z");
  for (const remainder of [122, 124]) {
    const irregular = structuredClone(value);
    irregular.fixture.observations[1].observed_at = micros("2026-10-16T03:56:00.000Z", remainder);
    assert.equal(west(irregular).complete_source_count, 2);
    assert.equal(west(irregular).status, "insufficient");
  }
});

test("submillisecond future eligibility and freshness are not truncated and deadlines never round up", () => {
  const value = snapshot();
  value.read_at = "2026-10-16T04:00:00.000100Z";
  value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: "2026-10-16T04:00:00.000101Z" });
  assert.equal(west(value).status, "supported");
  assert.equal(west(value).valid_until, end, "conservative flooring can require immediate refresh within the same millisecond");
  value.read_at = "2026-10-16T04:00:00.000101Z";
  assert.equal(west(value).status, "insufficient");
  const phased = snapshot();
  for (const row of phased.fixture.observations) row.observed_at = micros(row.observed_at, 999);
  phased.read_at = "2026-10-16T04:15:00.000998Z";
  assert.equal(west(phased).status, "supported");
  phased.read_at = "2026-10-16T04:15:00.000999Z";
  assert.equal(west(phased).status, "stale");
});

test("missing or invalid baseline and invalid clocks fail closed as unavailable", () => {
  for (const patch of [{ length_m: undefined }, { length_m: 0 }, { length_m: NaN }, { length_m: Infinity },
    { baseline_seconds: undefined }, { baseline_seconds: 0 }, { baseline_seconds: -1 }, { baseline_seconds: 1.5 }, { baseline_label: "" }]) {
    const value = snapshot();
    Object.assign(value.fixture.segments[0], patch);
    const row = west(value);
    assert.equal(row.status, "unavailable");
    assert.equal(row.complete_source_count, 0);
    assert.equal(row.valid_until, null);
    assert.throws(() => parseTrafficSnapshot(value));
  }
  for (const read_at of ["bad", "2026-02-30T00:00:00.000Z", "2200-01-01T00:00:00.000Z"]) assert.equal(west({ ...snapshot(), read_at }).status, "unavailable");
  for (const patch of [{ speed_kph: -1 }, { speed_kph: NaN }, { observed_at: "bad" }]) {
    const value = snapshot();
    Object.assign(value.fixture.observations[0], patch);
    assert.equal(west(value).status, "unavailable");
    assert.throws(() => parseTrafficSnapshot(value));
  }
});

test("scenario names, reports, reporting gate and L3 never affect L4 or assert a cause or clearance", () => {
  const value = snapshot();
  const expected = assessSlowdown(value);
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    value.fixture.corridor.scenario = scenario;
    value.reporting_enabled = true;
    value.reports = Array.from({ length: 20 }, (_, index) => ({
      id: `a0866416-8ea3-4f6a-81f9-${String(index).padStart(12, "0")}`,
      episode_id: `66ee2d39-c477-42ad-a6b8-${String(index % 2).padStart(12, "0")}`,
      segment_id: "primary-west", direction: "outbound", category: "accident", observed_at: end, received_at: end,
      provenance: "simulated", location_provenance: "manual",
    }));
    value.incident_episodes = value.reports.slice(0, 2).map(report => ({ id: report.episode_id,
      segment_id: "primary-west", direction: "outbound", created_at: end, first_observed_at: end, last_observed_at: end,
      report_count: 10, provenance: "simulated" }));
    value.report_assessments[0] = { ...value.report_assessments[0], report_count: 20, recent_report_count: 20,
      eligible_report_count: 20, eligible_source_count: 20, multiple_sources: true, valid_until: "2026-10-16T04:15:00.000Z" };
    assert.deepEqual(assessSlowdown(parseTrafficSnapshot(value)), expected);
  }
  value.fixture.observations = [];
  assert.equal(west(value).status, "missing", "L3 alone cannot manufacture L4");
  value.reports = []; value.incident_episodes = [];
  Object.assign(value.report_assessments[0], { report_count: 0, recent_report_count: 0, eligible_report_count: 0,
    eligible_source_count: 0, multiple_sources: false, valid_until: null });
  assert.equal(west(parseTrafficSnapshot(value)).status, "missing", "no reports and no samples never implies clear");
});
