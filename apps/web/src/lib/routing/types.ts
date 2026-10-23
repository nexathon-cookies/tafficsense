// Plan 4 (revised) Route types for dynamic routing across Mangaluru

export type Coordinate = [number, number]; // [longitude, latitude] (GeoJSON standard)

export type RouteGeometry = {
  type: "LineString";
  coordinates: Coordinate[];
};

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
  duration_s: number; // free-flow expected duration in seconds
  geometry: RouteGeometry;
  is_recommended: boolean;
  avoids_incident: boolean;
  avoided_incident_reason?: string;
  incidents_on_route: RouteIncidentWarning[];
  provenance: "estimated";
};

export type RouteResponse = {
  ok: boolean;
  routes: RouteOption[];
  error?: string;
};

// Mangaluru region bounding box: roughly [minLng, minLat, maxLng, maxLat]
export const MANGALURU_BOUNDS = {
  minLng: 74.70,
  maxLng: 75.05,
  minLat: 12.75,
  maxLat: 13.05,
} as const;

export function isWithinMangaluruBounds(coord: Coordinate): boolean {
  const [lng, lat] = coord;
  return (
    lng >= MANGALURU_BOUNDS.minLng &&
    lng <= MANGALURU_BOUNDS.maxLng &&
    lat >= MANGALURU_BOUNDS.minLat &&
    lat <= MANGALURU_BOUNDS.maxLat
  );
}

export function formatRouteDuration(seconds: number): string {
  if (seconds <= 0) return "0 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hrs} hr ${remainingMins} min` : `${hrs} hr`;
}

export function formatRouteDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
