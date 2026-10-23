import {
  type Coordinate,
  type RouteOption,
  type RouteResponse,
  type RouteIncidentWarning,
  isWithinMangaluruBounds,
} from "./types.ts";
import type { TrafficSnapshot } from "../traffic/snapshot.ts";

export type VerifiedIncident = {
  id: string;
  category: string;
  level: string;
  point: Coordinate; // [lng, lat]
  label?: string;
};

/**
 * Turns current multi-source report assessments into route warnings without
 * exposing report identities. These are L3 corroboration indicators, not
 * confirmed causes or measured congestion.
 */
export function reportAssessmentRouteIncidents(snapshot: TrafficSnapshot): VerifiedIncident[] {
  const fixture = snapshot.fixture;
  if (!fixture) return [];
  const readAt = Date.parse(snapshot.read_at);

  return snapshot.report_assessments.flatMap((assessment) => {
    if (!assessment.multiple_sources || !assessment.valid_until || Date.parse(assessment.valid_until) <= readAt) return [];
    const segment = fixture.segments.find(
      (candidate) => candidate.id === assessment.segment_id && candidate.direction === assessment.direction
    );
    if (!segment) return [];
    const coordinates = segment.geometry.coordinates;
    return [{
      id: `report-assessment-${segment.id}`,
      category: "traffic_slowdown",
      level: "L3",
      point: coordinates[Math.floor(coordinates.length / 2)],
      label: `${segment.name} (L3 multiple sources)`,
    }];
  });
}

/**
 * Calculates Haversine distance in meters between two [lng, lat] coordinates.
 */
export function haversineDistanceM(coord1: Coordinate, coord2: Coordinate): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371000; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Returns minimum distance in meters from a point to a route geometry.
 */
export function minDistanceToRoute(point: Coordinate, routeCoords: Coordinate[]): number {
  if (routeCoords.length === 0) return Infinity;
  let minDistance = Infinity;

  for (let i = 0; i < routeCoords.length; i++) {
    const d = haversineDistanceM(point, routeCoords[i]);
    if (d < minDistance) {
      minDistance = d;
    }
  }

  return minDistance;
}

/**
 * Checks which verified incidents fall within thresholdM of the route.
 */
export function findIncidentsOnRoute(
  routeCoords: Coordinate[],
  incidents: VerifiedIncident[],
  thresholdM = 200
): RouteIncidentWarning[] {
  const warnings: RouteIncidentWarning[] = [];

  for (const inc of incidents) {
    const dist = minDistanceToRoute(inc.point, routeCoords);
    if (dist <= thresholdM) {
      warnings.push({
        id: inc.id,
        category: inc.category,
        level: inc.level,
        label: inc.label ?? `${inc.category.replace(/_/g, " ")} (${inc.level})`,
        distance_to_route_m: Math.round(dist),
      });
    }
  }

  return warnings;
}

export type RawOsrmRoute = {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][];
  };
};

export type RawOsrmResponse = {
  code: string;
  routes?: RawOsrmRoute[];
  message?: string;
};

/**
 * Parses raw OSRM routing response and evaluates incident avoidance.
 * If the primary route has incidents but an alternative route does not,
 * the alternative route is promoted to recommended with avoidance metadata.
 */
export function parseOsrmResponse(
  raw: RawOsrmResponse,
  incidents: VerifiedIncident[] = []
): RouteResponse {
  if (raw.code !== "Ok" || !raw.routes || raw.routes.length === 0) {
    return {
      ok: false,
      routes: [],
      error: raw.message ?? "No route could be found between the specified points.",
    };
  }

  const parsedRoutes: RouteOption[] = raw.routes.map((r, index) => {
    const coords = r.geometry.coordinates;
    const incidentsOnThisRoute = findIncidentsOnRoute(coords, incidents, 200);

    return {
      id: `route-${index + 1}`,
      name: index === 0 ? "Fastest route (standard)" : `Alternative route ${index}`,
      distance_m: Math.round(r.distance),
      duration_s: Math.round(r.duration),
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
      is_recommended: index === 0,
      avoids_incident: false,
      incidents_on_route: incidentsOnThisRoute,
      provenance: "estimated",
    };
  });

  // Re-routing logic (Plan 4 Section 7):
  // If the primary route (index 0) passes within 200m of a verified incident (L3+ or L6),
  // and there is an alternative route that avoids it, promote the avoiding alternative.
  const primaryIncidents = parsedRoutes[0].incidents_on_route.filter(
    (w) => w.level === "L3" || w.level === "L4" || w.level === "L5" || w.level === "L6"
  );

  if (primaryIncidents.length > 0 && parsedRoutes.length > 1) {
    // Look for an alternative that avoids these incidents
    let avoidingRouteIndex = parsedRoutes.findIndex(
      (r, idx) => idx > 0 && r.incidents_on_route.length === 0
    );
    if (avoidingRouteIndex === -1) {
      avoidingRouteIndex = parsedRoutes.findIndex(
        (r, idx) => idx > 0 && !r.incidents_on_route.some((w) => w.id === primaryIncidents[0].id)
      );
    }

    if (avoidingRouteIndex !== -1) {
      const avoidingRoute = parsedRoutes[avoidingRouteIndex];
      const avoidedIncident = primaryIncidents[0];

      // Mark the avoiding route as recommended
      parsedRoutes[0].is_recommended = false;
      avoidingRoute.is_recommended = true;
      avoidingRoute.avoids_incident = true;
      avoidingRoute.avoided_incident_reason = `Avoiding ${avoidedIncident.category.replace(
        /_/g,
        " "
      )} ahead (verified ${avoidedIncident.level})`;
      avoidingRoute.name = `Recommended detour (avoids ${avoidedIncident.category.replace(/_/g, " ")})`;

      // Move the avoiding route to the front of the list
      parsedRoutes.splice(avoidingRouteIndex, 1);
      parsedRoutes.unshift(avoidingRoute);
    }
  }

  return {
    ok: true,
    routes: parsedRoutes,
  };
}

/**
 * Builds the OSRM routing URL for two coordinates with alternatives.
 */
export function buildOsrmUrl(
  start: Coordinate,
  destination: Coordinate,
  baseUrl = "https://router.project-osrm.org",
  alternatives: boolean | number = true
): string {
  const coords = `${start[0]},${start[1]};${destination[0]},${destination[1]}`;
  const altValue = typeof alternatives === "number" ? alternatives : alternatives ? "true" : "false";
  return `${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${altValue}`;
}

/**
 * Executes a routing query via OSRM, checking bounds and evaluating incident avoidance.
 */
export async function queryRoute(
  start: Coordinate,
  destination: Coordinate,
  incidents: VerifiedIncident[] = [],
  fetchFn: typeof fetch = fetch,
  enableCorridors = false
): Promise<RouteResponse> {
  if (!isWithinMangaluruBounds(start) || !isWithinMangaluruBounds(destination)) {
    return {
      ok: false,
      routes: [],
      error: "Coordinates are outside the supported Mangaluru service area.",
    };
  }

  const url = buildOsrmUrl(start, destination);

  try {
    const res = await fetchFn(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return {
        ok: false,
        routes: [],
        error: "Routing unavailable. Please try again later.",
      };
    }

    const data = (await res.json()) as RawOsrmResponse;
    const directResult = parseOsrmResponse(data, incidents);
    if (!directResult.ok || directResult.routes.length > 1 || !enableCorridors) {
      return directResult;
    }

    // When OSRM direct query returns only 1 route and enableCorridors is true, check parallel Mangaluru corridors
    const MANGALURU_CORRIDORS: Array<{ name: string; coord: Coordinate }> = [
      { name: "via Kottara Chowki / NH66", coord: [74.8380, 12.9080] },
      { name: "via Kuntikan / Derebail", coord: [74.8450, 12.9000] },
      { name: "via Vamanjoor / Gurupura", coord: [74.8970, 12.9100] },
    ];

    const primary = directResult.routes[0];
    const initialRoutes = Array.isArray(data.routes) ? data.routes : [];
    const combinedRoutes = [...initialRoutes];

    for (const corridor of MANGALURU_CORRIDORS) {
      const dStart = haversineDistanceM(start, corridor.coord);
      const dDest = haversineDistanceM(destination, corridor.coord);
      if (dStart < 700 || dDest < 700) continue;

      try {
        const cUrl = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${corridor.coord[0]},${corridor.coord[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
        const cRes = await fetchFn(cUrl, { headers: { Accept: "application/json" } });
        if (cRes.ok) {
          const cData = (await cRes.json()) as RawOsrmResponse;
          if (cData.code === "Ok" && Array.isArray(cData.routes) && cData.routes.length > 0) {
            const alt = cData.routes[0];
            if (alt.duration <= primary.duration_s * 1.5 && alt.distance <= primary.distance_m * 1.5) {
              combinedRoutes.push(alt);
              if (combinedRoutes.length >= 3) break;
            }
          }
        }
      } catch {
        // Fallback gracefully
      }
    }

    if (combinedRoutes.length > initialRoutes.length) {
      return parseOsrmResponse({ ...data, routes: combinedRoutes }, incidents);
    }

    return directResult;
  } catch {
    return {
      ok: false,
      routes: [],
      error: "Routing unavailable. Please try again later.",
    };
  }
}
