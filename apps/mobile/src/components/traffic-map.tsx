import * as Location from "expo-location";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";
import { INCIDENT_COLOUR, ROUTE_COLOURS, SEVERITY_COLOURS } from "../map/map-data";
import { OpenStreetMap } from "./open-street-map";
import { Card, Icon, SimulatedBadge } from "./ui";
import { SchematicMap } from "./schematic-map";
import { colors, minTouchTarget, radius, shadows, space, typography } from "../theme/tokens";

type Props = {
  /** Fill the available page area instead of rendering a compact planner map. */
  fillContainer?: boolean;
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

function humanise(category: string): string {
  return category.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function TrafficMap(props: Props) {
  const fillContainer = props.fillContainer ?? false;
  const [mode, setMode] = useState<ViewMode>("street");
  const [fullScreen, setFullScreen] = useState(false);
  const [you, setYou] = useState<Coordinate | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const [centerKey, setCenterKey] = useState(0);

  function fitNow() {
    setFitRequestKey((key) => key + 1);
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
      setYou([position.coords.longitude, position.coords.latitude]);
      setCenterKey((key) => key + 1);
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
    <View style={[styles.wrapper, fillContainer && styles.fillWrapper]}>
      <View style={[styles.mapFrame, fillContainer && styles.fillMapFrame]}>
        {mode === "street" ? (
          <OpenStreetMap
            style={styles.canvas}
            segments={props.segments}
            incidents={props.incidents}
            routes={props.routes}
            alternativeId={props.alternativeId}
            selectedRouteId={props.selectedRouteId}
            selectedIncidentId={props.selectedIncidentId}
            you={you}
            fitKey={props.fitKey + fitRequestKey}
            centerKey={centerKey}
            onSelectIncident={props.onSelectIncident}
            onSelectRoute={props.onSelectRoute}
            onFailure={() => setMode("schematic")}
          />
        ) : (
          schematic
        )}
      </View>

      <View style={[styles.toolbar, fillContainer && styles.fillToolbar]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fit map to all reports and corridors" onPress={fitNow} style={({ pressed }) => [styles.toolButton, fillContainer && styles.fillToolButton, pressed && styles.pressed]}>
          <Icon name="crop_free" size={16} color={colors.primary} />
          {!fillContainer ? <Text style={styles.toolText}>Fit map</Text> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={you ? "Update my location on map" : "Show my location on map"} onPress={() => void centreOnMe()} style={({ pressed }) => [styles.toolButton, fillContainer && styles.fillToolButton, pressed && styles.pressed]}>
          <Icon name="my_location" size={16} color={colors.primary} />
          {!fillContainer ? <Text style={styles.toolText}>{you ? "Update location" : "Show my location"}</Text> : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === "street" ? "Switch to schematic view" : "Switch to street map"}
          onPress={() => setMode((current) => (current === "street" ? "schematic" : "street"))}
          style={({ pressed }) => [styles.toolButton, fillContainer && styles.fillToolButton, pressed && styles.pressed]}
        >
          <Icon name="layers" size={16} color={colors.primary} />
          {!fillContainer ? <Text style={styles.toolText}>{mode === "street" ? "Schematic view" : "Street map"}</Text> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open full-screen map" onPress={() => setFullScreen(true)} style={({ pressed }) => [styles.toolButton, fillContainer && styles.fillToolButton, pressed && styles.pressed]}>
          <Icon name="fullscreen" size={16} color={colors.primary} />
          {!fillContainer ? <Text style={styles.toolText}>Full screen</Text> : null}
        </Pressable>
      </View>

      {locationNote ? <Text style={[styles.notice, fillContainer && styles.fillNotice]}>{locationNote}</Text> : null}

      {props.incidents.length === 0 ? (
        <Text style={[styles.notice, fillContainer && styles.fillEmptyNotice]}>No community reports in the last 3 hours.</Text>
      ) : null}

      {selectedIncident && !fillContainer ? (
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
        <View style={[styles.legend, fillContainer && styles.fillLegend]} accessibilityLabel="Map legend">
          {props.routes?.length ? <LegendItem colour={ROUTE_COLOURS.primary} label="Recommended route" /> : null}
          {props.routes && props.routes.length > 1 ? <LegendItem colour={ROUTE_COLOURS.alternative} label="Your alternative" /> : null}
          {props.incidents.length ? <LegendItem colour={INCIDENT_COLOUR} label="Community report" /> : null}
          {props.segments.some((segment) => segment.severity === "slowdown") ? <LegendItem colour={SEVERITY_COLOURS.slowdown} label="Corridor slowdown" /> : null}
          {props.segments.some((segment) => segment.severity === "clear") ? <LegendItem colour={SEVERITY_COLOURS.clear} label="Clear flow" /> : null}
        </View>
      ) : null}

      <View style={[styles.attributionRow, fillContainer && styles.fillAttributionRow]}>
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
            <OpenStreetMap
              style={styles.flexOne}
              segments={props.segments}
              incidents={props.incidents}
              routes={props.routes}
              alternativeId={props.alternativeId}
              selectedRouteId={props.selectedRouteId}
              selectedIncidentId={props.selectedIncidentId}
              you={you}
              fitKey={props.fitKey + fitRequestKey}
              centerKey={centerKey}
              onSelectIncident={props.onSelectIncident}
              onSelectRoute={props.onSelectRoute}
              onFailure={() => setMode("schematic")}
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
  fillWrapper: { flex: 1, minHeight: 0 },
  mapFrame: {
    height: 360,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceContainerLow,
  },
  fillMapFrame: {
    height: undefined,
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
  },
  canvas: { flex: 1 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fillToolbar: {
    position: "absolute",
    top: space.md,
    right: space.md,
    alignItems: "flex-end",
    flexDirection: "column",
    zIndex: 30,
  },
  fillToolButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    paddingHorizontal: 0,
    justifyContent: "center",
    borderRadius: radius.pill,
    ...shadows.sheet,
  },
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
  fillNotice: {
    position: "absolute",
    top: 232,
    left: space.md,
    right: 76,
    padding: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    zIndex: 30,
  },
  fillEmptyNotice: {
    position: "absolute",
    top: space.md,
    left: space.md,
    right: 76,
    padding: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    zIndex: 20,
  },
  detailsCard: { gap: space.xs },
  detailsEyebrow: { ...typography.labelSm, color: colors.error, letterSpacing: 0.6 },
  detailsTitle: { ...typography.titleSm, color: colors.text },
  detailsText: { ...typography.bodySm, color: colors.textSecondary },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fillLegend: {
    position: "absolute",
    left: space.md,
    bottom: 300,
    zIndex: 30,
    padding: space.xs,
    borderRadius: radius.card,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { ...typography.labelSm, color: colors.textSecondary },
  attributionRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs },
  fillAttributionRow: {
    position: "absolute",
    right: space.sm,
    bottom: 270,
    maxWidth: 230,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    zIndex: 30,
  },
  attribution: { ...typography.labelSm, color: colors.textMuted, flexShrink: 1 },
  fullScreenModal: { flex: 1, backgroundColor: colors.background },
  fullScreenHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: colors.surface },
  closeButton: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: "center", justifyContent: "center" },
  flexOne: { flex: 1 },
});
