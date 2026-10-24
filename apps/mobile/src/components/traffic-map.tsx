import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";
import { buildMapPayload, INCIDENT_COLOUR, ROUTE_COLOURS, SEVERITY_COLOURS, type MapPayload } from "../map/map-data";
import { buildMapHtml } from "../map/map-html";
import { Card, Icon, SimulatedBadge } from "./ui";
import { SchematicMap } from "./schematic-map";
import { colors, minTouchTarget, radius, shadows, space, typography } from "../theme/tokens";

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
  // Full-screen and floating layout enhancements
  fullScreen?: boolean;
  floatingControls?: boolean;
  hideDetailsCard?: boolean;
  hideLegend?: boolean;
  hideAttribution?: boolean;
  mapHeight?: number;
  onOpenFullScreen?: () => void;
  floatingTopOffset?: number;
};

type ViewMode = "street" | "schematic";
const MAP_HTML = buildMapHtml();

function humanise(category: string): string {
  return category.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

type CanvasProps = {
  payload: MapPayload;
  fitKey: number;
  style: StyleProp<ViewStyle>;
  onReady: () => void;
  onFailure: (reason: string) => void;
  onMapIssue: () => void;
  onSelectIncident: (id: string) => void;
  onSelectRoute?: (id: string) => void;
};

function MapCanvas({ payload, fitKey, style, onReady, onFailure, onMapIssue, onSelectIncident, onSelectRoute }: CanvasProps) {
  const webViewRef = useRef<WebView>(null);
  const lastFitKey = useRef<number | null>(null);
  const lastYou = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const shouldFit = lastFitKey.current !== fitKey;
    const next = { ...payload, fit: shouldFit };
    if (shouldFit) lastFitKey.current = fitKey;
    webViewRef.current?.injectJavaScript(`window.trafficMap?.setData(${JSON.stringify(next)}); true;`);
  }, [payload, fitKey, ready]);

  useEffect(() => {
    const coordinates = payload.you?.coordinates;
    if (!ready || !coordinates) return;
    const key = coordinates.join(",");
    if (key === lastYou.current) return;
    lastYou.current = key;
    webViewRef.current?.injectJavaScript(`window.trafficMap?.centerOn(${JSON.stringify(coordinates)}); true;`);
  }, [payload.you, ready]);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; id?: string; reason?: string };
      if (message.type === "ready") {
        setReady(true);
        onReady();
      } else if (message.type === "failed") {
        onFailure(message.reason ?? "renderer");
      } else if (message.type === "map-error") {
        onMapIssue();
      } else if (message.type === "select-incident" && message.id) {
        onSelectIncident(message.id);
      } else if (message.type === "select-route" && message.id) {
        onSelectRoute?.(message.id);
      }
    } catch {
      onFailure("message");
    }
  }

  return (
    <WebView
      ref={webViewRef}
      style={style}
      source={{ html: MAP_HTML }}
      originWhitelist={["*"]}
      userAgent="TrafficSenseMobile/0.1 (OpenStreetMap tile client)"
      cacheEnabled
      javaScriptEnabled
      domStorageEnabled
      onMessage={handleMessage}
      onError={() => onFailure("webview")}
      onHttpError={() => onFailure("network")}
      accessibilityLabel="Interactive OpenStreetMap traffic map"
    />
  );
}

export function TrafficMap(props: Props) {
  const [mode, setMode] = useState<ViewMode>("street");
  const [fullScreenModal, setFullScreenModal] = useState(false);
  const [you, setYou] = useState<[number, number] | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const fitKey = props.fitKey + fitRequest;
  const payload = useMemo(() => buildMapPayload({
    segments: props.segments,
    incidents: props.incidents,
    routes: props.routes,
    selectedIncidentId: props.selectedIncidentId,
    selectedRouteId: props.selectedRouteId,
    alternativeId: props.alternativeId,
    you,
    fit: false,
  }), [props.segments, props.incidents, props.routes, props.selectedIncidentId, props.selectedRouteId, props.alternativeId, you]);

  useEffect(() => {
    if (mode !== "street" || !mapLoading) return;
    const timeout = setTimeout(() => {
      setMapLoading(false);
      setMapNote("OpenStreetMap is taking too long to load. Showing the traffic schematic.");
      setMode("schematic");
    }, 15000);
    return () => clearTimeout(timeout);
  }, [mode, mapLoading]);

  function fitNow() {
    setFitRequest((value) => value + 1);
  }

  function toggleMapMode() {
    if (mode === "street") {
      setMode("schematic");
      return;
    }
    setMapNote(null);
    setMapLoading(true);
    setMode("street");
  }

  async function centreOnMe() {
    setLocationNote(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      setLocationNote("Location permission is off. The map still works without it.");
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point: [number, number] = [position.coords.longitude, position.coords.latitude];
      setYou(point);
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
      fullScreen={props.fullScreen}
    />
  );

  const isFull = Boolean(props.fullScreen);
  const showFloatingControls = props.floatingControls ?? isFull;

  return (
    <View style={[styles.wrapper, isFull && styles.fullScreenWrapper]}>
      <View
        style={[
          styles.mapFrame,
          isFull ? styles.mapFrameFullScreen : { height: props.mapHeight ?? 360 },
        ]}
      >
        {mode === "street" ? (
          <MapCanvas
            payload={payload}
            fitKey={fitKey}
            style={styles.canvas}
            onReady={() => setMapLoading(false)}
            onFailure={(reason) => {
              setMapLoading(false);
              setMapNote(`Street map could not start (${reason}). Showing the traffic schematic.`);
              setMode("schematic");
            }}
            onMapIssue={() => {
              setMapLoading(false);
              setMapNote("OpenStreetMap tiles are unavailable. Showing the traffic schematic.");
              setMode("schematic");
            }}
            onSelectIncident={props.onSelectIncident}
            onSelectRoute={props.onSelectRoute}
          />
        ) : (
          schematic
        )}

        {mapLoading && mode === "street" ? (
          <View style={styles.mapLoadingOverlay} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.mapLoadingText}>Loading OpenStreetMap…</Text>
          </View>
        ) : null}

        {/* Floating Controls Overlay (Google Maps Style) */}
        {showFloatingControls ? (
          <View style={[styles.floatingControlsStack, props.floatingTopOffset !== undefined && { top: props.floatingTopOffset }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={you ? "Update my location on map" : "Show my location on map"}
              onPress={() => void centreOnMe()}
              style={({ pressed }) => [styles.floatingFab, pressed && styles.floatingFabPressed]}
            >
              <Icon name="my_location" size={20} color={colors.primary} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fit map to all reports and corridors"
              onPress={fitNow}
              style={({ pressed }) => [styles.floatingFab, pressed && styles.floatingFabPressed]}
            >
              <Icon name="crop_free" size={20} color={colors.primary} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === "street" ? "Switch to schematic view" : "Switch to street map"}
              onPress={toggleMapMode}
              style={({ pressed }) => [styles.floatingFab, pressed && styles.floatingFabPressed]}
            >
              <Icon name="layers" size={20} color={colors.primary} />
            </Pressable>

            {!isFull ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open full-screen map"
                onPress={props.onOpenFullScreen ?? (() => setFullScreenModal(true))}
                style={({ pressed }) => [styles.floatingFab, pressed && styles.floatingFabPressed]}
              >
                <Icon name="fullscreen" size={20} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Floating Notification / Info Banner */}
        {locationNote || mapNote ? (
          <View style={styles.floatingNoteToast}>
            <Icon name="help_center" size={14} color={colors.primary} />
            <Text style={styles.floatingNoteText}>{locationNote || mapNote}</Text>
          </View>
        ) : null}

        {/* Floating Mini Legend if requested */}
        {!props.hideLegend && isFull && (props.routes?.length || props.incidents.length || props.segments.length) ? (
          <View style={styles.floatingLegend} accessibilityLabel="Map legend">
            {props.routes?.length ? <LegendItem colour={ROUTE_COLOURS.primary} label="Route" /> : null}
            {props.routes && props.routes.length > 1 ? <LegendItem colour={ROUTE_COLOURS.alternative} label="Alt" /> : null}
            {props.incidents.length ? <LegendItem colour={INCIDENT_COLOUR} label="Report" /> : null}
            {props.segments.some((segment) => segment.severity === "slowdown") ? <LegendItem colour={SEVERITY_COLOURS.slowdown} label="Slow" /> : null}
          </View>
        ) : null}
      </View>

      {/* Legacy bottom toolbar when not using floating controls */}
      {!showFloatingControls ? (
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
            onPress={toggleMapMode}
            style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
          >
            <Icon name="layers" size={16} color={colors.primary} />
            <Text style={styles.toolText}>{mode === "street" ? "Schematic view" : "Street map"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open full-screen map" onPress={props.onOpenFullScreen ?? (() => setFullScreenModal(true))} style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}>
            <Icon name="fullscreen" size={16} color={colors.primary} />
            <Text style={styles.toolText}>Full screen</Text>
          </Pressable>
        </View>
      ) : null}

      {!showFloatingControls && locationNote ? <Text style={styles.notice}>{locationNote}</Text> : null}
      {!showFloatingControls && mapNote ? <Text style={styles.notice}>{mapNote}</Text> : null}

      {!isFull && props.incidents.length === 0 ? (
        <Text style={styles.notice}>No community reports in the last 3 hours.</Text>
      ) : null}

      {!props.hideDetailsCard && selectedIncident ? (
        <Card style={styles.detailsCard} accessibilityLiveRegion="polite">
          <Text style={styles.detailsEyebrow}>COMMUNITY REPORT</Text>
          <Text style={styles.detailsTitle}>{humanise(selectedIncident.category)}</Text>
          <Text style={styles.detailsText}>
            {selectedIncident.report_count} {selectedIncident.report_count === 1 ? "person has" : "people have"} reported this. {selectedIncident.level_reason}
          </Text>
          <Text style={styles.detailsText}>This is a reported observation, not a measured delay.</Text>
        </Card>
      ) : null}

      {!props.hideLegend && !isFull && (props.routes?.length || props.incidents.length || props.segments.length) ? (
        <View style={styles.legend} accessibilityLabel="Map legend">
          {props.routes?.length ? <LegendItem colour={ROUTE_COLOURS.primary} label="Recommended route" /> : null}
          {props.routes && props.routes.length > 1 ? <LegendItem colour={ROUTE_COLOURS.alternative} label="Your alternative" /> : null}
          {props.incidents.length ? <LegendItem colour={INCIDENT_COLOUR} label="Community report" /> : null}
          {props.segments.some((segment) => segment.severity === "slowdown") ? <LegendItem colour={SEVERITY_COLOURS.slowdown} label="Corridor slowdown" /> : null}
          {props.segments.some((segment) => segment.severity === "clear") ? <LegendItem colour={SEVERITY_COLOURS.clear} label="Clear flow" /> : null}
        </View>
      ) : null}

      {!props.hideAttribution && !isFull ? (
        <View style={styles.attributionRow}>
          <Text style={styles.attribution}>Map data © OpenStreetMap contributors. Corridor lines are SIMULATED.</Text>
          <SimulatedBadge label="SIMULATED" />
        </View>
      ) : null}

      <Modal visible={fullScreenModal} animationType="slide" onRequestClose={() => setFullScreenModal(false)}>
        <View style={styles.fullScreenModal}>
          <View style={styles.fullScreenHeader}>
            <View style={styles.flexOne}>
              <Text style={styles.detailsTitle}>{mode === "street" ? "Full-screen map" : "Full-screen schematic"}</Text>
              <Text style={styles.detailsText}>{mode === "street" ? "Reports and routes on the street map." : "Reports and routes only; not street navigation."}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close full-screen map" onPress={() => setFullScreenModal(false)} style={styles.closeButton}>
              <Icon name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          {mode === "street" ? (
            <MapCanvas
              payload={payload}
              fitKey={fitKey}
              style={styles.flexOne}
              onReady={() => setMapLoading(false)}
              onFailure={(reason) => {
                setMapLoading(false);
                setMapNote(`Street map could not start (${reason}). Showing the traffic schematic.`);
                setMode("schematic");
                setFullScreenModal(false);
              }}
              onMapIssue={() => {
                setMapLoading(false);
                setMapNote("OpenStreetMap tiles are unavailable. Showing the traffic schematic.");
                setMode("schematic");
              }}
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
  wrapper: {
    gap: space.xs,
    position: "relative",
  },
  fullScreenWrapper: {
    flex: 1,
    width: "100%",
    height: "100%",
    gap: 0,
  },
  mapFrame: {
    height: 360,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceContainerLow,
    position: "relative",
  },
  mapFrameFullScreen: {
    flex: 1,
    height: "100%",
    borderRadius: 0,
    borderWidth: 0,
  },
  canvas: { flex: 1 },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: "rgba(250, 248, 255, 0.88)",
  },
  mapLoadingText: { ...typography.bodySm, color: colors.textSecondary },
  floatingControlsStack: {
    position: "absolute",
    right: 14,
    top: 14,
    gap: 10,
    zIndex: 25,
  },
  floatingFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sheet,
  },
  floatingFabPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.94 }],
  },
  floatingNoteToast: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 20,
    ...shadows.card,
  },
  floatingNoteText: {
    ...typography.labelSm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  floatingLegend: {
    position: "absolute",
    left: 14,
    bottom: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 20,
    ...shadows.card,
  },
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
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendText: { ...typography.labelSm, color: colors.textSecondary, fontSize: 11 },
  attributionRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs },
  attribution: { ...typography.labelSm, color: colors.textMuted, flexShrink: 1 },
  fullScreenModal: { flex: 1, backgroundColor: colors.background },
  fullScreenHeader: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: colors.surface },
  closeButton: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: "center", justifyContent: "center" },
  flexOne: { flex: 1 },
});
