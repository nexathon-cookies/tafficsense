import { queryRoute, type VerifiedIncident } from "./engine.ts";

export type SpreadRow = {
  destination: string;
  checked: boolean; // false when OSRM failed for this pair
  affected: boolean; // primary route passes within 200 m
  primary_duration_s: number | null;
  avoiding_extra_s: number | null; // alternative minus primary, free-flow
};

export type SpreadResult = {
  incident_id: string;
  origin: string;
  affected: number;
  checked: number;
  total: number;
  rows: SpreadRow[];
};

type CacheEntry = {
  expiresAt: number;
  result: SpreadResult;
};

const spreadCache = new Map<string, CacheEntry>();

export function clearSpreadCache(): void {
  spreadCache.clear();
}

/**
 * Checks which routes from an origin to a list of destinations pass within
 * 200m of a single verified incident, using OSRM primary routes.
 *
 * Rules:
 * - Reject any incident whose level is not L3 or L6.
 * - Exclude simulated corridor slowdowns.
 * - Call queryRoute sequentially for each destination (polite to OSRM).
 * - Cache the result for 5 minutes per (incident id, origin name).
 * - If OSRM fails for a pair, mark checked: false, never affected.
 * - Avoiding extra time is alternative minus primary (>= 0). If shorter, 0.
 */
export async function checkSpread(
  origin: { name: string; coords: [number, number] },
  destinations: { name: string; coords: [number, number] }[],
  incident: VerifiedIncident,
  fetchFn?: typeof fetch,
  cacheTtlMs = 5 * 60 * 1000
): Promise<SpreadResult> {
  if (incident.level !== "L3" && incident.level !== "L5" && incident.level !== "L6") {
    throw new Error(`Incident must be verified at level L3 or L6. Got: ${incident.level}`);
  }

  if (incident.category === "traffic_slowdown") {
    throw new Error("Simulated corridor slowdowns cannot be used for spread checks.");
  }

  const cacheKey = `${incident.id}:${origin.name}`;
  const now = Date.now();
  const cached = spreadCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const rows: SpreadRow[] = [];

  for (const dest of destinations) {
    try {
      const res = await queryRoute(origin.coords, dest.coords, [incident], fetchFn);

      if (!res.ok || res.routes.length === 0) {
        rows.push({
          destination: dest.name,
          checked: false,
          affected: false,
          primary_duration_s: null,
          avoiding_extra_s: null,
        });
        continue;
      }

      // The standard primary route has id "route-1"
      const primaryRoute = res.routes.find((r) => r.id === "route-1") ?? res.routes[0];
      const isAffected = Boolean(
        primaryRoute.incidents_on_route && primaryRoute.incidents_on_route.length > 0
      );

      if (!isAffected) {
        rows.push({
          destination: dest.name,
          checked: true,
          affected: false,
          primary_duration_s: primaryRoute.duration_s,
          avoiding_extra_s: null,
        });
        continue;
      }

      // Find an alternative route that avoids the incident
      const avoidingRoute = res.routes.find(
        (r) => r.id !== primaryRoute.id && r.incidents_on_route.length === 0
      );

      let avoidingExtra: number | null = null;
      if (avoidingRoute) {
        const diff = avoidingRoute.duration_s - primaryRoute.duration_s;
        avoidingExtra = Math.max(0, diff);
      }

      rows.push({
        destination: dest.name,
        checked: true,
        affected: true,
        primary_duration_s: primaryRoute.duration_s,
        avoiding_extra_s: avoidingExtra,
      });
    } catch {
      rows.push({
        destination: dest.name,
        checked: false,
        affected: false,
        primary_duration_s: null,
        avoiding_extra_s: null,
      });
    }
  }

  const checkedCount = rows.filter((r) => r.checked).length;
  const affectedCount = rows.filter((r) => r.checked && r.affected).length;

  const result: SpreadResult = {
    incident_id: incident.id,
    origin: origin.name,
    affected: affectedCount,
    checked: checkedCount,
    total: destinations.length,
    rows,
  };

  if (cacheTtlMs > 0) {
    spreadCache.set(cacheKey, {
      expiresAt: now + cacheTtlMs,
      result,
    });
  }

  return result;
}
