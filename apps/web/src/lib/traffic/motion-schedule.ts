import { reportTimestamp } from "../reports/rules.ts";
import type { DemoSegment, TrafficScenario } from "./simulator.ts";

export type MotionLeg = { started_at: string; ended_at: string; speed_kph: number };
type MotionSegment = Pick<DemoSegment, "id" | "length_m" | "baseline_seconds">;

export function traversalTimestampMicros(value: unknown): number {
  const milliseconds = Date.parse(reportTimestamp(value));
  const fraction = (value as string).match(/\.(\d{1,6})/)?.[1] ?? "";
  const micros = milliseconds * 1000 + Number(fraction.padEnd(6, "0").slice(3));
  if (!Number.isSafeInteger(micros)) throw new Error("Invalid traversal timestamp.");
  return micros;
}

export function traversalTimestamp(micros: number): string {
  if (!Number.isSafeInteger(micros)) throw new Error("Invalid traversal timestamp.");
  const time = new Date(Math.floor(micros / 1000)).toISOString();
  reportTimestamp(time);
  return `${time.slice(0, 19)}.${String(micros % 1000000).padStart(6, "0")}Z`;
}

export function authoredSpeedKph(scenario: TrafficScenario, segment: MotionSegment, minute: number): number {
  if (segment.id === "primary-west") {
    if (scenario === "slowdown" && minute >= 5) return 8;
    if (scenario === "recovery") return minute < 6 ? 8 : 28;
  }
  return Math.round(segment.length_m / segment.baseline_seconds * 360) / 100;
}

// The final authored speed continues for at most twenty minutes after the sample anchor.
export function authoredMotionSchedule(scenario: TrafficScenario, segment: MotionSegment, anchor: string): MotionLeg[] {
  if (!["normal", "slowdown", "recovery"].includes(scenario)
    || !Number.isInteger(segment.length_m) || segment.length_m < 1 || segment.length_m > 100000
    || !Number.isInteger(segment.baseline_seconds) || segment.baseline_seconds < 1 || segment.baseline_seconds > 86400) {
    throw new Error("Invalid authored motion inputs.");
  }
  const start = traversalTimestampMicros(anchor) - 660000000;
  const legs: MotionLeg[] = [];
  for (let minute = 0; minute < 12; minute++) {
    const started_at = traversalTimestamp(start + minute * 60000000);
    const ended_at = traversalTimestamp(minute === 11 ? start + 1860000000 : start + (minute + 1) * 60000000);
    const speed_kph = authoredSpeedKph(scenario, segment, minute);
    const previous = legs.at(-1);
    if (previous?.speed_kph === speed_kph) previous.ended_at = ended_at;
    else legs.push({ started_at, ended_at, speed_kph });
  }
  return legs;
}
