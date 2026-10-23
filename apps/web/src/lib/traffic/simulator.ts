import { authoredSpeedKph } from "./motion-schedule.ts";

export const DEMO_CORRIDOR_ID = "mangaluru-central-v1";
export const DEFAULT_DEMO_ANCHOR = "2026-10-15T04:00:00.000Z";

export type TrafficScenario = "normal" | "slowdown" | "recovery";
export type TrafficDirection = "outbound" | "inbound";
export type DemoLine = { type: "LineString"; coordinates: [number, number][] };
export type DemoSegment = {
  id: string;
  name: string;
  direction: TrafficDirection;
  geometry: DemoLine;
  length_m: number;
  baseline_seconds: number;
  baseline_label: string;
};
export type TrafficFixture = {
  corridor: {
    id: typeof DEMO_CORRIDOR_ID;
    name: string;
    provenance: "simulated";
    geometry_note: string;
    scenario: TrafficScenario;
    anchor_at: string;
  };
  segments: DemoSegment[];
  routes: { id: string; name: string; kind: "primary" | "alternative"; direction: TrafficDirection }[];
  route_segments: { route_id: string; segment_id: string; position: number; direction: TrafficDirection }[];
  sources: { id: string; segment_id: string; label: string }[];
  observations: { segment_id: string; source_id: string; observed_at: string; speed_kph: number }[];
};

export function createTrafficFixture(scenario: unknown, anchor: unknown): TrafficFixture {
  if (scenario !== "normal" && scenario !== "slowdown" && scenario !== "recovery") {
    throw new Error("Unsupported traffic scenario. Use normal, slowdown or recovery.");
  }
  if (typeof anchor !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(anchor)
    || !Number.isFinite(Date.parse(anchor)) || new Date(anchor).toISOString() !== anchor) {
    throw new Error("The anchor must be a canonical millisecond UTC timestamp in 2000–2099.");
  }
  const baseline_label = "Demo baseline v1 — assumed length and traversal time, not measured traffic";
  const segments: DemoSegment[] = [
    { id: "primary-west", name: "Primary west · outward", direction: "outbound", length_m: 1500, baseline_seconds: 180, baseline_label,
      geometry: { type: "LineString", coordinates: [[74.842, 12.871], [74.846, 12.874], [74.85, 12.877]] } },
    { id: "primary-east", name: "Primary east · outward", direction: "outbound", length_m: 1000, baseline_seconds: 120, baseline_label,
      geometry: { type: "LineString", coordinates: [[74.85, 12.877], [74.854, 12.88], [74.858, 12.885]] } },
    { id: "alternative-west", name: "Alternative west · outward", direction: "outbound", length_m: 2200, baseline_seconds: 240, baseline_label,
      geometry: { type: "LineString", coordinates: [[74.842, 12.871], [74.84, 12.881], [74.848, 12.886]] } },
    { id: "alternative-east", name: "Alternative east · outward", direction: "outbound", length_m: 1200, baseline_seconds: 180, baseline_label,
      geometry: { type: "LineString", coordinates: [[74.848, 12.886], [74.854, 12.888], [74.858, 12.885]] } },
    { id: "primary-west-inbound", name: "Primary west · opposite direction", direction: "inbound", length_m: 1500, baseline_seconds: 180, baseline_label,
      geometry: { type: "LineString", coordinates: [[74.85, 12.877], [74.846, 12.874], [74.842, 12.871]] } },
  ];
  const sources = segments.flatMap(segment => [1, 2, 3].map(index => ({
    id: `${segment.id}-source-${index}`, segment_id: segment.id, label: `SIMULATED ${segment.name} source ${index}`,
  })));
  const observations: TrafficFixture["observations"] = [];
  for (let minute = 0; minute < 12; minute++) {
    const observed_at = new Date(Date.parse(anchor) - (11 - minute) * 60_000).toISOString();
    for (const segment of segments) {
      const speed_kph = authoredSpeedKph(scenario, segment, minute);
      for (const source of sources.filter(source => source.segment_id === segment.id)) {
        observations.push({ segment_id: segment.id, source_id: source.id, observed_at, speed_kph });
      }
    }
  }
  return {
    corridor: {
      id: DEMO_CORRIDOR_ID, name: "SIMULATED · Mangaluru central demonstration corridor", provenance: "simulated",
      geometry_note: "Hand-authored schematic geometry near Mangaluru; not surveyed roads, GPS observations or navigation guidance.",
      scenario, anchor_at: anchor,
    },
    segments,
    routes: [
      { id: "primary", name: "SIMULATED primary route", kind: "primary", direction: "outbound" },
      { id: "alternative", name: "SIMULATED fixed alternative", kind: "alternative", direction: "outbound" },
    ],
    route_segments: [
      { route_id: "primary", segment_id: "primary-west", position: 1, direction: "outbound" },
      { route_id: "primary", segment_id: "primary-east", position: 2, direction: "outbound" },
      { route_id: "alternative", segment_id: "alternative-west", position: 1, direction: "outbound" },
      { route_id: "alternative", segment_id: "alternative-east", position: 2, direction: "outbound" },
    ],
    sources, observations,
  };
}
