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

export type AuthorityNotificationItem = {
  id: string;
  incident_id: string;
  category: string;
  landmark: string;
  lat: number;
  lng: number;
  has_photo: boolean;
  photo_summary: string | null;
  level: TrafficEvidenceLevel;
  reporter_email: string | null;
  is_read: boolean;
  created_at: string;
};

export type AuthorityNotificationsResponse =
  | { ok: true; notifications: AuthorityNotificationItem[] }
  | { ok: false; error: string };

export const MANGALURU_LANDMARKS: readonly { name: string; lat: number; lng: number }[] = [
  { name: "Hampankatta (City Centre)", lat: 12.868, lng: 74.842 },
  { name: "Lalbagh Junction (MG Road)", lat: 12.877, lng: 74.846 },
  { name: "KSRTC Bus Stand (Bejai)", lat: 12.885, lng: 74.848 },
  { name: "Ladyhill Circle", lat: 12.894, lng: 74.841 },
  { name: "Bunts Hostel Circle", lat: 12.872, lng: 74.849 },
  { name: "Jyoti (Ambedkar) Circle", lat: 12.871, lng: 74.845 },
  { name: "Nanthoor Junction", lat: 12.874, lng: 74.865 },
  { name: "Pumpwell (Mahaveera) Circle", lat: 12.858, lng: 74.862 },
  { name: "Kottara Chowki", lat: 12.908, lng: 74.838 },
  { name: "Kadri Park / Circuit House", lat: 12.882, lng: 74.858 },
  { name: "Mangaluru Central Railway", lat: 12.864, lng: 74.839 },
  { name: "Mangalore International Airport", lat: 12.961, lng: 74.890 },
];

export function resolveNearestLandmark(lat: number, lng: number): string {
  let closest = MANGALURU_LANDMARKS[0];
  let minDistanceM = Number.POSITIVE_INFINITY;

  for (const landmark of MANGALURU_LANDMARKS) {
    const dLat = (lat - landmark.lat) * 111_000;
    const dLng = (lng - landmark.lng) * 108_200;
    const distanceM = Math.sqrt(dLat * dLat + dLng * dLng);
    if (distanceM < minDistanceM) {
      minDistanceM = distanceM;
      closest = landmark;
    }
  }

  if (minDistanceM < 300) {
    return `Near ${closest.name}`;
  }
  if (minDistanceM < 1500) {
    return `${closest.name} Corridor`;
  }
  const km = (minDistanceM / 1000).toFixed(1);
  return `${closest.name} area (~${km} km)`;
}
