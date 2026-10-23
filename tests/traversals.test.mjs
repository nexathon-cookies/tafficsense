import assert from "node:assert/strict";
import { test } from "node:test";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";
import { authoredMotionSchedule } from "../apps/web/src/lib/traffic/motion-schedule.ts";
import { simulateTraversal, traversalTimestampMicros, traversalTimestamp, completedTraversalInput, retainedMotionSchedule } from "../apps/web/src/lib/traffic/traversals.ts";

const anchor = "2026-10-16T10:00:00.123456Z";
const fixture = createTrafficFixture("slowdown", "2026-10-16T10:00:00.123Z");
const segment = fixture.segments[0];
const ids = { traversal_id: "aae744ae-0866-4c15-b672-6bc8bf994721", run_id: "0b9c1f92-c6e7-41c8-8b4c-b109aa535897", batch_id: "0c88e6d4-621c-417d-98c5-c2169c5bac42", source_id: "primary-west-source-1" };
const time = seconds => traversalTimestamp(traversalTimestampMicros(anchor) + seconds * 1000000);
const move = (scenario, entry, end, selected = segment) => simulateTraversal(selected.length_m, authoredMotionSchedule(scenario, selected, anchor), time(entry), time(end));

test("authored schedule preserves every existing scenario sample and source contract", () => {
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    const current = createTrafficFixture(scenario, fixture.corridor.anchor_at);
    for (const selected of current.segments) {
      const schedule = authoredMotionSchedule(scenario, selected, current.corridor.anchor_at);
      for (const sample of current.observations.filter(row => row.segment_id === selected.id)) {
        const at = traversalTimestampMicros(sample.observed_at);
        const step = schedule.find(row => traversalTimestampMicros(row.started_at) <= at && at < traversalTimestampMicros(row.ended_at));
        assert.equal(step.speed_kph, sample.speed_kph);
      }
    }
    assert.deepEqual(Object.keys(current).sort(), ["corridor", "observations", "route_segments", "routes", "segments", "sources"]);
  }
});

test("complete constant slowdown advances from zero to exact exit: 675s and 495s excess", () => {
  const result = move("slowdown", -360, 315);
  assert.equal(result.state, "complete");
  assert.equal(result.distance_m, 1500);
  assert.equal(result.exited_at, time(315));
  assert.equal(result.elapsed_seconds, 675);
  assert.equal(result.steps[0].from_m, 0);
  assert.equal(result.steps.at(-1).to_m, 1500);
  const input = completedTraversalInput(ids, segment, result);
  assert.equal(input.distance_m, 1500);
  assert.equal(input.baseline_seconds, 180);
  assert.equal(result.elapsed_seconds - input.baseline_seconds, 495);
  assert.ok(!Object.hasOwn(input, "delay_seconds"));
  assert.ok(!Object.hasOwn(input, "state"));
});

test("crossing an authored speed change integrates both legs, not length/latest speed", () => {
  const result = move("recovery", -660, 0);
  assert.equal(result.state, "complete");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].to_m, 800);
  assert.equal(result.elapsed_seconds, 450);
  assert.equal(result.exited_at, time(-210));
  assert.notEqual(result.elapsed_seconds, 1500 / (28 / 3.6));
  const normal = move("normal", -600, 0);
  assert.equal(normal.elapsed_seconds, 180);
  const faster = simulateTraversal(1500, [{ started_at: time(-600), ended_at: time(0), speed_kph: 60 }], time(-600), time(0));
  assert.equal(faster.elapsed_seconds, 90);
  assert.equal(Math.max(0, faster.elapsed_seconds - 180), 0);
});

test("partial, stationary and missing schedule never produce a completed input", () => {
  for (const result of [move("slowdown", -360, 314), simulateTraversal(1500, [{ started_at: time(-360), ended_at: time(315), speed_kph: 0 }], time(-360), time(315)), simulateTraversal(1500, [], time(-360), time(315))]) {
    assert.equal(result.state, "partial");
    assert.equal(result.exited_at, null);
    assert.equal(result.elapsed_seconds, null);
    assert.ok(result.distance_m < 1500);
    assert.throws(() => completedTraversalInput(ids, segment, result));
  }
  assert.equal(move("slowdown", 1199, 1200).state, "partial", "bounded schedule never extrapolates past its end");
});

test("microseconds survive timestamp offsets and motion; fractional crossings ceil once at boundary", () => {
  assert.equal(traversalTimestampMicros(anchor) - traversalTimestampMicros("2026-10-16T15:30:00.123455+05:30"), 1);
  assert.equal(traversalTimestamp(traversalTimestampMicros(anchor)), anchor);
  const result = simulateTraversal(1, [{ started_at: anchor, ended_at: time(10), speed_kph: 7 }], anchor, time(10));
  assert.equal(result.exited_at, "2026-10-16T10:00:00.637742Z");
  assert.equal(result.elapsed_seconds, 0.514286);
  assert.equal(result.distance_m, 1);
  for (const invalid of ["2026-02-30T00:00:00Z", "infinity", "2026-10-16T10:00:00.1234567Z", "2026-10-16T25:00:00Z", "2100-01-01T00:00:00Z"]) assert.throws(() => traversalTimestampMicros(invalid));
});

test("six continuous browser expiry samples match authored slow motion and its terminal bound", () => {
  const start = traversalTimestampMicros(anchor) - 360000000;
  const samples = Array.from({ length: 6 }, (_, index) => ({ observed_at: traversalTimestamp(start + index * 60000000), speed_kph: 8 }));
  const schedule = samples.map((sample, index) => ({ started_at: sample.observed_at,
    ended_at: samples[index + 1]?.observed_at ?? time(1200), speed_kph: sample.speed_kph }));
  const result = simulateTraversal(1500, schedule, time(-360), time(315));
  assert.equal(result.exited_at, move("slowdown", -360, 315).exited_at);
  assert.equal(result.elapsed_seconds, 675);
  assert.equal(result.elapsed_seconds - segment.baseline_seconds, 495);
  assert.equal(simulateTraversal(1500, schedule, time(525), time(1200)).exited_at, time(1200));
  assert.equal(simulateTraversal(1500, schedule, traversalTimestamp(traversalTimestampMicros(time(525)) + 1), time(1200)).state, "partial");
});

test("entry within a stopped leg preserves one microsecond excess before forward motion", () => {
  const schedule = [{ started_at: time(-300), ended_at: anchor, speed_kph: 0 }, { started_at: anchor, ended_at: time(1200), speed_kph: 30 }];
  const result = simulateTraversal(1500, schedule, traversalTimestamp(traversalTimestampMicros(anchor) - 1), time(180));
  assert.equal(result.exited_at, time(180));
  assert.equal(result.elapsed_seconds, 180.000001);
  assert.equal(result.steps[0].to_m, 0);
  assert.equal(result.steps[1].to_m, 1500);
});

test("invalid speed, bounds, cadence, overlaps and schedule gaps reject rather than inventing distance", () => {
  const leg = { started_at: time(-600), ended_at: time(0), speed_kph: 30 };
  for (const speed_kph of [-1, 160.01, NaN, Infinity, 8.001]) assert.throws(() => simulateTraversal(1500, [{ ...leg, speed_kph }], time(-600), time(0)));
  for (const length of [0, 100001, 1.1, NaN]) assert.throws(() => simulateTraversal(length, [leg], time(-600), time(0)));
  assert.throws(() => simulateTraversal(1500, [leg], time(0), time(-600)));
  assert.throws(() => simulateTraversal(1500, [leg, leg], time(-600), time(0)));
  assert.throws(() => simulateTraversal(1500, [{ ...leg, ended_at: time(-500) }, { ...leg, started_at: time(-499) }], time(-600), time(0)));
  assert.throws(() => move("normal", -600, 601), /twenty minutes/);
});

test("retained source schedule requires all exact authored ticks and freezes baseline/direction", () => {
  for (const scenario of ["normal", "slowdown", "recovery"]) {
    const current = createTrafficFixture(scenario, fixture.corridor.anchor_at);
    const context = { status: "ready", run_id: ids.run_id, batch_id: ids.batch_id, source_id: ids.source_id,
      anchor_at: current.corridor.anchor_at, accepted_at: current.corridor.anchor_at,
      segment: { segment_id: segment.id, direction: segment.direction, length_m: segment.length_m, baseline_seconds: segment.baseline_seconds, baseline_label: segment.baseline_label },
      samples: current.observations.filter(row => row.source_id === ids.source_id).map(({ observed_at, speed_kph }) => ({ observed_at, speed_kph })) };
    assert.deepEqual(retainedMotionSchedule(context), authoredMotionSchedule(scenario, segment, current.corridor.anchor_at));
    for (const mutate of [value => value.samples.pop(), value => value.samples.push(value.samples[0]), value => { value.samples[0].speed_kph += 0.01; }, value => { value.samples[0].observed_at = time(-659); }, value => { value.segment.direction = "inbound"; }, value => { value.segment.baseline_seconds = 0; }, value => { value.secret = "must not pass"; }]) {
      const invalid = structuredClone(context); mutate(invalid);
      assert.throws(() => retainedMotionSchedule(invalid));
    }
  }
});
