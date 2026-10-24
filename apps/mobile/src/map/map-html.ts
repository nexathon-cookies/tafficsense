// Creates the non-WebGL OpenStreetMap page hosted by the Expo WebView.
export const LEAFLET_VERSION = "1.9.4";
export const LEAFLET_BASE_URL = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist`;
export const OPENSTREETMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_ATTRIBUTION = "\u00a9 OpenStreetMap contributors";

export function buildMapHtml(options: { baseUrl?: string } = {}): string {
  const baseUrl = options.baseUrl ?? LEAFLET_BASE_URL;
  const tileUrl = JSON.stringify(OPENSTREETMAP_TILE_URL);
  const attribution = JSON.stringify(MAP_ATTRIBUTION);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>TrafficSense OpenStreetMap</title>
<link rel="stylesheet" href="${baseUrl}/leaflet.css" />
<style>
  html, body, #map { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #f1efe9; }
  .leaflet-container { font: 12px system-ui, sans-serif; background: #f1efe9; }
  .leaflet-control-attribution { font-size: 10px !important; }
  .leaflet-control-zoom a { width: 40px !important; height: 40px !important; line-height: 40px !important; }
  .leaflet-accident-pin { background: transparent !important; border: none !important; }
  #status { position: absolute; z-index: 1000; top: 10px; left: 10px; padding: 7px 10px; border-radius: 8px;
    background: rgba(255,255,255,.95); color: #3e4947; font: 600 12px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="map" role="region" aria-label="Interactive OpenStreetMap traffic map"></div>
<div id="status" role="status" aria-live="polite">Loading street map…</div>
<script src="${baseUrl}/leaflet.js"></script>
<script>
  (function () {
    function post(type, data) {
      var bridge = window.ReactNativeWebView;
      if (bridge && bridge.postMessage) bridge.postMessage(JSON.stringify(Object.assign({ type: type }, data || {})));
    }
    var tileUrl = ${tileUrl};
    var attribution = ${attribution};
    var status = document.getElementById("status");
    if (!window.L) { post("failed", { reason: "leaflet-library" }); return; }

    var map = L.map("map", { zoomControl: true, attributionControl: true, preferCanvas: true }).setView([12.87, 74.84], 12);
    var segments = L.layerGroup().addTo(map);
    var routes = L.layerGroup().addTo(map);
    var incidents = L.layerGroup().addTo(map);
    var you = L.layerGroup().addTo(map);
    var lastData = null;
    var loadedTile = false;
    var tileErrors = 0;
    var tileLayer = L.tileLayer(tileUrl, { maxZoom: 19, attribution: attribution }).addTo(map);
    tileLayer.on("tileload", function () { loadedTile = true; status.style.display = "none"; });
    tileLayer.on("tileerror", function () {
      tileErrors += 1;
      if (!loadedTile && tileErrors >= 2) status.textContent = "Waiting for OpenStreetMap tiles…";
    });

    function featureCollection(features) { return { type: "FeatureCollection", features: features || [] }; }
    function fitData(data) {
      var coordinates = [];
      [data.segments, data.routes].forEach(function (collection) {
        ((collection && collection.features) || []).forEach(function (feature) {
          (feature.geometry.coordinates || []).forEach(function (point) { coordinates.push([point[1], point[0]]); });
        });
      });
      ((data.incidents && data.incidents.features) || []).forEach(function (feature) {
        var point = feature.geometry.coordinates; coordinates.push([point[1], point[0]]);
      });
      if (data.you && data.you.coordinates) coordinates.push([data.you.coordinates[1], data.you.coordinates[0]]);
      if (coordinates.length) map.fitBounds(coordinates, { padding: [28, 28], maxZoom: 15, animate: false });
    }
    function onFeature(layer, feature, eventName) {
      layer.on("click", function (event) {
        if (event && event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        if (feature.properties && feature.properties.id) post(eventName, { id: feature.properties.id });
      });
    }
    function setData(data) {
      lastData = data;
      segments.clearLayers(); routes.clearLayers(); incidents.clearLayers(); you.clearLayers();
      L.geoJSON(featureCollection(data.segments && data.segments.features), {
        style: function (feature) { return { color: feature.properties.colour || "#d97706", weight: 5, opacity: .9 }; }
      }).addTo(segments);
      L.geoJSON(featureCollection(data.routes && data.routes.features), {
        style: function (feature) { return { color: feature.properties.colour || "#005c55", weight: feature.properties.selected ? 7 : 5, opacity: .92 }; },
        onEachFeature: function (feature, layer) { onFeature(layer, feature, "select-route"); }
      }).addTo(routes);
      L.geoJSON(featureCollection(data.incidents && data.incidents.features), {
        pointToLayer: function (feature, latlng) {
          var selected = feature.properties.selected;
          var onRoute = feature.properties.onRoute;
          var category = (feature.properties.category || "").toLowerCase();
          var emoji = "⚠️";
          if (category.indexOf("accident") !== -1 || category.indexOf("crash") !== -1) emoji = "💥";
          else if (category.indexOf("flood") !== -1 || category.indexOf("water") !== -1) emoji = "🌊";
          else if (category.indexOf("closure") !== -1 || category.indexOf("block") !== -1) emoji = "⛔";
          else if (category.indexOf("construction") !== -1 || category.indexOf("work") !== -1) emoji = "🚧";
          else if (category.indexOf("hazard") !== -1) emoji = "⚠️";

          var pinSize = selected ? 34 : 26;
          var bg = feature.properties.colour || "#dc2626";
          var pinHtml = '<div style="position:relative;width:' + pinSize + 'px;height:' + (pinSize + 7) + 'px;display:flex;flex-direction:column;align-items:center;cursor:pointer;">'
            + '<div style="width:' + pinSize + 'px;height:' + pinSize + 'px;border-radius:' + (pinSize / 2) + 'px;background:' + bg + ';border:2px solid #ffffff;box-shadow:0 3px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:' + (selected ? 16 : 13) + 'px;' + (selected ? 'outline:3px solid rgba(220,38,38,0.55);' : '') + '">'
            + '<span style="line-height:1;">' + emoji + '</span>'
            + '</div>'
            + '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid ' + bg + ';margin-top:-1px;"></div>'
            + '</div>';

          var icon = L.divIcon({
            className: "leaflet-accident-pin",
            html: pinHtml,
            iconSize: [pinSize, pinSize + 7],
            iconAnchor: [pinSize / 2, pinSize + 7]
          });
          return L.marker(latlng, { icon: icon, zIndexOffset: selected ? 1000 : (onRoute ? 800 : 500) });
        },
        onEachFeature: function (feature, layer) { onFeature(layer, feature, "select-incident"); }
      }).addTo(incidents);
      if (data.you) L.geoJSON({ type: "Feature", properties: {}, geometry: data.you }, {
        pointToLayer: function (feature, latlng) { return L.circleMarker(latlng, { radius: 7, color: "#ffffff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }); }
      }).addTo(you);
      if (data.fit) fitData(data);
    }

    window.trafficMap = {
      setData: setData,
      centerOn: function (point) { if (Array.isArray(point) && point.length === 2) map.setView([point[1], point[0]], 14); },
      refit: function () { if (lastData) fitData(lastData); }
    };
    setTimeout(function () {
      if (!loadedTile) post("map-error", { detail: "OpenStreetMap tiles have not loaded yet." });
    }, 12000);
    post("ready", { fallback: false });
  }());
</script>
</body>
</html>`;
}
