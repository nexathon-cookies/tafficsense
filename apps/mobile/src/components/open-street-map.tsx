import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { LiveIncident, RouteOption, TrafficSegment } from "@trafficsense/shared";
import { buildMapPayload } from "../map/map-data";
import { buildMapHtml } from "../map/map-html";

const MAP_HTML = buildMapHtml();

type Props = {
  style?: StyleProp<ViewStyle>;
  segments: TrafficSegment[];
  incidents: LiveIncident[];
  routes?: RouteOption[];
  alternativeId?: string | null;
  selectedIncidentId: string | null;
  selectedRouteId?: string | null;
  you: [number, number] | null;
  fitKey: number;
  centerKey: number;
  onSelectIncident: (id: string) => void;
  onSelectRoute?: (id: string) => void;
  onFailure: () => void;
  onError?: (detail: string) => void;
};

type MapMessage =
  | { type: "ready"; fallback?: boolean; reason?: string | null }
  | { type: "select-incident"; id?: string }
  | { type: "select-route"; id?: string }
  | { type: "failed"; reason?: string }
  | { type: "map-error"; detail?: string };

export function OpenStreetMap({
  style,
  segments,
  incidents,
  routes,
  alternativeId,
  selectedIncidentId,
  selectedRouteId,
  you,
  fitKey,
  centerKey,
  onSelectIncident,
  onSelectRoute,
  onFailure,
  onError,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const lastFitKey = useRef<number | null>(null);
  const payload = useMemo(
    () => buildMapPayload({
      segments,
      incidents,
      routes,
      selectedIncidentId,
      selectedRouteId,
      alternativeId,
      you,
      fit: false,
    }),
    [segments, incidents, routes, selectedIncidentId, selectedRouteId, alternativeId, you],
  );

  useEffect(() => {
    const webView = webViewRef.current;
    if (!ready || !webView) return;
    const fit = lastFitKey.current !== fitKey;
    lastFitKey.current = fitKey;
    webView.postMessage(JSON.stringify({ type: "set-data", payload: { ...payload, fit } }));
  }, [fitKey, payload, ready]);

  useEffect(() => {
    if (!ready || centerKey === 0 || !webViewRef.current || !you) return;
    webViewRef.current.postMessage(JSON.stringify({ type: "center", point: you, zoom: 15 }));
  }, [centerKey, ready, you]);

  function handleMessage(event: WebViewMessageEvent) {
    let message: MapMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as MapMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case "ready":
        setReady(true);
        if (message.fallback) onFailure();
        break;
      case "select-incident":
        if (message.id) onSelectIncident(message.id);
        break;
      case "select-route":
        if (message.id) onSelectRoute?.(message.id);
        break;
      case "failed":
        onFailure();
        break;
      case "map-error":
        if (message.detail) onError?.(message.detail);
        break;
    }
  }

  return (
    <View style={[styles.frame, style]} accessibilityLabel="OpenStreetMap traffic and route map">
      <WebView
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onError={onFailure}
        onHttpError={(event) => onError?.(`Map renderer HTTP ${event.nativeEvent.statusCode}`)}
        accessibilityLabel="Map of Mangaluru with OpenStreetMap streets, traffic reports, and route overlays"
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden" },
  webView: { flex: 1, backgroundColor: "#faf8ff" },
});
