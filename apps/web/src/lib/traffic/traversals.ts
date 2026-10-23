import { reportDirections, reportUuid } from "../reports/rules.ts";
import { authoredMotionSchedule, authoredSpeedKph, traversalTimestamp, traversalTimestampMicros } from "./motion-schedule.ts";
import type { MotionLeg } from "./motion-schedule.ts";
import type { DemoSegment, TrafficScenario } from "./simulator.ts";

export { traversalTimestamp, traversalTimestampMicros } from "./motion-schedule.ts";
export type TraversalMotion = {
  state: "complete" | "partial";
  entered_at: string;
  exited_at: string | null;
  elapsed_seconds: number | null;
  distance_m: number;
  steps: { started_at: string; ended_at: string; from_m: number; to_m: number; speed_kph: number }[];
};
export type TraversalContext = {
  status: "ready"; run_id: string; batch_id: string; source_id: string; anchor_at: string; accepted_at: string;
  segment: { segment_id: string; direction: "outbound" | "inbound"; length_m: number; baseline_seconds: number; baseline_label: string };
  samples: { observed_at: string; speed_kph: number }[];
};

function invalid(): never { throw new Error("Invalid retained traversal data."); }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return invalid();
  return value as Record<string, unknown>;
}
function speedHundredths(speed: number): number {
  const result = Math.round(speed * 100);
  if (!Number.isFinite(speed) || speed < 0 || speed > 160 || result / 100 !== speed) return invalid();
  return result;
}

export function simulateTraversal(lengthM: number, schedule: MotionLeg[], enteredAt: string, observedUntil: string): TraversalMotion {
  if (!Number.isInteger(lengthM) || lengthM < 1 || lengthM > 100000 || !Array.isArray(schedule) || schedule.length > 100) return invalid();
  const entered = traversalTimestampMicros(enteredAt), until = traversalTimestampMicros(observedUntil);
  if (until <= entered || until - entered >= 1200000000) throw new Error("Movement must be positive and shorter than twenty minutes.");
  const legs = schedule.map(leg => ({ start: traversalTimestampMicros(leg.started_at), end: traversalTimestampMicros(leg.ended_at), rate: speedHundredths(leg.speed_kph) }));
  for (const [index, leg] of legs.entries()) {
    if (leg.start >= leg.end || (index > 0 && legs[index - 1].end !== leg.start)) return invalid();
  }
  const result: TraversalMotion = { state: "partial", entered_at: traversalTimestamp(entered), exited_at: null,
    elapsed_seconds: null, distance_m: 0, steps: [] };
  // Integer distance units are 1/360,000,000 metre: hundredths km/h multiplied by microseconds.
  const units = BigInt(360000000), target = BigInt(lengthM) * units;
  let position = BigInt(0), cursor = entered;
  for (const leg of legs) {
    if (leg.end <= cursor) continue;
    if (leg.start > cursor || cursor >= until) break;
    const start = cursor, end = Math.min(leg.end, until), rate = BigInt(leg.rate);
    const possible = rate * BigInt(end - cursor), remaining = target - position;
    const from_m = Number(position) / Number(units);
    if (rate > BigInt(0) && possible >= remaining) {
      // Sub-microsecond boundary crossings use the first representable instant at the exact exit.
      cursor += Number((remaining + rate - BigInt(1)) / rate);
      position = target;
      result.state = "complete";
      result.exited_at = traversalTimestamp(cursor);
      result.elapsed_seconds = (cursor - entered) / 1000000;
    } else {
      position += possible;
      cursor = end;
    }
    result.distance_m = Number(position) / Number(units);
    result.steps.push({ started_at: traversalTimestamp(start), ended_at: traversalTimestamp(cursor), from_m,
      to_m: result.distance_m, speed_kph: leg.rate / 100 });
    if (result.state === "complete") break;
  }
  return result;
}

export function retainedMotionSchedule(input: unknown): MotionLeg[] {
  const value = exact(input, ["status", "run_id", "batch_id", "source_id", "anchor_at", "accepted_at", "segment", "samples"]);
  if (value.status !== "ready" || typeof value.source_id !== "string" || !/^[a-z0-9-]{1,100}$/.test(value.source_id)) return invalid();
  reportUuid(value.run_id); reportUuid(value.batch_id);
  const anchor = traversalTimestampMicros(value.anchor_at), accepted = traversalTimestampMicros(value.accepted_at);
  if (anchor > accepted) return invalid();
  const selected = exact(value.segment, ["segment_id", "direction", "length_m", "baseline_seconds", "baseline_label"]);
  if (typeof selected.segment_id !== "string" || !Object.hasOwn(reportDirections, selected.segment_id)
    || reportDirections[selected.segment_id as keyof typeof reportDirections] !== selected.direction
    || typeof selected.length_m !== "number" || typeof selected.baseline_seconds !== "number"
    || typeof selected.baseline_label !== "string" || !selected.baseline_label.trim() || selected.baseline_label.length > 200
    || !Array.isArray(value.samples) || value.samples.length !== 12) return invalid();
  const segment = { id: selected.segment_id, length_m: selected.length_m, baseline_seconds: selected.baseline_seconds };
  const samples = value.samples.map((sample, minute) => {
    const row = exact(sample, ["observed_at", "speed_kph"]);
    if (traversalTimestampMicros(row.observed_at) !== anchor - (11 - minute) * 60000000 || typeof row.speed_kph !== "number") return invalid();
    speedHundredths(row.speed_kph);
    return row.speed_kph;
  });
  const scenario = (["normal", "slowdown", "recovery"] as TrafficScenario[])
    .find(scenario => samples.every((speed, minute) => speed === authoredSpeedKph(scenario, segment, minute)));
  if (!scenario) return invalid();
  return authoredMotionSchedule(scenario, segment, value.anchor_at as string);
}

export function completedTraversalInput(ids: { traversal_id: string; run_id: string; batch_id: string; source_id: string },
  segment: Pick<DemoSegment, "id" | "direction" | "length_m" | "baseline_seconds" | "baseline_label">, movement: TraversalMotion) {
  if (movement.state !== "complete" || movement.exited_at === null || movement.distance_m !== segment.length_m
    || movement.steps[0]?.from_m !== 0 || movement.steps.at(-1)?.to_m !== segment.length_m) throw new Error("Incomplete or partial movement cannot be ingested.");
  const entered = traversalTimestampMicros(movement.entered_at), exited = traversalTimestampMicros(movement.exited_at);
  if (entered >= exited || movement.elapsed_seconds !== (exited - entered) / 1000000) return invalid();
  reportUuid(ids.traversal_id); reportUuid(ids.run_id); reportUuid(ids.batch_id);
  return { ...ids, segment_id: segment.id, direction: segment.direction, entered_at: movement.entered_at,
    exited_at: movement.exited_at, distance_m: movement.distance_m, baseline_seconds: segment.baseline_seconds, baseline_label: segment.baseline_label };
}
