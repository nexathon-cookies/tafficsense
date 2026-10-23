import { parsePhase5Snapshot, type Phase5Snapshot } from "./snapshot.ts";
import { trafficTimestampMicros } from "../traffic/snapshot.ts";

export type RouteAlert = {
  segment_id: string; direction: "inbound" | "outbound"; kind: "alert" | "abstain"; reason: string | null;
  savings_us: number | null; valid_until: string | null; incident_id: string | null; provenance: "simulated";
};
const hazards = new Set(["accident", "road_repair", "flood", "landslide", "road_closed"]);
function checked(snapshot: Phase5Snapshot): Phase5Snapshot {
  const times = snapshot.report_times;
  if (!Array.isArray(times) || times.length !== snapshot.phase4.traffic.reports.length
    || new Set(times.map(row => row.id)).size !== times.length) throw new Error("Invalid report clocks.");
  const reports = snapshot.phase4.traffic.reports.map(report => {
    const clock = times.find(row => row.id === report.id);
    if (!clock || Date.parse(clock.observed_at) !== Date.parse(report.observed_at)
      || Date.parse(clock.received_at) !== Date.parse(report.received_at)) throw new Error("Invalid report clocks.");
    return { ...report, observed_at: clock.observed_at, received_at: clock.received_at };
  });
  return parsePhase5Snapshot({ phase4: { ...snapshot.phase4, traffic: { ...snapshot.phase4.traffic, reports } }, route_comparison: snapshot.route_comparison });
}
export function deriveRouteAlerts(snapshot: Phase5Snapshot): RouteAlert[] {
  let validated: Phase5Snapshot | null;
  try { validated = checked(snapshot); } catch { validated = null; }
  const segments = snapshot.phase4.traffic.fixture?.segments ?? [];
  return segments.map(segment => {
    const base: RouteAlert = { segment_id: segment.id, direction: segment.direction, kind: "abstain", reason: null,
      savings_us: null, valid_until: null, incident_id: null, provenance: "simulated" };
    const abstain = (reason: string): RouteAlert => ({ ...base, reason });
    const membership = snapshot.phase4.traffic.fixture!.route_segments;
    if (segment.direction !== "outbound" || !membership.some(row => row.route_id === "primary" && row.segment_id === segment.id && row.direction === "outbound")
      || membership.some(row => row.route_id === "alternative" && row.segment_id === segment.id)) return abstain("unrelated_selection");
    if (!validated) return abstain("invalid");
    const { phase4, route_comparison: comparison, report_times } = validated;
    if (!comparison.alternative_segment_ids.length) return abstain("no_alternative");
    if (comparison.status !== "available") return abstain(comparison.status);
    const read = trafficTimestampMicros(phase4.traffic.read_at);
    const supported = (row: Phase5Snapshot["phase4"]["incidents"][number]) => row.state === "supported" && row.is_current
      && row.valid_until !== null && trafficTimestampMicros(row.valid_until) > read;
    const incidents = phase4.incidents.filter(row => row.segment_id === segment.id && row.direction === segment.direction
      && supported(row) && comparison.supported_incident_ids.includes(row.id));
    if (!incidents.length) return abstain("unsupported_incident");
    const incident = incidents.reduce((earliest, row) => trafficTimestampMicros(row.valid_until!) < trafficTimestampMicros(earliest.valid_until!) ? row : earliest);
    const hazard = phase4.traffic.reports.some(report => {
      if (report.direction !== comparison.direction || !comparison.alternative_segment_ids.includes(report.segment_id) || !hazards.has(report.category)) return false;
      const clock = report_times.find(row => row.id === report.id)!;
      const observed = trafficTimestampMicros(clock.observed_at), received = trafficTimestampMicros(clock.received_at);
      return observed > read - 1_200_000_000 && observed <= read && received <= read;
    });
    if (hazard) return abstain("alternative_hazard");
    if (phase4.incidents.some(row => comparison.alternative_segment_ids.includes(row.segment_id)
      && row.direction === comparison.direction && supported(row))) return abstain("alternative_slowdown");
    const savings = comparison.savings_us!;
    if (savings < 300_000_000) return { ...abstain("below_threshold"), savings_us: savings };
    const valid_until = trafficTimestampMicros(comparison.valid_until!) < trafficTimestampMicros(incident.valid_until!)
      ? comparison.valid_until : incident.valid_until;
    return { ...base, kind: "alert", savings_us: savings, valid_until, incident_id: incident.id };
  });
}
