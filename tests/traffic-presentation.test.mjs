import assert from "node:assert/strict";
import { test } from "node:test";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { latestSegmentSamples, resolveSegment, formatTrafficTime, snapshotReadTime } from "../apps/web/src/lib/traffic/presentation.ts";
import * as presentation from "../apps/web/src/lib/traffic/presentation.ts";
import { sampleFreshness } from "../apps/web/src/lib/traffic/snapshot.ts";

const fixture = createTrafficFixture("slowdown", "2026-10-15T04:00:00.000Z");

test("selection defaults only when absent and never silently replaces an unknown or duplicate ID", () => {
  assert.equal(resolveSegment(fixture, []).id, "primary-west");
  assert.equal(resolveSegment(fixture, ["primary-west-inbound"]).direction, "inbound");
  for (const ids of [["unknown"], [""], ["primary-west", "primary-west"]]) assert.equal(resolveSegment(fixture, ids), null);
});

test("latest samples use one segment and timestamp, preserve source speeds, and represent missing data", () => {
  const result = latestSegmentSamples(fixture, "primary-west");
  assert.equal(result.observedAt, fixture.corridor.anchor_at);
  assert.equal(result.samples.length, 3);
  assert.ok(result.samples.every(sample => sample.speed_kph === 8 && sample.segment_id === "primary-west"));
  assert.equal(latestSegmentSamples(fixture, "primary-west-inbound").samples[0].speed_kph, 30);
  assert.deepEqual(latestSegmentSamples(fixture, "missing"), { observedAt: null, samples: [] });
  const shuffled = structuredClone(fixture);
  shuffled.observations.reverse();
  assert.deepEqual(latestSegmentSamples(shuffled, "primary-west"), result);
});

test("latest samples and freshness preserve submillisecond ordering", () => {
  const input = structuredClone(fixture);
  input.observations.push({ ...input.observations.find(row => row.segment_id === "primary-west"), observed_at: "2026-10-15T04:00:00.000001Z" });
  const latest = latestSegmentSamples(input, "primary-west");
  assert.equal(latest.observedAt, "2026-10-15T04:00:00.000001Z");
  assert.equal(latest.samples.length, 1);
  assert.equal(presentation.snapshotFreshness(latest.observedAt, "2026-10-15T04:00:00.000002Z", 0), "recent");
});

test("snapshot freshness advances by elapsed time independently of browser wall-clock skew", context => {
  const snapshot = { read_at: fixture.corridor.anchor_at, fixture };
  context.mock.timers.enable({ apis: ["Date"], now: 0 });
  for (const wallTime of ["2099-01-01T00:00:00Z", "2001-01-01T00:00:00Z", snapshot.read_at]) {
    context.mock.timers.setTime(Date.parse(wallTime));
    const readAt = elapsedMs => snapshotReadTime(snapshot, { snapshot, elapsedMs });
    assert.equal(snapshotReadTime(snapshot, null), snapshot.read_at);
    assert.equal(readAt(30_000), "2026-10-15T04:00:30.000Z");
    assert.equal(sampleFreshness(snapshot.read_at, readAt(20 * 60_000 - 1)), "recent");
    assert.equal(sampleFreshness(snapshot.read_at, readAt(20 * 60_000)), "stale");
    const futureSample = "2026-10-15T04:01:00.000Z";
    assert.equal(sampleFreshness(futureSample, readAt(0)), "future");
    assert.equal(sampleFreshness(futureSample, readAt(60_000 - 1)), "future");
    assert.equal(sampleFreshness(futureSample, readAt(60_000)), "recent");
  }
});

test("new snapshots discard prior elapsed clocks even when their read timestamps match", () => {
  const previous = { read_at: fixture.corridor.anchor_at, fixture };
  const previousClock = { snapshot: previous, elapsedMs: 60 * 60_000 };
  assert.equal(snapshotReadTime(previous, previousClock), "2026-10-15T05:00:00.000Z");
  for (const read_at of [previous.read_at, "2026-10-15T03:59:00.000Z", "2026-10-15T04:01:00.000Z"]) {
    const snapshot = { read_at, fixture };
    assert.equal(snapshotReadTime(snapshot, previousClock), read_at);
    assert.equal(snapshotReadTime(snapshot, { snapshot, elapsedMs: 0 }), read_at);
    assert.equal(Date.parse(snapshotReadTime(snapshot, { snapshot, elapsedMs: 30_000 })), Date.parse(read_at) + 30_000);
  }
});

test("conservative elapsed time expires observations but never promotes future observations", () => {
  const readAt = "2026-10-15T04:00:00.000Z";
  assert.equal(presentation.snapshotFreshness("2026-10-15T04:05:00.000Z", readAt, 10 * 60000), "future");
  assert.equal(presentation.snapshotFreshness("2026-10-15T04:05:00.000Z", readAt, 86400000), "future");
  assert.equal(presentation.snapshotFreshness("2026-10-15T03:45:00.000Z", readAt, 10 * 60000), "stale");
  assert.equal(presentation.snapshotFreshness("2026-10-15T03:45:00.000Z", readAt, null), "unknown");
  assert.equal(presentation.snapshotFreshness(null, readAt, null), "missing");
  assert.equal(presentation.snapshotFreshness("2026-10-15T04:05:00.000Z", "2026-10-15T04:06:00.000Z", 0), "recent");
});

test("traffic timestamps explicitly use Asia/Kolkata without changing the stored UTC instant", () => {
  const formatted = formatTrafficTime(fixture.corridor.anchor_at);
  assert.match(formatted, /09:30/);
  assert.match(formatted, /Asia\/Kolkata/);
  assert.match(formatted, /2026/);
});
