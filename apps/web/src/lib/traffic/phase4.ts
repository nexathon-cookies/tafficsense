import { parseTrafficSnapshot, trafficTimestampMicros, type TrafficSnapshot } from "./snapshot.ts";
import { reportTimestamp, reportUuid } from "../reports/rules.ts";

export type PublicIncident = {
  id: string; segment_id: string; direction: "inbound" | "outbound";
  state: "supported" | "unconfirmed" | "stale" | "cleared"; is_current: boolean;
  started_at: string; last_supported_at: string; cleared_at: string | null; recovery_end: string | null; valid_until: string | null;
  supporting_source_count: number; recovered_source_count: number; prior_incident_id: string | null;
  report_episode_ids: string[]; provenance: "simulated"; cause: "unknown";
};
export type PublicTraversal = {
  segment_id: string; direction: "inbound" | "outbound";
  status: "available" | "missing" | "stale" | "future" | "invalid" | "incompatible";
  id: string | null; entered_at: string | null; exited_at: string | null;
  baseline_seconds: number | null; baseline_label: string | null; delay_seconds: number | null;
  valid_until: string | null; provenance: "simulated";
};
export type Phase4Snapshot = { traffic: TrafficSnapshot; incidents: PublicIncident[]; traversals: PublicTraversal[] };
function invalid(): never { throw new Error("Invalid phase four traffic snapshot."); }
function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))) return invalid();
  return row;
}
function collection(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return invalid();
  return value;
}
function time(value: unknown): string {
  reportTimestamp(value);
  const micros = trafficTimestampMicros(value);
  const base = new Date(Math.floor(micros / 1000)).toISOString();
  const remainder = micros % 1000;
  return remainder ? base.replace("Z", `${String(remainder).padStart(3, "0")}Z`) : base;
}
function nullableTime(value: unknown): string | null { return value === null ? null : time(value); }
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 500) return invalid();
  return value;
}
function directed(row: Record<string, unknown>, snapshot: TrafficSnapshot) {
  const segment = snapshot.fixture?.segments.find(s => s.id === row.segment_id && s.direction === row.direction);
  if (!segment || row.provenance !== "simulated") return invalid();
  return segment;
}
function parseIncident(value: unknown, snapshot: TrafficSnapshot): PublicIncident {
  const row = record(value, ["id", "segment_id", "direction", "state", "is_current", "started_at", "last_supported_at", "cleared_at", "recovery_end", "valid_until",
    "supporting_source_count", "recovered_source_count", "prior_incident_id", "report_episode_ids", "provenance", "cause"]);
  const segment = directed(row, snapshot);
  if (!["supported", "unconfirmed", "stale", "cleared"].includes(row.state as string) || typeof row.is_current !== "boolean" || row.cause !== "unknown") return invalid();
  const id = reportUuid(row.id);
  const started_at = time(row.started_at), last_supported_at = time(row.last_supported_at);
  const cleared_at = nullableTime(row.cleared_at), recovery_end = nullableTime(row.recovery_end), valid_until = nullableTime(row.valid_until);
  const read = trafficTimestampMicros(snapshot.read_at), start = trafficTimestampMicros(started_at), end = trafficTimestampMicros(last_supported_at);
  const supporting_source_count = count(row.supporting_source_count), recovered_source_count = count(row.recovered_source_count);
  if (start > end || end > read || supporting_source_count < 3) return invalid();
  if (row.state === "cleared") {
    if (!cleared_at || !recovery_end || trafficTimestampMicros(recovery_end) <= end
      || trafficTimestampMicros(cleared_at) < trafficTimestampMicros(recovery_end) || trafficTimestampMicros(cleared_at) > read
      || recovered_source_count < 3 || valid_until !== null) return invalid();
  } else if (cleared_at !== null || recovery_end !== null || recovered_source_count !== 0 || valid_until === null) return invalid();
  if (row.state === "supported" && valid_until && trafficTimestampMicros(valid_until) <= read) return invalid();
  if (row.state === "stale" && valid_until && trafficTimestampMicros(valid_until) > read) return invalid();
  const prior_incident_id = row.prior_incident_id === null ? null : reportUuid(row.prior_incident_id);
  if (prior_incident_id === id) return invalid();
  const report_episode_ids = collection(row.report_episode_ids, 2000).map(reportUuid);
  if (new Set(report_episode_ids).size !== report_episode_ids.length || report_episode_ids.some(episodeId =>
    !snapshot.incident_episodes.some(episode => episode.id === episodeId && episode.segment_id === segment.id && episode.direction === segment.direction))) return invalid();
  return { id, segment_id: segment.id, direction: segment.direction, state: row.state as PublicIncident["state"], is_current: row.is_current,
    started_at, last_supported_at, cleared_at, recovery_end, valid_until, supporting_source_count, recovered_source_count, prior_incident_id,
    report_episode_ids, provenance: "simulated", cause: "unknown" };
}
function parseTraversal(value: unknown, snapshot: TrafficSnapshot): PublicTraversal {
  const row = record(value, ["segment_id", "direction", "status", "id", "entered_at", "exited_at", "baseline_seconds", "baseline_label", "delay_seconds", "valid_until", "provenance"]);
  const segment = directed(row, snapshot);
  if (!["available", "missing", "stale", "future", "invalid", "incompatible"].includes(row.status as string)) return invalid();
  const id = row.id === null ? null : reportUuid(row.id);
  const entered_at = nullableTime(row.entered_at), exited_at = nullableTime(row.exited_at), valid_until = nullableTime(row.valid_until);
  const baseline_seconds = row.baseline_seconds;
  const baseline_label = row.baseline_label;
  if (baseline_seconds !== null && (typeof baseline_seconds !== "number" || !Number.isInteger(baseline_seconds) || baseline_seconds < 1 || baseline_seconds > 86400)) return invalid();
  if (baseline_label !== null && (typeof baseline_label !== "string" || !baseline_label.trim() || baseline_label.length > 500)) return invalid();
  const delay_seconds = row.delay_seconds;
  if (row.status === "available") {
    if (!id || !entered_at || !exited_at || !valid_until || baseline_seconds !== segment.baseline_seconds || baseline_label !== segment.baseline_label) return invalid();
    const entry = trafficTimestampMicros(entered_at), exit = trafficTimestampMicros(exited_at), read = trafficTimestampMicros(snapshot.read_at);
    const expected = Math.max(0, exit - entry - segment.baseline_seconds * 1_000_000) / 1_000_000;
    if (entry >= exit || exit > read || entry <= read - 1_200_000_000 || trafficTimestampMicros(valid_until) !== entry + 1_200_000_000 || delay_seconds !== expected) return invalid();
  } else if (delay_seconds !== null) return invalid();
  if (row.status === "missing" && [id, entered_at, exited_at, valid_until, baseline_seconds, baseline_label].some(v => v !== null)) return invalid();
  return { segment_id: segment.id, direction: segment.direction, status: row.status as PublicTraversal["status"], id, entered_at, exited_at,
    baseline_seconds: baseline_seconds as number | null, baseline_label: baseline_label as string | null,
    delay_seconds: delay_seconds as number | null, valid_until, provenance: "simulated" };
}
export function parsePhase4Snapshot(input: unknown): Phase4Snapshot {
  const envelope = record(input, ["traffic", "incidents", "traversals"]);
  const traffic = parseTrafficSnapshot(envelope.traffic);
  const incidents = collection(envelope.incidents, 10000).map(value => parseIncident(value, traffic));
  const traversals = collection(envelope.traversals, 50).map(value => parseTraversal(value, traffic));
  if (new Set(incidents.map(row => row.id)).size !== incidents.length || new Set(traversals.map(row => row.segment_id)).size !== traversals.length
    || traversals.length !== (traffic.fixture?.segments.length ?? 0)) return invalid();
  for (const row of incidents) {
    if (row.prior_incident_id) {
      const prior = incidents.find(candidate => candidate.id === row.prior_incident_id);
      if (!prior || prior.segment_id !== row.segment_id || prior.direction !== row.direction || prior.state !== "cleared"
        || !prior.recovery_end || trafficTimestampMicros(prior.recovery_end) >= trafficTimestampMicros(row.started_at)) return invalid();
    }
  }
  return { traffic, incidents, traversals };
}
