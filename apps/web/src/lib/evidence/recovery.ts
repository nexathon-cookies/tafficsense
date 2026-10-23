import { trafficTimestampMicros, type TrafficSnapshot } from "../traffic/snapshot.ts";
import { assessSlowdown } from "./slowdown.ts";

export type RecoveryAssessment = {
  segment_id: string;
  direction: "inbound" | "outbound";
  status: "supported" | "insufficient" | "no_prior_slowdown" | "threshold_not_met" | "cohort_mismatch" | "conflicting" | "stale" | "future" | "missing" | "unavailable";
  slowdown_start: string | null;
  slowdown_end: string | null;
  recovery_start: string | null;
  recovery_end: string | null;
  complete_source_count: number;
  prior_slow_source_count: number;
  recovered_source_count: number;
  continuous_source_count: number;
  conflicting_source_count: number;
  valid_until: string | null;
  provenance: "simulated";
};

const MINUTE_MICROS = 60_000_000;
const FRESHNESS_MICROS = 20 * MINUTE_MICROS;

function time(value: string): number | null {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(value)) return null;
  try { return trafficTimestampMicros(value); } catch { return null; }
}

function timestamp(microseconds: number): string {
  const milliseconds = Math.floor(microseconds / 1000);
  const remainder = microseconds - milliseconds * 1000;
  const value = new Date(milliseconds).toISOString();
  return remainder ? value.replace("Z", `${String(remainder).padStart(3, "0")}Z`) : value;
}

function aboveRecoveryThreshold(speed: number, length: number, seconds: number): boolean {
  const [coefficient, exponent = "0"] = String(speed).split("e");
  const [integer, fraction = ""] = coefficient.split(".");
  const scale = fraction.length - Number(exponent);
  const numerator = BigInt(integer + fraction) * BigInt(10) ** BigInt(Math.max(0, -scale));
  const denominator = BigInt(10) ** BigInt(Math.max(0, scale));
  return numerator * BigInt(seconds) * BigInt(25) > BigInt(length) * BigInt(63) * denominator;
}

/** This ordered sampled proof is not persisted clearance or an episode-specific assessment. */
export function assessRecovery(snapshot: TrafficSnapshot): RecoveryAssessment[] {
  const fixture = snapshot.fixture;
  if (!fixture) return [];
  const readTime = time(snapshot.read_at);
  const bindings = new Map<string, string | null>();
  for (const source of fixture.sources) bindings.set(source.id, bindings.has(source.id) ? null : source.segment_id);

  return fixture.segments.map(segment => {
    const result: RecoveryAssessment = {
      segment_id: segment.id, direction: segment.direction, status: "unavailable",
      slowdown_start: null, slowdown_end: null, recovery_start: null, recovery_end: null,
      complete_source_count: 0, prior_slow_source_count: 0, recovered_source_count: 0,
      continuous_source_count: 0, conflicting_source_count: 0, valid_until: null, provenance: "simulated",
    };
    if (readTime === null || !Number.isSafeInteger(segment.length_m) || segment.length_m <= 0
      || !Number.isSafeInteger(segment.baseline_seconds) || segment.baseline_seconds <= 0
      || typeof segment.baseline_label !== "string" || !segment.baseline_label.trim()) return result;

    let end: number | null = null;
    let nextFuture: number | null = null;
    const observations: { source_id: string; observed_at: string; time: number; speed_kph: number; segment_id: string }[] = [];
    for (const observation of fixture.observations) {
      if (observation.segment_id !== segment.id || bindings.get(observation.source_id) !== segment.id) continue;
      const observed = time(observation.observed_at);
      if (observed === null || !Number.isFinite(observation.speed_kph) || observation.speed_kph < 0 || observation.speed_kph > 160) return result;
      if (observed > readTime) nextFuture = Math.min(nextFuture ?? Infinity, observed);
      else {
        end = Math.max(end ?? -Infinity, observed);
        observations.push({ ...observation, time: observed });
      }
    }
    const deadline = (value: number | null) => value === null ? null : timestamp(Math.floor(value / 1000) * 1000);
    result.valid_until = deadline(nextFuture);
    if (end === null) {
      result.status = nextFuture === null ? "missing" : "future";
      return result;
    }
    const recoveryStart = end - 5 * MINUTE_MICROS;
    const slowdownEnd = recoveryStart - MINUTE_MICROS;
    const start = slowdownEnd - 5 * MINUTE_MICROS;
    result.slowdown_start = timestamp(start);
    result.slowdown_end = timestamp(slowdownEnd);
    result.recovery_start = timestamp(recoveryStart);
    result.recovery_end = timestamp(end);
    if (start <= readTime - FRESHNESS_MICROS) {
      result.status = "stale";
      return result;
    }
    result.valid_until = deadline(Math.min(start + FRESHNESS_MICROS, nextFuture ?? Infinity));

    const sources = new Map<string, { ticks: Set<number>; irregular: boolean; recovered: boolean }>();
    for (const observation of observations) {
      if (observation.time < start) continue;
      const source = sources.get(observation.source_id) ?? { ticks: new Set<number>(), irregular: false, recovered: true };
      if ((observation.time - start) % MINUTE_MICROS !== 0 || source.ticks.has(observation.time)) source.irregular = true;
      source.ticks.add(observation.time);
      if (observation.time >= recoveryStart) source.recovered &&= aboveRecoveryThreshold(observation.speed_kph, segment.length_m, segment.baseline_seconds);
      sources.set(observation.source_id, source);
    }
    const complete = new Set([...sources].filter(([, source]) => !source.irregular && source.ticks.size === 12).map(([id]) => id));
    const recovered = new Set([...complete].filter(id => sources.get(id)!.recovered));
    const prerequisite = observations.filter(row => row.time >= start && row.time <= slowdownEnd);
    const priorSlowCount = (ids: Set<string>) => {
      // Restrict the historical evaluation without changing the snapshot's freshness clock.
      const [assessment] = assessSlowdown({ ...snapshot, fixture: { ...fixture, segments: [segment],
        observations: prerequisite.filter(row => ids.has(row.source_id)),
      } });
      return assessment.window_end === result.slowdown_end ? assessment.slow_source_count : 0;
    };
    result.complete_source_count = complete.size;
    result.recovered_source_count = recovered.size;
    result.prior_slow_source_count = priorSlowCount(complete);
    result.continuous_source_count = priorSlowCount(recovered);
    result.conflicting_source_count = assessSlowdown({ ...snapshot, fixture: { ...fixture, segments: [segment] } })[0].slow_source_count;
    result.status = complete.size < 3 ? "insufficient"
      : result.prior_slow_source_count < 3 ? "no_prior_slowdown"
      : result.conflicting_source_count >= 3 ? "conflicting"
      : recovered.size < 3 ? "threshold_not_met"
      : result.continuous_source_count < 3 ? "cohort_mismatch" : "supported";
    return result;
  });
}
