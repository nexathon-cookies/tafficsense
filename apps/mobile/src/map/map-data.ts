import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";

// Pure GeoJSON builders shared by the WebView map and the tests.
// Coordinates are GeoJSON [lng, lat]. Colours follow the web map legend.
export const SEVERITY_COLOURS: Record<TrafficSegment["severity"], string> = {
  slowdown: "#ea580c",
  corroborated: "#d97706",
  reported: "#ca8a04",
  clear: "#059669",
};

export const ROUTE_COLOURS = {
  primary: "#005c55",
  alternative: "#6616d7",
} as const;

export const INCIDENT_COLOUR = "#b91c1c";

type Feature<G, P> = { type: "Feature"; properties: P; geometry: G };
type Collection<F> = { type: "FeatureCollection"; features: F[] };

export type SegmentFeatureProperties = { id: string; name: string; severity: TrafficSegment["severity"]; colour: string };
export type RouteFeatureProperties = { id: string; name: string; kind: "primary" | "alternative"; colour: string; selected: boolean };
export type IncidentFeatureProperties = {
  id: string;
  category: string;
  level: LiveIncident["level"];
  selected: boolean;
  onRoute: boolean;
  colour: string;
};

export type MapPayload = {
  segments: Collection<Feature<{ type: "LineString"; coordinates: [number, number][] }, SegmentFeatureProperties>>;
  routes: Collection<Feature<{ type: "LineString"; coordinates: [number, number][] }, RouteFeatureProperties>>;
  incidents: Collection<Feature<{ type: "Point"; coordinates: [number, number] }, IncidentFeatureProperties>>;
  you: { type: "Point"; coordinates: [number, number] } | null;
  fit: boolean;
};

export function segmentCollection(segments: TrafficSegment[]): MapPayload["segments"] {
  return {
    type: "FeatureCollection",
    features: segments.map((segment) => ({
      type: "Feature",
      properties: {
        id: segment.id,
        name: segment.name,
        severity: segment.severity,
        colour: SEVERITY_COLOURS[segment.severity],
      },
      geometry: { type: "LineString", coordinates: segment.geometry.coordinates },
    })),
  };
}

// Only the primary route is always drawn. The alternative is drawn only when the commuter chose it.
export function routeCollection(
  routes: RouteOption[],
  options: { alternativeId: string | null; selectedId: string | null },
): MapPayload["routes"] {
  const primary = routes.find((route) => route.is_recommended) ?? routes[0];
  const drawn = routes.filter((route) => route.id === primary?.id || route.id === options.alternativeId);
  return {
    type: "FeatureCollection",
    features: drawn.map((route) => {
      const kind: RouteFeatureProperties["kind"] = route.id === primary?.id ? "primary" : "alternative";
      return {
        type: "Feature",
        properties: {
          id: route.id,
          name: route.name,
          kind,
          colour: ROUTE_COLOURS[kind],
          selected: route.id === options.selectedId,
        },
        geometry: { type: "LineString", coordinates: route.geometry.coordinates },
      };
    }),
  };
}

export function incidentCollection(
  incidents: LiveIncident[],
  options: { selectedId: string | null; routeIncidentIds?: ReadonlySet<string> },
): MapPayload["incidents"] {
  return {
    type: "FeatureCollection",
    features: incidents
      .filter((incident) => Number.isFinite(incident.lat) && Number.isFinite(incident.lng))
      .map((incident) => ({
        type: "Feature",
        properties: {
          id: incident.id,
          category: incident.category,
          level: incident.level,
          selected: incident.id === options.selectedId,
          onRoute: options.routeIncidentIds?.has(incident.id) ?? false,
          colour: INCIDENT_COLOUR,
        },
        geometry: { type: "Point", coordinates: [incident.lng, incident.lat] },
      })),
  };
}

export function buildMapPayload(input: {
  segments?: TrafficSegment[];
  incidents?: LiveIncident[];
  routes?: RouteOption[];
  selectedIncidentId?: string | null;
  selectedRouteId?: string | null;
  alternativeId?: string | null;
  you?: [number, number] | null;
  fit: boolean;
}): MapPayload {
  const routeIncidentIds = new Set(
    (input.routes ?? []).flatMap((route) => route.incidents_on_route.map((warning) => warning.id)),
  );
  return {
    segments: segmentCollection(input.segments ?? []),
    routes: routeCollection(input.routes ?? [], {
      alternativeId: input.alternativeId ?? null,
      selectedId: input.selectedRouteId ?? null,
    }),
    incidents: incidentCollection(input.incidents ?? [], {
      selectedId: input.selectedIncidentId ?? null,
      routeIncidentIds,
    }),
    you: input.you ? { type: "Point", coordinates: input.you } : null,
    fit: input.fit,
  };
}
