export type TrafficEvidenceLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export type IncidentStatus = "open" | "resolved" | "expired";
export type IncidentProvenance = "reported" | "verified" | "authority";

export type LiveIncident = {
  id: string;
  category: string;
  lat: number;
  lng: number;
  status: IncidentStatus;
  level: TrafficEvidenceLevel;
  level_reason: string;
  first_reported_at: string;
  last_confirmed_at: string;
  provenance: IncidentProvenance;
  report_count: number;
};

export type ActiveIncidentsResponse =
  | { ok: true; incidents: LiveIncident[] }
  | { ok: false; error: string };

export const reportCategories = [
  ["accident", "Accident"],
  ["road_repair", "Road repair / construction"],
  ["festival", "Festival / public event"],
  ["strike", "Strike / protest"],
  ["vip_movement", "VIP movement"],
  ["landslide", "Landslide"],
  ["heavy_rain", "Heavy rain"],
  ["flood", "Flood / waterlogging"],
  ["signal_failure", "Traffic signal failure"],
  ["breakdown", "Vehicle breakdown"],
  ["road_closed", "Road closure"],
  ["bridge_maintenance", "Bridge / road maintenance"],
  ["police_restriction", "Police / security restrictions"],
  ["fallen_tree", "Fallen tree / hazard"],
  ["heavy_traffic", "Heavy traffic / congestion"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

export type ReportCategory = (typeof reportCategories)[number][0];
export type SubmitIncidentResponse =
  | { ok: true; incident_id: string; level: string; level_reason: string; distinct_reporters?: number }
  | { ok: false; error: string };

export type RouteCoordinate = [number, number];

export type RouteIncidentWarning = {
  id: string;
  category: string;
  level: string;
  label: string;
  distance_to_route_m: number;
};

export type RouteOption = {
  id: string;
  name: string;
  distance_m: number;
  duration_s: number;
  geometry: {
    type: "LineString";
    coordinates: RouteCoordinate[];
  };
  is_recommended: boolean;
  avoids_incident: boolean;
  avoided_incident_reason?: string;
  incidents_on_route: RouteIncidentWarning[];
  provenance: "estimated";
};

export type RouteResponse =
  | { ok: true; routes: RouteOption[] }
  | { ok: false; routes: RouteOption[]; error: string };

// Schematic corridor segments from GET /api/traffic. Provenance is always simulated.
export type TrafficSegmentSeverity = "slowdown" | "corroborated" | "reported" | "clear";

export type TrafficSegment = {
  id: string;
  name: string;
  direction: string;
  geometry: { type: "LineString"; coordinates: RouteCoordinate[] };
  severity: TrafficSegmentSeverity;
  provenance: "simulated";
};

export type TrafficSegmentsResponse =
  | { ok: true; read_at: string; segments: TrafficSegment[] }
  | { ok: false; error: string };
