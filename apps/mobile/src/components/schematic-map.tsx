import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";
import { colors, radius, space, typography } from "../theme/tokens";
import { SEVERITY_COLOURS, ROUTE_COLOURS } from "../map/map-data";
import {
  polylineBars,
  schematicBounds,
  toFramePixel,
  type SchematicCoordinate,
  type SchematicSize,
} from "../lib/schematic-map";

type Props = {
  incidents: LiveIncident[];
  segments: TrafficSegment[];
  routes?: RouteOption[];
  selectedRouteId?: string | null;
  alternativeId?: string | null;
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  fullScreen?: boolean;
};

const INACTIVE_ROUTE_COLOUR = "#8a9a92";
const INCIDENT_TAP_SIZE = 36;

function validCoordinate(value: unknown): value is SchematicCoordinate {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

function collectCoordinates(segments: TrafficSegment[], routes: RouteOption[] | undefined, incidents: LiveIncident[]): SchematicCoordinate[] {
  return [
    ...segments.flatMap((segment) => segment.geometry.coordinates.filter(validCoordinate)),
    ...(routes ?? []).flatMap((route) => route.geometry.coordinates.filter(validCoordinate)),
    ...incidents.map((incident) => [incident.lng, incident.lat] as SchematicCoordinate).filter(validCoordinate),
  ];
}

function routeColour(route: RouteOption, selectedRouteId: string | null | undefined, alternativeId: string | null | undefined): string {
  if (route.id === alternativeId) return ROUTE_COLOURS.alternative;
  const isSelected = selectedRouteId ? route.id === selectedRouteId : route.is_recommended;
  return isSelected ? ROUTE_COLOURS.primary : INACTIVE_ROUTE_COLOUR;
}

export function SchematicMap({
  incidents,
  segments,
  routes,
  selectedRouteId = null,
  alternativeId = null,
  selectedIncidentId,
  onSelectIncident,
  fullScreen = false,
}: Props) {
  const [size, setSize] = useState<SchematicSize>({ width: 0, height: 0 });
  const points = collectCoordinates(segments, routes, incidents);
  const bounds = schematicBounds(points);
  const hasSize = size.width > 0 && size.height > 0;
  const label = incidents.length === 0 ? "No active community reports" : `${incidents.length} active community report${incidents.length === 1 ? "" : "s"}`;

  return (
    <View
      style={[styles.frame, fullScreen && styles.fullScreenFrame]}
      accessibilityLabel={`Schematic traffic map. ${label}`}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
    >
      <View pointerEvents="none" style={styles.grid}>
        {[20, 40, 60, 80].map((position) => <View key={`v-${position}`} style={[styles.vertical, { left: `${position}%` }]} />)}
        {[20, 40, 60, 80].map((position) => <View key={`h-${position}`} style={[styles.horizontal, { top: `${position}%` }]} />)}
      </View>

      {hasSize ? (
        <>
          {/* Traffic corridor segments, coloured by the server-provided severity. */}
          {segments.flatMap((segment) =>
            polylineBars(segment.geometry.coordinates.filter(validCoordinate), bounds, size).map((bar, index) => (
              <View
                key={`segment-${segment.id}-${index}`}
                pointerEvents="none"
                style={[
                  styles.bar,
                  {
                    width: bar.length,
                    left: bar.centreX - bar.length / 2,
                    top: bar.centreY - 2.5,
                    height: 5,
                    backgroundColor: SEVERITY_COLOURS[segment.severity],
                    transform: [{ rotate: `${bar.angle}deg` }],
                  },
                ]}
              />
            )),
          )}

          {/* Routes: the selected route in teal, a chosen alternative in violet, others muted. */}
          {(routes ?? []).flatMap((route) => {
            const colour = routeColour(route, selectedRouteId, alternativeId);
            const emphasised = colour !== INACTIVE_ROUTE_COLOUR;
            return polylineBars(route.geometry.coordinates.filter(validCoordinate), bounds, size).map((bar, index) => (
              <View
                key={`route-${route.id}-${index}`}
                pointerEvents="none"
                style={[
                  styles.bar,
                  {
                    width: bar.length,
                    left: bar.centreX - bar.length / 2,
                    top: bar.centreY - (emphasised ? 4 : 2.5),
                    height: emphasised ? 8 : 5,
                    backgroundColor: colour,
                    transform: [{ rotate: `${bar.angle}deg` }],
                  },
                ]}
              />
            ));
          })}

          {incidents.map((incident) => {
            const point = toFramePixel([incident.lng, incident.lat], bounds, size);
            const selected = incident.id === selectedIncidentId;
            return (
              <Pressable
                key={incident.id}
                accessibilityRole="button"
                accessibilityLabel={`${incident.category}, ${incident.level}. ${incident.level_reason}`}
                onPress={() => onSelectIncident(incident.id)}
                style={[
                  styles.incident,
                  selected && styles.incidentSelected,
                  { left: point.x - INCIDENT_TAP_SIZE / 2, top: point.y - INCIDENT_TAP_SIZE / 2 },
                ]}
              >
                <View style={styles.incidentCore} />
              </Pressable>
            );
          })}
        </>
      ) : null}

      <View style={styles.routeHint} pointerEvents="none">
        <Text style={styles.routeHintText}>
          {routes?.length ? "Schematic route view · street names are not shown" : "Schematic view · corridor and reports shown without street names"}
        </Text>
      </View>
      <View style={styles.footer} pointerEvents="none">
        <Text style={styles.footerText}>SCHEMATIC · not street navigation</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 250, overflow: "hidden", borderRadius: radius.card, backgroundColor: "#edf3ee", borderWidth: 1, borderColor: colors.border },
  fullScreenFrame: { flex: 1, height: undefined, borderRadius: 0 },
  grid: { ...StyleSheet.absoluteFill },
  vertical: { position: "absolute", top: 0, bottom: 0, borderLeftWidth: 1, borderColor: "#d7e2d8" },
  horizontal: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderColor: "#d7e2d8" },
  bar: { position: "absolute", borderRadius: 3 },
  routeHint: { position: "absolute", top: space.sm, left: space.sm, right: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.9)" },
  routeHintText: { ...typography.bodySm, color: colors.textSecondary, textAlign: "center" },
  incident: { position: "absolute", width: INCIDENT_TAP_SIZE, height: INCIDENT_TAP_SIZE, alignItems: "center", justifyContent: "center", borderRadius: INCIDENT_TAP_SIZE / 2, backgroundColor: "rgba(186,26,26,0.2)" },
  incidentSelected: { backgroundColor: "rgba(186,26,26,0.38)", transform: [{ scale: 1.15 }] },
  incidentCore: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.error, borderWidth: 2, borderColor: colors.surface },
  footer: { position: "absolute", left: space.sm, bottom: space.sm, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.92)" },
  footerText: { ...typography.codeSm, color: colors.primary, fontSize: 10 },
});