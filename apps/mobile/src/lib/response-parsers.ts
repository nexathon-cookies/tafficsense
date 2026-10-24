import type {
  ActiveIncidentsResponse,
  LiveIncident,
  RouteOption,
  RouteResponse,
  SubmitIncidentResponse,
  TrafficSegment,
  TrafficSegmentsResponse,
} from "@trafficsense/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type AuthorityHistoryItem = {
  id: string;
  incident_id: string;
  action: "confirm_incident" | "resolve_incident" | "reject_incident";
  category: string;
  created_at: string;
  details: Record<string, unknown>;
};

export function parseAuthorityHistoryResponse(value: unknown): AuthorityHistoryItem[] {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.history)) {
    throw new Error("Authority service returned an invalid history response.");
  }
  const actions = ["confirm_incident", "resolve_incident", "reject_incident"];
  const items = value.history.filter((item): item is AuthorityHistoryItem =>
    isRecord(item) && typeof item.id === "string" && typeof item.incident_id === "string" &&
    actions.includes(String(item.action)) && typeof item.category === "string" &&
    typeof item.created_at === "string" && Number.isFinite(Date.parse(item.created_at)) && isRecord(item.details));
  if (items.length !== value.history.length) throw new Error("Authority service returned an invalid history response.");
  return items;
}

function parseErrorPayload(value: unknown): { ok: false; error: string } | null {
  if (!isRecord(value) || value.ok !== false || typeof value.error !== "string") return null;
  return { ok: false, error: value.error };
}

export function parseActiveIncidentsResponse(value: unknown): ActiveIncidentsResponse {
  const error = parseErrorPayload(value);
  if (error) return error;
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.incidents)) throw new Error("Traffic service returned an invalid response.");
  const incidents = value.incidents.filter((incident): incident is LiveIncident => {
    if (!isRecord(incident)) return false;
    return typeof incident.id === "string" && typeof incident.category === "string" &&
      typeof incident.lat === "number" && Number.isFinite(incident.lat) &&
      typeof incident.lng === "number" && Number.isFinite(incident.lng) &&
      typeof incident.status === "string" && typeof incident.level === "string" &&
      typeof incident.level_reason === "string" && typeof incident.first_reported_at === "string" &&
      typeof incident.last_confirmed_at === "string" && typeof incident.provenance === "string" &&
      typeof incident.report_count === "number" && Number.isInteger(incident.report_count) && incident.report_count >= 0;
  });
  if (incidents.length !== value.incidents.length) throw new Error("Traffic service returned an invalid response.");
  return { ok: true, incidents };
}

export function parseSubmitIncidentResponse(value: unknown): SubmitIncidentResponse {
  const error = parseErrorPayload(value);
  if (error) return error;
  if (!isRecord(value) || value.ok !== true || typeof value.incident_id !== "string" || typeof value.level !== "string" || typeof value.level_reason !== "string") {
    throw new Error("Traffic service returned an invalid response.");
  }
  return { ok: true, incident_id: value.incident_id, level: value.level, level_reason: value.level_reason,
    ...(typeof value.distinct_reporters === "number" ? { distinct_reporters: value.distinct_reporters } : {}) };
}

export function parseRouteResponse(value: unknown): RouteResponse {
  const error = parseErrorPayload(value);
  if (error) return { ...error, routes: [] };
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.routes)) throw new Error("Route service returned an invalid response.");
  for (const route of value.routes) {
    if (!isRecord(route) || typeof route.id !== "string" || typeof route.name !== "string" ||
        typeof route.distance_m !== "number" || !Number.isFinite(route.distance_m) ||
        typeof route.duration_s !== "number" || !Number.isFinite(route.duration_s) ||
        typeof route.is_recommended !== "boolean" || typeof route.avoids_incident !== "boolean" ||
        route.provenance !== "estimated" || !isRecord(route.geometry) || route.geometry.type !== "LineString" ||
        !Array.isArray(route.geometry.coordinates) || !Array.isArray(route.incidents_on_route)) {
      throw new Error("Route service returned an invalid response.");
    }
  }
  return { ok: true, routes: value.routes as RouteOption[] };
}

const SEVERITIES = ["slowdown", "corroborated", "reported", "clear"] as const;

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function parseTrafficSegmentsResponse(value: unknown): TrafficSegmentsResponse {
  const error = parseErrorPayload(value);
  if (error) return error;
  if (!isRecord(value) || value.ok !== true || typeof value.read_at !== "string" || !Array.isArray(value.segments)) {
    throw new Error("Traffic service returned an invalid response.");
  }
  const segments = value.segments.filter((segment): segment is TrafficSegment => {
    if (!isRecord(segment) || !isRecord(segment.geometry)) return false;
    return typeof segment.id === "string" && typeof segment.name === "string" && typeof segment.direction === "string" &&
      (SEVERITIES as readonly unknown[]).includes(segment.severity) && segment.provenance === "simulated" &&
      segment.geometry.type === "LineString" && Array.isArray(segment.geometry.coordinates) &&
      segment.geometry.coordinates.length >= 2 && segment.geometry.coordinates.every(isCoordinate);
  });
  if (segments.length !== value.segments.length) throw new Error("Traffic service returned an invalid response.");
  return { ok: true, read_at: value.read_at, segments };
}
