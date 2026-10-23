import { parsePhase4Snapshot, type Phase4Snapshot } from "../traffic/phase4.ts";
import { trafficTimestampMicros } from "../traffic/snapshot.ts";
import { reportTimestamp, reportUuid } from "../reports/rules.ts";

export type RouteComparison = {
  status: "available" | "no_routes" | "missing" | "stale" | "future" | "invalid" | "incompatible" | "mixed_runs";
  primary_route_id: "primary"; alternative_route_id: "alternative"; direction: "outbound";
  primary_segment_ids: string[]; alternative_segment_ids: string[];
  primary_duration_us: number | null; alternative_duration_us: number | null; savings_us: number | null;
  valid_until: string | null; supported_incident_ids: string[]; provenance: "simulated";
};
export type Phase5Snapshot = {
  phase4: Phase4Snapshot; route_comparison: RouteComparison;
  report_times: { id: string; observed_at: string; received_at: string }[];
};
function invalid(): never { throw new Error("Invalid phase five traffic snapshot."); }
function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))) return invalid();
  return row;
}
function identifiers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10000 || value.some(id => typeof id !== "string")
    || new Set(value).size !== value.length) return invalid();
  return [...value];
}
function time(value: unknown): string {
  reportTimestamp(value);
  const micros = trafficTimestampMicros(value);
  const base = new Date(Math.floor(micros / 1000)).toISOString();
  const remainder = micros % 1000;
  return remainder ? base.replace("Z", `${String(remainder).padStart(3, "0")}Z`) : base;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return invalid();
  return value;
}
function membership(phase4: Phase4Snapshot, id: "primary" | "alternative"): string[] {
  const fixture = phase4.traffic.fixture;
  if (!fixture?.routes.some(route => route.id === id)) return [];
  return fixture.route_segments.filter(row => row.route_id === id).sort((a, b) => a.position - b.position).map(row => row.segment_id);
}
function ordered(actual: string[], expected: string[]): void {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) return invalid();
}
function comparison(input: unknown, phase4: Phase4Snapshot): RouteComparison {
  const row = record(input, ["status", "primary_route_id", "alternative_route_id", "direction", "primary_segment_ids", "alternative_segment_ids",
    "primary_duration_us", "alternative_duration_us", "savings_us", "valid_until", "supported_incident_ids", "provenance"]);
  if (!["available", "no_routes", "missing", "stale", "future", "invalid", "incompatible", "mixed_runs"].includes(row.status as string)
    || row.primary_route_id !== "primary" || row.alternative_route_id !== "alternative" || row.direction !== "outbound"
    || row.provenance !== "simulated") return invalid();
  const primary_segment_ids = identifiers(row.primary_segment_ids), alternative_segment_ids = identifiers(row.alternative_segment_ids);
  ordered(primary_segment_ids, membership(phase4, "primary"));
  ordered(alternative_segment_ids, membership(phase4, "alternative"));
  const supported_incident_ids = identifiers(row.supported_incident_ids).map(reportUuid);
  const result: RouteComparison = { status: row.status as RouteComparison["status"], primary_route_id: "primary", alternative_route_id: "alternative",
    direction: "outbound", primary_segment_ids, alternative_segment_ids, primary_duration_us: null, alternative_duration_us: null,
    savings_us: null, valid_until: null, supported_incident_ids, provenance: "simulated" };
  const missingRoute = !primary_segment_ids.length || !alternative_segment_ids.length;
  if ((result.status === "no_routes") !== missingRoute) return invalid();
  if (result.status !== "available") {
    if ([row.primary_duration_us, row.alternative_duration_us, row.savings_us, row.valid_until].some(value => value !== null)
      || supported_incident_ids.length) return invalid();
    return result;
  }
  ordered(primary_segment_ids, ["primary-west", "primary-east"]);
  ordered(alternative_segment_ids, ["alternative-west", "alternative-east"]);
  const fixture = phase4.traffic.fixture!;
  if (["primary", "alternative"].some(id => !fixture.routes.some(route => route.id === id && route.kind === id && route.direction === "outbound"))) return invalid();
  const covered = [...primary_segment_ids, ...alternative_segment_ids];
  if (new Set(covered).size !== covered.length) return invalid();
  const read = trafficTimestampMicros(phase4.traffic.read_at);
  let deadline = Infinity;
  const sum = (ids: string[]): number => ids.reduce((total, id) => {
    const traversal = phase4.traversals.find(item => item.segment_id === id && item.direction === "outbound");
    if (!traversal || traversal.status !== "available" || !traversal.entered_at || !traversal.exited_at || !traversal.valid_until) return invalid();
    const entry = trafficTimestampMicros(traversal.entered_at), exit = trafficTimestampMicros(traversal.exited_at);
    const expires = trafficTimestampMicros(traversal.valid_until);
    if (entry >= exit || exit > read || expires <= read) return invalid();
    deadline = Math.min(deadline, expires);
    return integer(total + exit - entry);
  }, 0);
  const primary = sum(primary_segment_ids), alternative = sum(alternative_segment_ids);
  const primary_duration_us = integer(row.primary_duration_us), alternative_duration_us = integer(row.alternative_duration_us), savings_us = integer(row.savings_us);
  const valid_until = time(row.valid_until);
  if (primary_duration_us !== primary || alternative_duration_us !== alternative || savings_us !== integer(primary - alternative)
    || trafficTimestampMicros(valid_until) !== deadline) return invalid();
  // Only SQL can bind public incidents to the comparison's private evidence run.
  for (const id of supported_incident_ids) {
    const incident = phase4.incidents.find(item => item.id === id);
    if (!incident || !primary_segment_ids.includes(incident.segment_id) || incident.direction !== "outbound"
      || !incident.is_current || incident.state !== "supported" || !incident.valid_until
      || trafficTimestampMicros(incident.valid_until) <= read) return invalid();
  }
  return { ...result, primary_duration_us, alternative_duration_us, savings_us, valid_until };
}
export function parsePhase5Snapshot(input: unknown): Phase5Snapshot {
  const envelope = record(input, ["phase4", "route_comparison"]);
  const phase4 = parsePhase4Snapshot(envelope.phase4);
  const route_comparison = comparison(envelope.route_comparison, phase4);
  // Phase 4 keeps its existing millisecond display contract; hazard boundaries need public microseconds.
  const raw = envelope.phase4 as { traffic: { reports: { id: string; observed_at: string; received_at: string }[] } };
  const report_times = raw.traffic.reports.map(row => ({ id: row.id, observed_at: time(row.observed_at), received_at: time(row.received_at) }));
  return { phase4, route_comparison, report_times };
}
