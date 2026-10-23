import {
  type Coordinate,
  type RouteOption,
  type RouteIncidentWarning,
  isWithinMangaluruBounds,
} from "./types.ts";
import {
  haversineDistanceM,
  minDistanceToRoute,
  findIncidentsOnRoute,
  type VerifiedIncident,
  type RawOsrmResponse,
} from "./engine.ts";

export type RerouteBlockedIncident = {
  id: string;
  point: Coordinate; // [lng, lat]
  category?: string;
  level?: string;
  label?: string;
};

export type RerouteParams = {
  currentLocation: Coordinate; // Commuter's exact [lng, lat]
  destination: Coordinate;     // Destination [lng, lat]
  blockedIncident: RerouteBlockedIncident;
  otherIncidents?: VerifiedIncident[];
  exclusionRadiusM?: number;    // default 250m
  baseUrl?: string;
  fetchFn?: typeof fetch;
};

export type DetourRouteDetails = RouteOption & {
  bypassWaypoint: Coordinate;
  bypassStreetName?: string;
  avoidedIncident: RerouteBlockedIncident;
  extraDurationSeconds: number;
  extraDistanceMeters: number;
  turnCoordinates: Coordinate[]; // Exact coordinate vertices along the route
};

export type RerouteResult =
  | {
      ok: true;
      detourRoute: DetourRouteDetails;
      directRoute?: RouteOption;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Evaluates whether a route polyline safely clears an obstacle.
 * Takes into account starting/destination proximity so commuters departing from an area near a hazard
 * are evaluated accurately as they move away from the incident rather than falsely rejected.
 */
export function routeClearsObstacle(
  routeCoords: Coordinate[],
  obstaclePoint: Coordinate,
  exclusionRadiusM: number,
  startPoint: Coordinate,
  destPoint: Coordinate
): { clears: boolean; minDistanceM: number } {
  const startDist = haversineDistanceM(startPoint, obstaclePoint);
  const destDist = haversineDistanceM(destPoint, obstaclePoint);
  const minDistanceM = Math.round(minDistanceToRoute(obstaclePoint, routeCoords));

  // Standard case: obstacle is well away from start and destination (> exclusionRadiusM + 25m)
  if (startDist > exclusionRadiusM + 25 && destDist > exclusionRadiusM + 25) {
    return {
      clears: minDistanceM >= exclusionRadiusM,
      minDistanceM,
    };
  }

  // Edge case: commuter is currently positioned near the incident zone (e.g. within 200m).
  // 1. The route must NEVER penetrate the crash/obstruction epicenter (< 40m).
  if (minDistanceM < 40) {
    return { clears: false, minDistanceM };
  }

  // 2. The route must not drive into the hazard (must not get significantly closer than origin/dest).
  const baselineDist = Math.min(
    startDist <= exclusionRadiusM + 25 ? startDist : Number.POSITIVE_INFINITY,
    destDist <= exclusionRadiusM + 25 ? destDist : Number.POSITIVE_INFINITY
  );
  if (minDistanceM < Math.max(40, baselineDist - 60)) {
    return { clears: false, minDistanceM };
  }

  // 3. For vertices past the initial departure zone (250m along path),
  // the route must not cut back through the exclusion radius.
  let cumulativeDistM = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    cumulativeDistM += haversineDistanceM(routeCoords[i - 1], routeCoords[i]);
    if (cumulativeDistM > 250) {
      const vDist = haversineDistanceM(routeCoords[i], obstaclePoint);
      if (vDist < exclusionRadiusM) {
        return { clears: false, minDistanceM };
      }
    }
  }

  return { clears: true, minDistanceM };
}

/**
 * Computes candidate bypass waypoints around an obstacle point at various radial
 * bearings and distances.
 */
export function generateCandidateWaypoints(
  currentLocation: Coordinate,
  incidentPoint: Coordinate,
  radiiM: number[] = [450, 750, 1200, 2000, 3200]
): Coordinate[] {
  const [cLng, cLat] = currentLocation;
  const [iLng, iLat] = incidentPoint;

  // Approach vector from commuter to incident
  const dLng = iLng - cLng;
  const dLat = iLat - cLat;
  const approachBearingRad = Math.atan2(dLat, dLng);

  // Lateral angle offsets (orthogonal left/right and forward/reverse diagonals)
  const angleOffsetsDeg = [90, -90, 60, -60, 120, -120, 45, -45, 135, -135, 150, -150, 180];
  const candidates: Coordinate[] = [];

  const latMPerDeg = 111000;
  const lngMPerDeg = 111000 * Math.cos((iLat * Math.PI) / 180);

  for (const r of radiiM) {
    for (const offsetDeg of angleOffsetsDeg) {
      const angleRad = approachBearingRad + (offsetDeg * Math.PI) / 180;
      const offsetLat = (r * Math.sin(angleRad)) / latMPerDeg;
      const offsetLng = (r * Math.cos(angleRad)) / lngMPerDeg;

      const candidate: Coordinate = [
        Number((iLng + offsetLng).toFixed(6)),
        Number((iLat + offsetLat).toFixed(6)),
      ];

      if (isWithinMangaluruBounds(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

export type SnappedRoadNode = {
  coordinate: Coordinate;
  streetName?: string;
  distanceToRawM: number;
};

/**
 * Snaps a raw coordinate to the nearest drivable road using OSRM /nearest.
 */
export async function snapToRoadNetwork(
  coord: Coordinate,
  fetchFn: typeof fetch = fetch,
  baseUrl = "https://router.project-osrm.org"
): Promise<SnappedRoadNode | null> {
  const url = `${baseUrl}/nearest/v1/driving/${coord[0]},${coord[1]}?number=1`;
  try {
    const res = await fetchFn(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !Array.isArray(data.waypoints) || data.waypoints.length === 0) {
      return null;
    }

    const wp = data.waypoints[0];
    return {
      coordinate: [wp.location[0], wp.location[1]],
      streetName: wp.name || undefined,
      distanceToRawM: wp.distance ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Calculates a dynamic detour route from commuter's exact location to destination,
 * steering around a blocked incident location using snapped road waypoints.
 */
export async function calculateDetourRoute(
  params: RerouteParams
): Promise<RerouteResult> {
  const {
    currentLocation,
    destination,
    blockedIncident,
    otherIncidents = [],
    exclusionRadiusM = 200,
    baseUrl = "https://router.project-osrm.org",
    fetchFn = fetch,
  } = params;

  if (!isWithinMangaluruBounds(currentLocation) || !isWithinMangaluruBounds(destination)) {
    return {
      ok: false,
      error: "Coordinates are outside the supported Mangaluru service area.",
    };
  }

  // 1. Generate candidate bypass waypoints around the incident at diverse radial tiers
  const rawWaypoints = generateCandidateWaypoints(
    currentLocation,
    blockedIncident.point,
    [450, 750, 1200, 2000, 3200]
  );

  // Strategic Mangaluru arterial corridor bypass nodes
  const MANGALURU_CORRIDORS: Coordinate[] = [
    [74.8380, 12.9080], // Kottara Chowki / NH66
    [74.8450, 12.9000], // Kuntikan / Derebail
    [74.8970, 12.9100], // Vamanjoor / Gurupura
    [74.8650, 12.8850], // Bikarnakatte
  ];

  for (const c of MANGALURU_CORRIDORS) {
    if (haversineDistanceM(c, blockedIncident.point) >= exclusionRadiusM * 2) {
      rawWaypoints.push(c);
    }
  }

  if (rawWaypoints.length === 0) {
    return {
      ok: false,
      error: "Could not generate bypass waypoints within service boundaries.",
    };
  }

  // 2. Query direct route (without detour) to calculate duration/distance deltas
  let directDurationS = 0;
  let directDistanceM = 0;
  try {
    const directUrl = `${baseUrl}/route/v1/driving/${currentLocation[0]},${currentLocation[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
    const directRes = await fetchFn(directUrl, { headers: { Accept: "application/json" } });
    if (directRes.ok) {
      const directData = (await directRes.json()) as RawOsrmResponse;
      if (directData.code === "Ok" && directData.routes && directData.routes.length > 0) {
        directDurationS = Math.round(directData.routes[0].duration);
        directDistanceM = Math.round(directData.routes[0].distance);
      }
    }
  } catch {
    // Continue even if direct route baseline lookup fails
  }

  // 3. Snap candidate waypoints to drivable road network and prune duplicates across all bearings
  const snappedNodes: SnappedRoadNode[] = [];
  const snappedCoordKeys = new Set<string>();

  for (const raw of rawWaypoints) {
    const snapped = await snapToRoadNetwork(raw, fetchFn, baseUrl);
    if (!snapped) continue;

    // Verify snapped node itself is not inside the exclusion zone
    const distToObstacle = haversineDistanceM(snapped.coordinate, blockedIncident.point);
    if (distToObstacle < exclusionRadiusM) {
      continue;
    }

    const key = `${snapped.coordinate[0].toFixed(3)},${snapped.coordinate[1].toFixed(3)}`;
    if (!snappedCoordKeys.has(key)) {
      snappedCoordKeys.add(key);
      snappedNodes.push(snapped);
    }

    if (snappedNodes.length >= 16) break; // Gather a diverse set of road candidates across all compass directions
  }

  if (snappedNodes.length === 0) {
    return {
      ok: false,
      error: "No navigable road detour found around this incident. Travel delay advised.",
    };
  }

  // 4. For each snapped road node, query 2-leg route: Commuter -> Waypoint -> Destination
  type CandidateDetour = {
    waypoint: SnappedRoadNode;
    distance_m: number;
    duration_s: number;
    coordinates: Coordinate[];
    minDistanceToObstacleM: number;
    otherIncidentWarnings: RouteIncidentWarning[];
    score: number;
  };

  const validDetours: CandidateDetour[] = [];

  for (const node of snappedNodes) {
    const multiLegUrl = `${baseUrl}/route/v1/driving/${currentLocation[0]},${currentLocation[1]};${node.coordinate[0]},${node.coordinate[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;

    try {
      const res = await fetchFn(multiLegUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;

      const data = (await res.json()) as RawOsrmResponse;
      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) continue;

      const primary = data.routes[0];
      const coords = primary.geometry.coordinates as Coordinate[];

      // Critical Check: Does the generated polyline maintain exclusion radius from blocked incident?
      const clearance = routeClearsObstacle(
        coords,
        blockedIncident.point,
        exclusionRadiusM,
        currentLocation,
        destination
      );
      if (!clearance.clears) {
        // Path clipped through the exclusion zone; reject
        continue;
      }

      // Check against any other verified incidents
      const otherWarnings = findIncidentsOnRoute(coords, otherIncidents, 200);

      // Score: lower is better (prefers shorter duration and fewer secondary hazards)
      const score = primary.duration + (otherWarnings.length * 600);

      validDetours.push({
        waypoint: node,
        distance_m: Math.round(primary.distance),
        duration_s: Math.round(primary.duration),
        coordinates: coords,
        minDistanceToObstacleM: clearance.minDistanceM,
        otherIncidentWarnings: otherWarnings,
        score,
      });
    } catch {
      // Continue to next candidate
    }
  }

  if (validDetours.length === 0) {
    return {
      ok: false,
      error: "No viable road detour around this blockage clears the exclusion zone. No alternative route exists.",
    };
  }

  // 5. Select best candidate detour
  validDetours.sort((a, b) => a.score - b.score);
  const best = validDetours[0];

  const extraDurationSeconds = directDurationS > 0
    ? Math.max(0, best.duration_s - directDurationS)
    : 0;
  const extraDistanceMeters = directDistanceM > 0
    ? Math.max(0, best.distance_m - directDistanceM)
    : 0;

  const incidentLabel = blockedIncident.label || blockedIncident.category?.replace(/_/g, " ") || "incident";
  const bypassVia = best.waypoint.streetName ? `via ${best.waypoint.streetName}` : "via alternative road";

  const detourRoute: DetourRouteDetails = {
    id: `detour-${blockedIncident.id}-${Date.now()}`,
    name: `Dynamic Detour ${bypassVia} (avoids ${incidentLabel})`,
    distance_m: best.distance_m,
    duration_s: best.duration_s,
    geometry: {
      type: "LineString",
      coordinates: best.coordinates,
    },
    is_recommended: true,
    avoids_incident: true,
    avoided_incident_reason: `Detour ${bypassVia} completely clears ${incidentLabel} by ${best.minDistanceToObstacleM}m (buffer ${exclusionRadiusM}m)`,
    incidents_on_route: best.otherIncidentWarnings,
    provenance: "estimated",
    bypassWaypoint: best.waypoint.coordinate,
    bypassStreetName: best.waypoint.streetName,
    avoidedIncident: blockedIncident,
    extraDurationSeconds,
    extraDistanceMeters,
    turnCoordinates: best.coordinates,
  };

  return {
    ok: true,
    detourRoute,
  };
}
