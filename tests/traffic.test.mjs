import assert from "node:assert/strict";
import test from "node:test";
import { createTrafficFixture, DEMO_CORRIDOR_ID } from "../apps/web/src/lib/traffic/simulator.ts";

const anchor = "2026-10-15T04:00:00.000Z";

test("traffic fixtures are deterministic, fresh objects with explicit simulated provenance", () => {
  const first = createTrafficFixture("normal", anchor);
  const second = createTrafficFixture("normal", anchor);
  assert.deepEqual(first, second);
  assert.equal(first.corridor.id, DEMO_CORRIDOR_ID);
  assert.equal(first.corridor.provenance, "simulated");
  assert.match(first.corridor.geometry_note, /schematic/i);
  assert.equal(first.observations.length, 180);
  assert.equal(first.sources.length, 15);
  assert.equal(new Set(first.sources.map(source => source.id)).size, 15);
  first.segments[0].geometry.coordinates[0][0] = 0;
  assert.deepEqual(createTrafficFixture("normal", anchor), second);
  assert.equal(Object.hasOwn(second, "generated_at"), false, "the wall clock must not affect a fixture");
});

test("only supported scenarios and canonical millisecond UTC anchors are accepted", () => {
  for (const scenario of [undefined, "", "live", "SLOWDOWN", {}, null]) {
    assert.throws(() => createTrafficFixture(scenario, anchor), /scenario/i);
  }
  for (const invalid of [undefined, null, "", "yesterday", "2026-02-30T04:00:00.000Z", "2026-10-15", "2026-10-15T04:00:00+05:30", "2026-10-15T04:00:00Z", 0]) {
    assert.throws(() => createTrafficFixture("normal", invalid), /UTC/i);
  }
});

test("routes have contiguous directed segments, shared endpoints and assumed baselines", () => {
  const fixture = createTrafficFixture("normal", anchor);
  assert.deepEqual(fixture.routes.map(route => route.kind).sort(), ["alternative", "primary"]);
  const endpoints = [];
  for (const route of fixture.routes) {
    const members = fixture.route_segments.filter(row => row.route_id === route.id).sort((a, b) => a.position - b.position);
    assert.deepEqual(members.map(row => row.position), [1, 2]);
    const segments = members.map(row => fixture.segments.find(segment => segment.id === row.segment_id));
    for (const [index, segment] of segments.entries()) {
      assert.equal(segment.direction, route.direction);
      assert.equal(members[index].direction, route.direction);
      assert.ok(segment.baseline_seconds > 0 && segment.length_m > 0);
      assert.match(segment.baseline_label, /assum/i);
      assert.equal(segment.geometry.type, "LineString");
      for (const [longitude, latitude] of segment.geometry.coordinates) {
        assert.ok(longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90);
      }
      if (index) assert.deepEqual(segments[index - 1].geometry.coordinates.at(-1), segment.geometry.coordinates[0]);
    }
    endpoints.push([segments[0].geometry.coordinates[0], segments.at(-1).geometry.coordinates.at(-1)]);
  }
  assert.deepEqual(endpoints[0], endpoints[1]);
  assert.ok(fixture.segments.some(segment => segment.direction === "inbound"));
});

test("slowdown is limited to one outbound segment and lasts six complete sample intervals", () => {
  const fixture = createTrafficFixture("slowdown", anchor);
  const affected = fixture.segments.find(segment => segment.id === "primary-west");
  const baselineSpeed = affected.length_m / affected.baseline_seconds * 3.6;
  const slow = fixture.observations.filter(row => row.speed_kph < baselineSpeed * 0.4);
  assert.equal(slow.length, 7 * 3);
  assert.deepEqual([...new Set(slow.map(row => row.segment_id))], ["primary-west"]);
  assert.equal(Date.parse(slow.at(-1).observed_at) - Date.parse(slow[0].observed_at), 6 * 60_000);
  assert.equal(slow.at(-1).observed_at, anchor);
  assert.equal(new Set(slow.map(row => row.source_id)).size, 3);
  const normal = createTrafficFixture("normal", anchor);
  assert.deepEqual(fixture.observations.filter(row => row.segment_id !== affected.id), normal.observations.filter(row => row.segment_id !== affected.id));
});

test("recovery follows slowdown with five complete minutes of recovered samples", () => {
  const fixture = createTrafficFixture("recovery", anchor);
  const samples = fixture.observations.filter(row => row.segment_id === "primary-west" && row.source_id === "primary-west-source-1");
  assert.equal(samples.length, 12);
  assert.ok(samples.slice(0, 6).every(row => row.speed_kph === 8));
  assert.ok(samples.slice(6).every(row => row.speed_kph === 28));
  assert.equal(Date.parse(samples.at(-1).observed_at) - Date.parse(samples[6].observed_at), 5 * 60_000);
});

test("observations reference synthetic segment-bound sources, never accounts or derived claims", () => {
  const fixture = createTrafficFixture("slowdown", anchor);
  const keys = new Set();
  for (const observation of fixture.observations) {
    assert.deepEqual(Object.keys(observation).sort(), ["observed_at", "segment_id", "source_id", "speed_kph"]);
    const source = fixture.sources.find(source => source.id === observation.source_id);
    assert.equal(source.segment_id, observation.segment_id);
    const key = `${observation.segment_id}:${observation.source_id}:${observation.observed_at}`;
    assert.equal(keys.has(key), false);
    keys.add(key);
    assert.ok(Date.parse(observation.observed_at) <= Date.parse(anchor));
  }
  for (const field of ["user_id", "email", "journey_id", "confidence", "cause", "corroborated", "delay_seconds"]) {
    assert.equal(JSON.stringify(fixture).includes(`"${field}"`), false);
  }
});
