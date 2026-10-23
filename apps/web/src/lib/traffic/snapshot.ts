import type { DemoLine, TrafficFixture } from "./simulator";
import { parsePublicReport, reportDirections, reportTimestamp, reportUuid, type PublicReport, type ReportSegment } from "../reports/rules.ts";

import { parseReportAssessment, type ReportAssessment } from "../evidence/assessment.ts";

export type IncidentEpisode = {
  id: string; segment_id: ReportSegment; direction: "inbound" | "outbound"; created_at: string;
  first_observed_at: string; last_observed_at: string; report_count: number; provenance: "simulated";
};
export type TrafficSnapshot = { read_at: string; fixture: TrafficFixture | null; reports: PublicReport[];
  incident_episodes: IncidentEpisode[]; reporting_enabled: boolean; report_assessments: ReportAssessment[] };

function invalid(): never {
  throw new Error("Invalid traffic snapshot.");
}

function record(input: unknown, fields: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) return invalid();
  return value;
}

function text(input: unknown, maximum: number): string {
  if (typeof input !== "string" || !input.trim() || input.length > maximum) return invalid();
  return input;
}

function identifier(input: unknown, maximum = 80): string {
  const value = text(input, maximum);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) return invalid();
  return value;
}

function number(input: unknown, minimum: number, maximum: number, integer = false): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < minimum || input > maximum
    || (integer && !Number.isInteger(input))) return invalid();
  return input;
}

function choice<T extends string>(input: unknown, values: readonly T[]): T {
  if (typeof input !== "string" || !values.includes(input as T)) return invalid();
  return input as T;
}

function collection(input: unknown, minimum = 1, maximum = 5000): unknown[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum) return invalid();
  return input;
}

function timestamp(input: unknown): string {
  if (typeof input !== "string") return invalid();
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(input);
  if (!match) return invalid();
  const local = `${match[1]}T${match[2]}`;
  const milliseconds = Date.parse(`${local}.${(match[3] ?? "").padEnd(3, "0").slice(0, 3)}Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 19) !== local) return invalid();
  const hours = Number(match[6] ?? 0);
  const minutes = Number(match[7] ?? 0);
  if (hours > 15 || minutes > 59) return invalid();
  const offset = (hours * 60 + minutes) * 60_000 * (match[5] === "-" ? -1 : 1);
  return new Date(milliseconds - offset).toISOString();
}

export function trafficTimestampMicros(input: unknown): number {
  const canonical = timestamp(input);
  const fraction = /\.(\d{1,6})/.exec(input as string)?.[1] ?? "";
  // Accepted 20xx timestamps fit safely in integer microseconds.
  const microseconds = Date.parse(canonical) * 1000 + Number(fraction.padEnd(6, "0").slice(3));
  if (!Number.isSafeInteger(microseconds)) return invalid();
  return microseconds;
}

function preciseTimestamp(input: unknown): string {
  const canonical = timestamp(input);
  const remainder = trafficTimestampMicros(input) - Date.parse(canonical) * 1000;
  return remainder === 0 ? canonical : canonical.replace("Z", `${String(remainder).padStart(3, "0")}Z`);
}

function episodeTimestamp(input: unknown): string {
  reportTimestamp(input);
  return preciseTimestamp(input);
}

function parseIncidentEpisode(input: unknown): IncidentEpisode {
  const row = record(input, ["id", "segment_id", "direction", "created_at", "first_observed_at", "last_observed_at", "report_count", "provenance"]);
  const segment_id = choice(row.segment_id, Object.keys(reportDirections) as ReportSegment[]);
  const direction = reportDirections[segment_id];
  if (row.direction !== direction || row.provenance !== "simulated") return invalid();
  const first_observed_at = episodeTimestamp(row.first_observed_at);
  const last_observed_at = episodeTimestamp(row.last_observed_at);
  if (trafficTimestampMicros(first_observed_at) > trafficTimestampMicros(last_observed_at)) return invalid();
  return { id: reportUuid(row.id), segment_id, direction, created_at: episodeTimestamp(row.created_at),
    first_observed_at, last_observed_at, report_count: number(row.report_count, 1, 2000, true), provenance: "simulated" };
}

function geometry(input: unknown): DemoLine {
  const value = record(input, ["type", "coordinates"]);
  if (value.type !== "LineString") return invalid();
  const coordinates = collection(value.coordinates, 2, 100).map(point => {
    const pair = collection(point, 2, 2);
    return [number(pair[0], 74.79, 74.92), number(pair[1], 12.82, 12.94)] as [number, number];
  });
  return { type: "LineString", coordinates };
}

function unique<T>(values: T[], key: (value: T) => string): void {
  if (new Set(values.map(key)).size !== values.length) invalid();
}

export function parseTrafficSnapshot(input: unknown): TrafficSnapshot {
  const envelope = record(input, ["read_at", "fixture", "reports", "incident_episodes", "reporting_enabled", "report_assessments"]);
  const read_at = preciseTimestamp(envelope.read_at);
  if (typeof envelope.reporting_enabled !== "boolean") return invalid();
  const reporting_enabled = envelope.reporting_enabled;
  const reports = collection(envelope.reports, 0, 2000).map(parsePublicReport);
  unique(reports, row => row.id);
  const incident_episodes = collection(envelope.incident_episodes, 0, 2000).map(parseIncidentEpisode);
  unique(incident_episodes, row => row.id);
  const episodeById = new Map(incident_episodes.map(row => [row.id, row]));
  // Public report display times are millisecond-normalized; relations use the raw database precision.
  const reportTimes = new Map((envelope.reports as Record<string, unknown>[]).map(report =>
    [report.id, { observed: trafficTimestampMicros(report.observed_at), received: trafficTimestampMicros(report.received_at) }]));
  const episodeMembers = new Map<string, { count: number; first: number; last: number }>();
  for (const report of reports) {
    const episode = episodeById.get(report.episode_id);
    const time = reportTimes.get(report.id)!;
    if (!episode || episode.segment_id !== report.segment_id || episode.direction !== report.direction
      || time.observed > time.received) return invalid();
    const members = episodeMembers.get(episode.id) ?? { count: 0, first: time.observed, last: time.observed };
    members.count++;
    members.first = Math.min(members.first, time.observed);
    members.last = Math.max(members.last, time.observed);
    episodeMembers.set(episode.id, members);
  }
  for (const episode of incident_episodes) {
    const members = episodeMembers.get(episode.id);
    if (!members || members.count !== episode.report_count || members.first !== trafficTimestampMicros(episode.first_observed_at)
      || members.last !== trafficTimestampMicros(episode.last_observed_at)) return invalid();
  }
  const report_assessments = collection(envelope.report_assessments, 0, 5).map(row => parseReportAssessment(row, read_at));
  unique(report_assessments, row => row.segment_id);
  if (envelope.fixture === null) {
    if (reports.length || incident_episodes.length || report_assessments.length) return invalid();
    return { read_at, fixture: null, reports, incident_episodes, reporting_enabled, report_assessments };
  }
  const fixture = record(envelope.fixture, ["corridor", "segments", "routes", "route_segments", "sources", "observations"]);
  const corridor = record(fixture.corridor, ["id", "name", "provenance", "geometry_note", "scenario", "anchor_at"]);
  if (corridor.id !== "mangaluru-central-v1" || corridor.provenance !== "simulated") return invalid();
  const anchor_at = preciseTimestamp(corridor.anchor_at);
  const anchorTime = trafficTimestampMicros(anchor_at);
  if (anchorTime < Date.parse("2000-01-01T00:00:00.000Z") * 1000 || anchorTime >= Date.parse("2100-01-01T00:00:00.000Z") * 1000) return invalid();
  const segments = collection(fixture.segments).map(input => {
    const row = record(input, ["id", "name", "direction", "geometry", "length_m", "baseline_seconds", "baseline_label"]);
    return {
      id: identifier(row.id), name: text(row.name, 160), direction: choice(row.direction, ["outbound", "inbound"] as const),
      geometry: geometry(row.geometry), length_m: number(row.length_m, 1, 100000, true),
      baseline_seconds: number(row.baseline_seconds, 1, 86400, true), baseline_label: text(row.baseline_label, 200),
    };
  });
  unique(segments, row => row.id);
  const segmentById = new Map(segments.map(row => [row.id, row]));
  if (reports.some(report => segmentById.get(report.segment_id)?.direction !== report.direction)) return invalid();
  if (report_assessments.length !== segments.length) return invalid();
  const readTime = trafficTimestampMicros(envelope.read_at);
  for (const assessment of report_assessments) {
    if (segmentById.get(assessment.segment_id)?.direction !== assessment.direction) return invalid();
    const matching = reports.filter(report => report.segment_id === assessment.segment_id).map(report => reportTimes.get(report.id)!);
    const recent = matching.filter(report => report.observed > readTime - 1200000000
      && report.observed <= readTime && report.received <= readTime);
    const eligibleCandidates = recent.filter(report => report.observed > readTime - 900000000);
    if (assessment.report_count !== matching.length || assessment.recent_report_count !== recent.length
      || assessment.eligible_report_count > eligibleCandidates.length) return invalid();
    const transitions = [
      ...recent.map(report => Math.floor(report.observed / 1000) + 20 * 60000),
      ...matching.filter(report => report.received > readTime && report.observed > report.received - 1200000000)
        .map(report => Math.floor(report.received / 1000)),
    ];
    if ((transitions.length === 0) !== (assessment.valid_until === null)) return invalid();
    if (assessment.valid_until !== null && Date.parse(assessment.valid_until) > Math.min(...transitions)) return invalid();
  }
  const routes = collection(fixture.routes, 2, 2).map(input => {
    const row = record(input, ["id", "name", "kind", "direction"]);
    return {
      id: identifier(row.id), name: text(row.name, 160), kind: choice(row.kind, ["primary", "alternative"] as const),
      direction: choice(row.direction, ["outbound", "inbound"] as const),
    };
  });
  unique(routes, row => row.id);
  unique(routes, row => row.kind);
  const routeById = new Map(routes.map(row => [row.id, row]));
  const route_segments = collection(fixture.route_segments).map(input => {
    const row = record(input, ["route_id", "segment_id", "position", "direction"]);
    const route_id = identifier(row.route_id);
    const segment_id = identifier(row.segment_id);
    const direction = choice(row.direction, ["outbound", "inbound"] as const);
    if (routeById.get(route_id)?.direction !== direction || segmentById.get(segment_id)?.direction !== direction) return invalid();
    return { route_id, segment_id, position: number(row.position, 1, 50, true), direction };
  });
  unique(route_segments, row => `${row.route_id}:${row.segment_id}`);
  for (const route of routes) {
    const positions = route_segments.filter(row => row.route_id === route.id).map(row => row.position).sort((a, b) => a - b);
    if (!positions.length || positions.some((position, index) => position !== index + 1)) return invalid();
  }
  const sources = collection(fixture.sources).map(input => {
    const row = record(input, ["id", "segment_id", "label"]);
    const segment_id = identifier(row.segment_id);
    if (!segmentById.has(segment_id)) return invalid();
    return { id: identifier(row.id, 100), segment_id, label: text(row.label, 200) };
  });
  unique(sources, row => row.id);
  const sourceById = new Map(sources.map(row => [row.id, row]));
  const observations = collection(fixture.observations, 0).map(input => {
    const row = record(input, ["segment_id", "source_id", "observed_at", "speed_kph"]);
    const segment_id = identifier(row.segment_id);
    const source_id = identifier(row.source_id, 100);
    if (sourceById.get(source_id)?.segment_id !== segment_id) return invalid();
    const observed_at = preciseTimestamp(row.observed_at);
    const observedTime = trafficTimestampMicros(observed_at);
    if (observedTime > anchorTime || observedTime < anchorTime - 11 * 60_000_000) return invalid();
    return { segment_id, source_id, observed_at, speed_kph: number(row.speed_kph, 0, 160) };
  });
  unique(observations, row => `${row.segment_id}:${row.source_id}:${row.observed_at}`);
  return {
    read_at, reports, incident_episodes, reporting_enabled, report_assessments,
    fixture: {
      corridor: {
        id: corridor.id, name: text(corridor.name, 160), provenance: corridor.provenance,
        geometry_note: text(corridor.geometry_note, 400), scenario: choice(corridor.scenario, ["normal", "slowdown", "recovery"] as const), anchor_at,
      },
      segments, routes, route_segments, sources, observations,
    },
  };
}

export function sampleFreshness(observedAt: string | null, readAt: string): "recent" | "stale" | "future" | "missing" {
  const readTime = trafficTimestampMicros(readAt);
  if (observedAt === null) return "missing";
  const age = readTime - trafficTimestampMicros(observedAt);
  if (age < 0) return "future";
  return age >= 20 * 60_000_000 ? "stale" : "recent";
}
