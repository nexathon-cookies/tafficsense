// Generates the self-contained page loaded by the native WebView map.
// The page imports the pinned MapLibre GL module, falls back to a schematic background
// when the street-tile style cannot load, and reports state back through postMessage.
export const MAPLIBRE_VERSION = "6.14.0";
export const MAPLIBRE_BASE_URL = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist`;
export const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const MAP_ATTRIBUTION = "OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors";

export function buildMapHtml(options: { baseUrl?: string; styleUrl?: string } = {}): string {
  const baseUrl = JSON.stringify(options.baseUrl ?? MAPLIBRE_BASE_URL);
  const styleUrl = JSON.stringify(options.styleUrl ?? OPENFREEMAP_STYLE_URL);
  const attribution = JSON.stringify(MAP_ATTRIBUTION);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>TrafficSense map</title>
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: #faf8ff; overflow: hidden; }
  .maplibregl-ctrl-attrib { font-size: 11px; }
  #status { position: absolute; left: 8px; top: 8px; right: 8px; padding: 6px 10px; border-radius: 8px;
    background: rgba(255,255,255,0.92); color: #3e4947; font: 600 12px system-ui, sans-serif; display: none; }
</style>
</head>
<body>
<div id="map" role="region" aria-label="Traffic map"></div>
<div id="status" role="status" aria-live="polite"></div>
<script type="module">
  const BASE = ${baseUrl};
  const STYLE_URL = ${styleUrl};
  const ATTRIBUTION = ${attribution};
  const FALLBACK_STYLE = {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": "#f1efe9" } }],
  };

  function post(type, data) {
    const message = JSON.stringify(Object.assign({ type: type }, data || {}));
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(message);
    }
  }

  function setStatus(text) {
    const el = document.getElementById("status");
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
  }

  function hasWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch (error) {
      return false;
    }
  }

  const empty = { type: "FeatureCollection", features: [] };
  let pending = null;
  let map = null;
  let ready = false;
  let usingFallback = false;
  let fallbackReason = null;
  let lastData = null;

  function applyData(payload) {
    if (!map || !ready) return;
    map.getSource("segments").setData(payload.segments);
    map.getSource("routes").setData(payload.routes);
    map.getSource("incidents").setData(payload.incidents);
    map.getSource("you").setData(payload.you ? { type: "Feature", properties: {}, geometry: payload.you } : empty);
    if (payload.fit) fitToData(payload);
  }

  function fitToData(payload) {
    const points = [];
    payload.segments.features.forEach(f => f.geometry.coordinates.forEach(c => points.push(c)));
    payload.routes.features.forEach(f => f.geometry.coordinates.forEach(c => points.push(c)));
    payload.incidents.features.forEach(f => points.push(f.geometry.coordinates));
    if (payload.you) points.push(payload.you.coordinates);
    if (points.length === 0) return;
    let west = points[0][0], east = points[0][0], south = points[0][1], north = points[0][1];
    points.forEach(([lng, lat]) => {
      west = Math.min(west, lng); east = Math.max(east, lng);
      south = Math.min(south, lat); north = Math.max(north, lat);
    });
    map.fitBounds([[west, south], [east, north]], { padding: 40, maxZoom: 15, duration: 0 });
  }

  function addLayers() {
    map.addSource("segments", { type: "geojson", data: empty });
    map.addSource("routes", { type: "geojson", data: empty });
    map.addSource("incidents", { type: "geojson", data: empty });
    map.addSource("you", { type: "geojson", data: empty });

    map.addLayer({ id: "segments", type: "line", source: "segments",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "colour"], "line-width": 5, "line-opacity": 0.85 } });

    map.addLayer({ id: "routes-casing", type: "line", source: "routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9 } });
    map.addLayer({ id: "routes", type: "line", source: "routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "colour"], "line-width": ["case", ["get", "selected"], 7, 5] } });

    map.addLayer({ id: "incidents", type: "circle", source: "incidents",
      paint: {
        "circle-radius": ["case", ["get", "selected"], 11, ["get", "onRoute"], 9, 7],
        "circle-color": ["get", "colour"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      } });

    map.addLayer({ id: "you", type: "circle", source: "you",
      paint: { "circle-radius": 6, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });

    // One click handler so a tap on an incident never also selects the route beneath it.
    map.on("click", (event) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: ["incidents", "routes"] });
      const incident = hits.find((feature) => feature.layer.id === "incidents");
      const route = hits.find((feature) => feature.layer.id === "routes");
      if (incident) post("select-incident", { id: incident.properties.id });
      else if (route) post("select-route", { id: route.properties.id });
    });
    ["incidents", "routes"].forEach((layer) => {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    });
  }

  function createMap(style, isFallback, reason) {
    usingFallback = isFallback;
    fallbackReason = reason || null;
    map = new maplibregl.Map({
      container: "map",
      style: style,
      center: [74.84, 12.87],
      zoom: 12,
      attributionControl: { compact: true, customAttribution: ATTRIBUTION },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    // Individual tile, sprite or glyph errors are normal on a slow network and must not
    // replace a working street map. The style itself is checked before the map is created.
    map.on("error", (event) => {
      const message = (event && event.error && event.error.message) || "";
      post("map-error", { detail: message.slice(0, 160) });
    });
    map.on("load", () => {
      if (!ready) {
        ready = true;
        addLayers();
        if (usingFallback) setStatus("Street map unavailable · schematic corridor only");
        else setStatus("");
        post("ready", { fallback: usingFallback, reason: fallbackReason });
        if (pending) { applyData(pending); pending = null; }
        else if (lastData) applyData(lastData);
      }
    });
  }

  window.trafficMap = {
    setData(payload) {
      lastData = payload;
      if (ready) applyData(payload); else pending = payload;
    },
    showYou(point) {
      if (ready) map.getSource("you").setData(point ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } } : empty);
    },
    refit() {
      if (ready && lastData) fitToData(lastData);
    },
  };

  // Checks that the phone can reach the street style file before MapLibre tries to use it.
  // Returns null when reachable, otherwise a short description of the problem.
  async function checkStyle() {
    try {
      const response = await fetch(STYLE_URL, { cache: "no-store" });
      if (!response.ok) return "OpenFreeMap answered HTTP " + response.status;
      return null;
    } catch (error) {
      return "the phone could not reach OpenFreeMap (" + ((error && error.message) || "network error") + ")";
    }
  }

  if (!hasWebGL()) {
    post("failed", { reason: "webgl" });
  } else {
    import(BASE + "/maplibre-gl.mjs").then(async (module) => {
      window.maplibregl = module.default || module;
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = BASE + "/maplibre-gl.css";
      document.head.appendChild(css);
      try {
        const problem = await checkStyle();
        if (problem) {
          post("map-error", { detail: problem });
          createMap(FALLBACK_STYLE, true, problem);
        } else {
          createMap(STYLE_URL, false, null);
        }
      } catch (error) {
        post("failed", { reason: "renderer" });
      }
    }).catch(() => {
      post("failed", { reason: "library" });
    });
  }
</script>
</body>
</html>`;
}