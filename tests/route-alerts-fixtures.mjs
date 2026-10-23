import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";

export const readAt = "2026-10-16T04:00:00.000001Z";
export const incidentId = "6c491f94-8c75-4a56-9c20-a332ae9de920";
export function timestamp(micros) {
  const base = new Date(Math.floor(micros / 1000)).toISOString();
  return micros % 1000 ? base.replace("Z", `${String(micros % 1000).padStart(3, "0")}Z`) : base;
}
export const readUs = Date.parse("2026-10-16T04:00:00Z") * 1000 + 1;
export function input(savings = 300_000_000) {
  const fixture = createTrafficFixture("slowdown", "2026-10-16T04:00:00.000Z");
  const durations = [240_000_000 + savings, 180_000_000, 240_000_000, 180_000_000, 180_000_000];
  const traversals = fixture.segments.map((s, i) => ({ segment_id: s.id, direction: s.direction, status: "available",
    id: `6c491f94-8c75-4a56-9c20-a332ae9de92${i}`, entered_at: timestamp(readUs - durations[i]), exited_at: readAt,
    baseline_seconds: s.baseline_seconds, baseline_label: s.baseline_label,
    delay_seconds: Math.max(0, durations[i] - s.baseline_seconds * 1_000_000) / 1_000_000,
    valid_until: timestamp(readUs - durations[i] + 1_200_000_000), provenance: "simulated" }));
  return { phase4: { traffic: { read_at: readAt, fixture, reports: [], incident_episodes: [], reporting_enabled: false,
    report_assessments: fixture.segments.map(s => ({ segment_id: s.id, direction: s.direction, report_count: 0,
      recent_report_count: 0, eligible_report_count: 0, eligible_source_count: 0, multiple_sources: false, valid_until: null, provenance: "simulated" })) },
    incidents: [{ id: incidentId, segment_id: "primary-west", direction: "outbound", state: "supported", is_current: true,
      started_at: timestamp(readUs - 660_000_000), last_supported_at: timestamp(readUs - 360_000_000),
      cleared_at: null, recovery_end: null, valid_until: timestamp(readUs + 540_000_000), supporting_source_count: 3,
      recovered_source_count: 0, prior_incident_id: null, report_episode_ids: [], provenance: "simulated", cause: "unknown" }], traversals },
    route_comparison: { status: "available", primary_route_id: "primary", alternative_route_id: "alternative", direction: "outbound",
      primary_segment_ids: ["primary-west", "primary-east"], alternative_segment_ids: ["alternative-west", "alternative-east"],
      primary_duration_us: 420_000_000 + savings, alternative_duration_us: 420_000_000, savings_us: savings,
      valid_until: timestamp(readUs - Math.max(...durations.slice(0, 4)) + 1_200_000_000), supported_incident_ids: [incidentId], provenance: "simulated" } };
}
export function unavailable(data, status) {
  Object.assign(data.route_comparison, { status, primary_duration_us: null, alternative_duration_us: null,
    savings_us: null, valid_until: null, supported_incident_ids: [] });
  return data;
}
export function addReport(data, category, observed = readUs, received = Math.max(observed, readUs), segment = "alternative-west") {
  const id = "dfed11cc-b09a-4d8a-8d74-1acee5143308";
  const direction = data.phase4.traffic.fixture.segments.find(s => s.id === segment).direction;
  data.phase4.traffic.reports.push({ id, episode_id: id, segment_id: segment, direction, category,
    observed_at: timestamp(observed), received_at: timestamp(received), provenance: "simulated", location_provenance: "manual" });
  data.phase4.traffic.incident_episodes.push({ id, segment_id: segment, direction, created_at: timestamp(received),
    first_observed_at: timestamp(observed), last_observed_at: timestamp(observed), report_count: 1, provenance: "simulated" });
  const recent = observed > readUs - 1_200_000_000 && observed <= readUs && received <= readUs;
  const future = received > readUs && observed > received - 1_200_000_000;
  Object.assign(data.phase4.traffic.report_assessments.find(s => s.segment_id === segment), { report_count: 1,
    recent_report_count: Number(recent), valid_until: recent ? new Date(Math.floor(observed / 1000) + 1_200_000).toISOString()
      : future ? new Date(Math.floor(received / 1000)).toISOString() : null });
  return data;
}
