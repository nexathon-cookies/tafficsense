import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import MapView, { Marker, Polyline, UrlTile, type LatLng, type Region } from "react-native-maps";
import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";
import { INCIDENT_COLOUR, ROUTE_COLOURS, SEVERITY_COLOURS } from "../map/map-data";
import { Card, Icon, SimulatedBadge } from "./ui";
import { SchematicMap } from "./schematic-map";
import { colors, minTouchTarget, radius, space, typography } from "../theme/tokens";

type Props = {
  segments: TrafficSegment[];
  incidents: LiveIncident[];
  routes?: RouteOption[];
  alternativeId?: string | null;
  selectedIncidentId: string | null;
  selectedRouteId?: string | null;
  onSelectIncident: (id: string) => void;
  onSelectRoute?: (id: string) => void;
  // Increment to refit the view to the data (for example after a refresh or a new route).
  fitKey: number;
};

type Coordinate = [number, number];
type ViewMode = "street" | "schematic";

// Centre of Mangaluru, used before any data arrives.
const MANGALURU_REGION: Region = {
  latitude: 12.87,
  longitude: 74.84,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
};

const INACTIVE_ROUTE_COLOUR = "#8a9a92";
const FIT_PADDING = { top: 40, right: 40, bottom: 40, left: 40 };

function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

// GeoJSON stores [longitude, latitude]; react-native-maps expects { latitude, longitude }.
function toLatLng([longitude, latitude]: Coordinate): LatLng {
  return { latitude, longitude };
}

function lineCoordinates(coordinates: unknown[]): LatLng[] {
  return coordinates.filter(validCoordinate).map(toLatLng);
}

function humanise(category: string): string {
  return category.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function routeColour(route: RouteOption, selectedRouteId: string | null | undefined, alternativeId: string | null | undefined): string {
  if (route.id === alternativeId) return ROUTE_COLOURS.alternative;
  const isSelected = selectedRouteId ? route.id === selectedRouteId : route.is_recommended;
  return isSelected ? ROUTE_COLOURS.primary : INACTIVE_ROUTE_COLOUR;
}

type CanvasProps = {
  mapRef: RefObject<MapView | null>;
  style: StyleProp<ViewStyle>;
  segments: TrafficSegment[];
  incidents: LiveIncident[];
  routes?: RouteOption[];
  alternativeId?: string | null;
  selectedRouteId?: string | null;
  selectedIncidentId: string | null;
  you: LatLng | null;
  onReady: () => void;
  onSelectIncident: (id: string) => void;
  onSelectRoute?: (id: string) => void;
};

function MapCanvas({
  mapRef,
  style,
  segments,
  incidents,
  routes,
  alternativeId,
  selectedRouteId,
  selectedIncidentId,
  you,
  onReady,
  onSelectIncident,
  onSelectRoute,
}: CanvasProps) {
  return (
    <MapView
      ref={mapRef}
      style={style}
      initialRegion={MANGALURU_REGION}
      onMapReady={onReady}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      accessibilityLabel="Traffic map showing community reports, corridor segments and routes on OpenStreetMap"
    >
      {/* OpenStreetMap Tile Layer SDK */}
      <UrlTile
        urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maximumZ={19}
        flipY={false}
        zIndex={-1}
      />

      {/* Corridor segments, coloured by the server-provided severity (simulated data). */}
      {segments.map((segment) => {
        const coordinates = lineCoordinates(segment.geometry.coordinates);
        if (coordinates.length < 2) return null;
        return (
          <Polyline
            key={`segment-${segment.id}`}
            coordinates={coordinates}
            strokeColor={SEVERITY_COLOURS[segment.severity]}
            strokeWidth={5}
          />
        );
      })}

      {/* Routes: selected in teal, a chosen alternative in violet, others muted. */}
      {(routes ?? []).map((route) => {
        const coordinates = lineCoordinates(route.geometry.coordinates);
        if (coordinates.length < 2) return null;
        const colour = routeColour(route, selectedRouteId, alternativeId);
        const emphasised = colour !== INACTIVE_ROUTE_COLOUR;
        return (
          <Polyline
            key={`route-${route.id}`}
            coordinates={coordinates}
            strokeColor={colour}
            strokeWidth={emphasised ? 7 : 4}
            tappable
            onPress={() => onSelectRoute?.(route.id)}
          />
        );
      })}

      {/* Community reports. Each is a tap target that opens the details panel below the map. */}
      {incidents.map((incident) => (
        <Marker
          key={incident.id}
          coordinate={{ latitude: incident.lat, longitude: incident.lng }}
          title={humanise(incident.category)}
          description={incident.level_reason}
          pinColor={INCIDENT_COLOUR}
          opacity={incident.id === selectedIncidentId ? 1 : 0.85}
          onPress={() => onSelectIncident(incident.id)}
        />
      ))}

      {you ? <Marker coordinate={you} title="You are here" pinColor="#2563eb" /> : null}
    </MapView>
  );
}

export function TrafficMap(props: Props) {
  const [mode, setMode] = useState<ViewMode>("street");
  const [fullScreen, setFullScreen] = useState(false);
  const [you, setYou] = useState<LatLng | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const modalMapRef = useRef<MapView>(null);
  const pointsRef = useRef<LatLng[]>([]);

  // Every point the view should include when fitting: corridor, routes and reports.
  const allPoints = useMemo<LatLng[]>(() => {
    const points: LatLng[] = [];
    props.segments.forEach((segment) => points.push(...lineCoordinates(segment.geometry.coordinates)));
    (props.routes ?? []).forEach((route) => points.push(...lineCoordinates(route.geometry.coordinates)));
    props.incidents.forEach((incident) => points.push({ latitude: incident.lat, longitude: incident.lng }));
    return points;
  }, [props.segments, props.routes, props.incidents]);

  useEffect(() => {
    pointsRef.current = allPoints;
  }, [allPoints]);

  // Fit only when the parent asks (fitKey), so refreshing data does not move the user's view.
  useEffect(() => {
    const target = fullScreen ? modalMapRef.current : mapRef.current;
    const points = pointsRef.current;
    if (!target || points.length === 0) return;
    target.fitToCoordinates(points, { edgePadding: FIT_PADDING, animated: true });
  }, [props.fitKey, fullScreen]);

  function fitNow() {
    const target = fullScreen ? modalMapRef.current : mapRef.current;
    const points = pointsRef.current;
    if (target && points.length > 0) target.fitToCoordinates(points, { edgePadding: FIT_PADDING, animated: true });
  }

  async function centreOnMe() {
    setLocationNote(null);
    // Location is requested only after this explicit tap, stays on the phone, and is never sent to the server.
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      setLocationNote("Location permission is off. The map still works without it.");
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setYou(point);
      (fullScreen ? modalMapRef.current : mapRef.current)?.animateToRegion(
        { ...point, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } catch {
      setLocationNote("Your location could not be read right now.");
    }
  }

  const selectedIncident = props.incidents.find((incident) => incident.id === props.selectedIncidentId) ?? null;

  const schematic = (
    <SchematicMap
      segments={props.segments}
      routes={props.routes}
      selectedRouteId={props.selectedRouteId ?? null}
      alternativeId={props.alternativeId ?? null}
      incidents={props.incidents}
      selectedIncidentId={props.selectedIncidentId}
      onSelectIncident={props.onSelectIncident}
    />
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.mapFrame}>
        {mode === "street" ? (
          <MapCanvas
            mapRef={mapRef}
            style={styles.canvas}
            segments={props.segments}
            incidents={props.incidents}
            routes={props.routes}
            alternativeId={props.alternativeId}
            selectedRouteId={props.selectedRouteId}
            selectedIncidentId={props.selectedIncidentId}
            you={you}
            onReady={fitNow}
            onSelectIncident={props.onSelectIncident}
            onSelectRoute={props.onSelectRoute}
          />
        ) : (
          schematic
        )}
      </View>

      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fit map to all reports and corridors" onPress={fitNow} style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}>
          <Icon name="crop_free" size={16} color={colors.primary} />
          <Text style={styles.toolText}>Fit map</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={you ? "Update my location on map" : "Show my location on map"} onPress={() => void centreOnMe()} style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}>
          <Icon name="my_location" size={16} color={colors.primary} />
          <Text style={styles.toolText}>{you ? "Update location" : "Show my location"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === "street" ? "Switch to schematic view" : "Switch to street map"}
          onPress={() => setMode((current) => (current === "street" ? "schematic" : "street"))}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
        >
          <Icon name="layers" size={16} color={colors.primary} />
          <Text style={styles.toolText}>{mode === "street" ? "Schematic view" : "Street map"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open full-screen map" onPress={() => setFullScreen(true)} style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}>
          <Icon name="fullscreen" size={16} color={colors.primary} />
          <Text style={styles.toolText}>Full screen</Text>
        </Pressable>
      </View>

      {locationNote ? <Text style={styles.notice}>{locationNote}</Text> : null}

      {props.incidents.length === 0 ? (
        <Text style={styles.notice}>No community reports in the last 3 hours.</Text>
      ) : null}

      {selectedIncident ? (
        <Card style={styles.detailsCard} accessibilityLiveRegion="polite">
          <Text style={styles.detailsEyebrow}>COMMUNITY REPORT</Text>
          <Text style={styles.detailsTitle}>{humanise(selectedIncident.category)}</Text>
          <Text style={styles.detailsText}>
            {selectedIncident.report_count} {selectedIncident.report_count === 1 ? "person has" : "people have"} reported this. {selectedIncident.level_reason}
          </Text>
          <Text style={styles.detailsText}>This is a reported observation, not a measured delay.</Text>
        </Card>
      ) : null}

      {props.routes?.length || props.incidents.length || props.segments.length ? (
        <View style={styles.legend} accessibilityLabel="Map legend">
          {props.routes?.length ? <LegendItem colour={ROUTE_COLOURS.primary} label="Recommended route" /> : null}
          {props.routes && props.routes.length > 1 ? <LegendItem colour={ROUTE_COLOURS.alternative} label="Your alternative" /> : null}
          {props.incidents.length ? <LegendItem colour={INCIDENT_COLOUR} label="Community report" /> : null}
          {props.segments.some((segment) => segment.severity === "slowdown") ? <LegendItem colour={SEVERITY_COLOURS.slowdown} label="Corridor slowdown" /> : null}
          {props.segments.some((segment) => segment.severity === "clear") ? <LegendItem colour={SEVERITY_COLOURS.clear} label="Clear flow" /> : null}
        </View>
      ) : null}

      <View style={styles.attributionRow}>
        <Text style={styles.attribution}>Map data © OpenStreetMap contributors. Corridor lines are SIMULATED.</Text>
        <SimulatedBadge label="SIMULATED" />
      </View>

      <Modal visible={fullScreen} animationType="slide" onRequestClose={() => setFullScreen(false)}>
        <View style={styles.fullScreenModal}>
          <View style={styles.fullScreenHeader}>
            <View style={styles.flexOne}>
              <Text style={styles.detailsTitle}>{mode === "street" ? "Full-screen map" : "Full-screen schematic"}</Text>
              <Text style={styles.detailsText}>{mode === "street" ? "Reports and routes on the street map." : "Reports and routes only; not street navigation."}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close full-screen map" onPress={() => setFullScreen(false)} style={styles.closeButton}>
              <Icon name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          {mode === "street" ? (
            <MapCanvas
              mapRef={modalMapRef}
              style={styles.flexOne}
              segments={props.segments}
              incidents={props.incidents}
              routes={props.routes}
              alternativeId={props.alternativeId}
              selectedRouteId={props.selectedRouteId}
              selectedIncidentId={props.selectedIncidentId}
              you={you}
              onReady={fitNow}
              onSelectIncident={props.onSelectIncident}
              onSelectRoute={props.onSelectRoute}
            />
          ) : (
            <SchematicMap
              segments={props.segments}
              routes={props.routes}
              selectedRouteId={props.selectedRouteId ?? null}
              alternativeId={props.alternativeId ?? null}
              incidents={props.incidents}
              selectedIncidentId={props.selectedIncidentId}
              onSelectIncident={props.onSelectIncident}
              fullScreen
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function LegendItem({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: colour }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs },
  mapFrame: {
    height: 360,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceContainerLow,
  },
  canvas: { flex: 1 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  toolButton: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  toolText: { ...typography.bodySm, color: colors.primary, fontWeight: "600" },
  notice: { ...typography.bodySm, color: colors.textSecondary },
  detailsCard: { gap: space.xs },
  detailsEyebrow: { ...typography.labelSm, color: colors.error, letterSpacing: 0.6 },
  detailsTitle: { ...typography.titleSm, color: colors.text },
  detailsText: { ...typography.bodySm, color: colors.textSecondary },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { ...typography.labelSm, color: colors.textSecondary },
  attributionRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs },
  attribution: { ...typography.labelSm, color: colors.textMuted, flexShrink: 1 },
  fullScreenModal: { flex: 1, backgroundColor: colors.background },
  fullScreenHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: colors.surface },
  closeButton: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: "center", justifyContent: "center" },
  flexOne: { flex: 1 },
});