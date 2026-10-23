import type { TrafficSnapshot } from "../traffic/snapshot.ts";

export type SlowdownAssessment = {
  segment_id: string;
  direction: "inbound" | "outbound";
  status: "supported" | "not_supported" | "insufficient" | "stale" | "future" | "missing" | "unavailable";
  window_start: string | null;
  window_end: string | null;
  complete_source_count: number;
  slow_source_count: number;
  valid_until: string | null;
  provenance: "simulated";
};

const MINUTE_MICROS = 60_000_000;
const WINDOW_MICROS = 5 * MINUTE_MICROS;
const FRESHNESS_MICROS = 20 * MINUTE_MICROS;

function timestampMicros(value: string): number | null {
  const match = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(\d{3})(\d{3})?Z$/.exec(value);
  if (!match) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== `${value.slice(0, 23)}Z`) return null;
  const microseconds = milliseconds * 1000 + Number(match[2] ?? 0);
  return Number.isSafeInteger(microseconds) ? microseconds : null;
}

function timestamp(microseconds: number): string {
  const milliseconds = Math.floor(microseconds / 1000);
  const remainder = microseconds - milliseconds * 1000;
  const value = new Date(milliseconds).toISOString();
  return remainder ? `${value.slice(0, -1)}${String(remainder).padStart(3, "0")}Z` : value;
}

function belowThreshold(speed: number, length: number, seconds: number): boolean {
  // Decimal cross-products preserve stored speeds and the unrounded baseline relation.
  const [coefficient, exponent = "0"] = String(speed).split("e");
  const [integer, fraction = ""] = coefficient.split(".");
  const scale = fraction.length - Number(exponent);
  const numerator = BigInt(integer + fraction) * BigInt(10) ** BigInt(Math.max(0, -scale));
  const denominator = BigInt(10) ** BigInt(Math.max(0, scale));
  return numerator * BigInt(seconds) * BigInt(25) < BigInt(length) * BigInt(36) * denominator;
}

/** Counts describe only a fresh terminal window; stale windows retain times but have zero counts. */
export function assessSlowdown(snapshot: TrafficSnapshot): SlowdownAssessment[] {
  const fixture = snapshot.fixture;
  if (!fixture) return [];
  const readTime = timestampMicros(snapshot.read_at);
  const bindings = new Map<string, string | null>();
  for (const source of fixture.sources) {
    bindings.set(source.id, bindings.has(source.id) ? null : source.segment_id);
  }

  return fixture.segments.map(segment => {
    const assessment: SlowdownAssessment = {
      segment_id: segment.id, direction: segment.direction, status: "unavailable",
      window_start: null, window_end: null, complete_source_count: 0, slow_source_count: 0,
      valid_until: null, provenance: "simulated",
    };
    if (readTime === null || !Number.isSafeInteger(segment.length_m) || segment.length_m <= 0
      || !Number.isSafeInteger(segment.baseline_seconds) || segment.baseline_seconds <= 0
      || typeof segment.baseline_label !== "string" || !segment.baseline_label.trim()) return assessment;

    let end: number | null = null;
    let nextFuture: number | null = null;
    const observations: { source_id: string; time: number; speed: number }[] = [];
    for (const observation of fixture.observations) {
      if (observation.segment_id !== segment.id || bindings.get(observation.source_id) !== segment.id) continue;
      const time = timestampMicros(observation.observed_at);
      if (time === null || !Number.isFinite(observation.speed_kph) || observation.speed_kph < 0 || observation.speed_kph > 160) return assessment;
      if (time > readTime) {
        nextFuture = nextFuture === null ? time : Math.min(nextFuture, time);
      } else {
        end = end === null ? time : Math.max(end, time);
        observations.push({ source_id: observation.source_id, time, speed: observation.speed_kph });
      }
    }

    // Flooring may expire within the read's millisecond; rounding up would overstate validity.
    const deadline = (time: number | null) => time === null ? null : timestamp(Math.floor(time / 1000) * 1000);
    assessment.valid_until = deadline(nextFuture);
    if (end === null) {
      assessment.status = nextFuture === null ? "missing" : "future";
      return assessment;
    }
    const start = end - WINDOW_MICROS;
    assessment.window_start = timestamp(start);
    assessment.window_end = timestamp(end);
    if (start <= readTime - FRESHNESS_MICROS) {
      assessment.status = "stale";
      return assessment;
    }
    assessment.valid_until = deadline(Math.min(start + FRESHNESS_MICROS, nextFuture ?? Infinity));

    const sources = new Map<string, { ticks: Set<number>; slow: boolean; irregular: boolean }>();
    for (const observation of observations) {
      if (observation.time < start) continue;
      const source = sources.get(observation.source_id) ?? { ticks: new Set<number>(), slow: true, irregular: false };
      if ((observation.time - start) % MINUTE_MICROS !== 0 || source.ticks.has(observation.time)) source.irregular = true;
      source.ticks.add(observation.time);
      source.slow &&= belowThreshold(observation.speed, segment.length_m, segment.baseline_seconds);
      sources.set(observation.source_id, source);
    }
    for (const source of sources.values()) {
      if (source.irregular || source.ticks.size !== 6) continue;
      assessment.complete_source_count++;
      if (source.slow) assessment.slow_source_count++;
    }
    assessment.status = assessment.complete_source_count < 3 ? "insufficient"
      : assessment.slow_source_count >= 3 ? "supported" : "not_supported";
    return assessment;
  });
}
