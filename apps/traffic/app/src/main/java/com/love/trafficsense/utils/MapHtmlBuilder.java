package com.love.trafficsense.utils;

import java.util.List;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.data.model.RouteOption;

public class MapHtmlBuilder {

    public static String buildMapHtml(List<LiveIncident> incidents, RouteOption route, Double userLat, Double userLng) {
        return buildMapHtml(incidents, route, null, false, userLat, userLng);
    }

    public static String buildMapHtml(List<LiveIncident> incidents, RouteOption primaryRoute, RouteOption alternativeRoute, boolean isAlternativeSelected, Double userLat, Double userLng) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!doctype html><html lang='en'><head>")
          .append("<meta charset='utf-8'/>")
          .append("<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover'/>")
          .append("<link rel='stylesheet' href='file:///android_asset/leaflet/leaflet.css'/>")
          .append("<style>")
          .append("html, body, #map { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #FAF8FF; }")
          .append(".leaflet-container { font: 12px -apple-system, Roboto, sans-serif; background: #FAF8FF; cursor: crosshair; }")
          .append(".leaflet-control-attribution { font-size: 9px !important; }")
          .append(".leaflet-accident-pin { background: transparent !important; border: none !important; }")
          .append(".leaflet-selection-pin { background: transparent !important; border: none !important; animation: bouncePin 0.35s ease-out; }")
          .append("@keyframes bouncePin {")
          .append("  0% { transform: translateY(-25px) scale(0.7); opacity: 0; }")
          .append("  65% { transform: translateY(4px) scale(1.08); opacity: 1; }")
          .append("  100% { transform: translateY(0) scale(1); }")
          .append("}")
          .append("@keyframes pulseRing {")
          .append("  0% { box-shadow: 0 0 0 0 rgba(102,22,215,0.7); }")
          .append("  70% { box-shadow: 0 0 0 14px rgba(102,22,215,0); }")
          .append("  100% { box-shadow: 0 0 0 0 rgba(102,22,215,0); }")
          .append("}")
          .append("</style>")
          .append("</head><body>")
          .append("<div id='map'></div>")
          .append("<script src='file:///android_asset/leaflet/leaflet.js'></script>")
          .append("<script>")
          .append("var map = L.map('map', {")
          .append("  zoomControl: false,")
          .append("  attributionControl: false,")
          .append("  tap: false,")
          .append("  touchZoom: true,")
          .append("  doubleClickZoom: true,")
          .append("  scrollWheelZoom: true,")
          .append("  boxZoom: true")
          .append("}).setView([12.8687, 74.8436], 13);")
          .append("L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);")
          .append("var incidentsLayer = L.layerGroup().addTo(map);")
          .append("var primaryRouteLayer = L.layerGroup().addTo(map);")
          .append("var altRouteLayer = L.layerGroup().addTo(map);")
          .append("var selectionLayer = L.layerGroup().addTo(map);")
          .append("var bounds = [];\n");

        // Render Primary Route Polyline (if provided by route planner)
        if (primaryRoute != null && primaryRoute.geometry != null && primaryRoute.geometry.coordinates != null && !primaryRoute.geometry.coordinates.isEmpty()) {
            sb.append("var primaryCoords = [");
            for (int i = 0; i < primaryRoute.geometry.coordinates.size(); i++) {
                List<Double> pt = primaryRoute.geometry.coordinates.get(i);
                if (pt != null && pt.size() >= 2) {
                    double lng = pt.get(0);
                    double lat = pt.get(1);
                    if (i > 0) sb.append(",");
                    sb.append("[").append(lat).append(",").append(lng).append("]");
                }
            }
            sb.append("];\n");
            sb.append("for (var b = 0; b < primaryCoords.length; b++) { bounds.push(primaryCoords[b]); }\n");

            String primaryColor = primaryRoute.hasHazards ? "#BA1A1A" : "#005C55";
            int primaryWeight = isAlternativeSelected ? 4 : 6;
            double primaryOpacity = isAlternativeSelected ? 0.45 : 0.92;
            String dashOption = isAlternativeSelected ? ", dashArray: '6, 8'" : "";

            sb.append("L.polyline(primaryCoords, { color: '").append(primaryColor)
              .append("', weight: ").append(primaryWeight)
              .append(", opacity: ").append(primaryOpacity)
              .append(dashOption).append(" }).addTo(primaryRouteLayer);\n");

            // Start & End markers for primary route
            List<Double> startPt = primaryRoute.geometry.coordinates.get(0);
            List<Double> endPt = primaryRoute.geometry.coordinates.get(primaryRoute.geometry.coordinates.size() - 1);
            if (startPt != null && startPt.size() >= 2) {
                sb.append("L.circleMarker([").append(startPt.get(1)).append(",").append(startPt.get(0)).append("], { radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#005C55', fillOpacity: 1 }).addTo(primaryRouteLayer);\n");
            }
            if (endPt != null && endPt.size() >= 2) {
                sb.append("L.circleMarker([").append(endPt.get(1)).append(",").append(endPt.get(0)).append("], { radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#BA1A1A', fillOpacity: 1 }).addTo(primaryRouteLayer);\n");
            }
        }

        // Render Alternative Detour Route Polyline (if provided)
        if (alternativeRoute != null && alternativeRoute.geometry != null && alternativeRoute.geometry.coordinates != null && !alternativeRoute.geometry.coordinates.isEmpty()) {
            sb.append("var altCoords = [");
            for (int i = 0; i < alternativeRoute.geometry.coordinates.size(); i++) {
                List<Double> pt = alternativeRoute.geometry.coordinates.get(i);
                if (pt != null && pt.size() >= 2) {
                    double lng = pt.get(0);
                    double lat = pt.get(1);
                    if (i > 0) sb.append(",");
                    sb.append("[").append(lat).append(",").append(lng).append("]");
                }
            }
            sb.append("];\n");
            sb.append("for (var b = 0; b < altCoords.length; b++) { bounds.push(altCoords[b]); }\n");

            int altWeight = isAlternativeSelected ? 6 : 4;
            double altOpacity = isAlternativeSelected ? 0.95 : 0.60;
            String altDashOption = isAlternativeSelected ? "" : ", dashArray: '6, 6'";

            sb.append("L.polyline(altCoords, { color: '#005C55', weight: ").append(altWeight)
              .append(", opacity: ").append(altOpacity)
              .append(altDashOption).append(" }).addTo(altRouteLayer);\n");
        }

        // User GPS dot
        if (userLat != null && userLng != null) {
            sb.append("L.circleMarker([").append(userLat).append(", ").append(userLng)
              .append("], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#005C55', fillOpacity: 1 }).addTo(map);\n")
              .append("bounds.push([").append(userLat).append(", ").append(userLng).append("]);\n");
        }

        // Render Incidents as Custom Teardrop Pin Markers with Category Emojis
        if (incidents != null) {
            for (int idx = 0; idx < incidents.size(); idx++) {
                LiveIncident inc = incidents.get(idx);
                if (inc == null) continue;
                String safeId = inc.id != null ? inc.id.replaceAll("[^a-zA-Z0-9_]", "_") : ("inc_" + idx);
                String rawId = inc.id != null ? inc.id : safeId;

                String emoji = "⚠️";
                String bg = "#BA1A1A";
                String cat = inc.category != null ? inc.category.toLowerCase() : "";
                if (cat.contains("flood") || cat.contains("water")) {
                    emoji = "🌊";
                    bg = "#005C55";
                } else if (cat.contains("accident") || cat.contains("crash")) {
                    emoji = "💥";
                    bg = "#BA1A1A";
                } else if (cat.contains("traffic") || cat.contains("congestion")) {
                    emoji = "🚗";
                    bg = "#6616D7";
                } else if (cat.contains("construction") || cat.contains("repair")) {
                    emoji = "🚧";
                    bg = "#904D00";
                } else if (cat.contains("close") || cat.contains("block")) {
                    emoji = "⛔";
                    bg = "#BA1A1A";
                }

                // Native Teardrop Pin SVG / HTML Markup
                String pinHtml = "<div style='position:relative;width:34px;height:41px;display:flex;flex-direction:column;align-items:center;cursor:pointer;'>"
                        + "<div style='width:34px;height:34px;border-radius:17px;background:" + bg + ";border:2px solid #ffffff;box-shadow:0 3px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;'>"
                        + "<span style='line-height:1;'>" + emoji + "</span>"
                        + "</div>"
                        + "<div style='width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid " + bg + ";margin-top:-1px;'></div>"
                        + "</div>";

                sb.append("var icon_").append(safeId).append(" = L.divIcon({")
                  .append("className: 'leaflet-accident-pin',")
                  .append("html: \"").append(pinHtml).append("\",")
                  .append("iconSize: [34, 41], iconAnchor: [17, 41]")
                  .append("});\n")
                  .append("var marker_").append(safeId).append(" = L.marker([")
                  .append(inc.lat).append(", ").append(inc.lng).append("], { icon: icon_").append(safeId).append(" });\n")
                  .append("marker_").append(safeId).append(".on('click', function(e) {\n")
                  .append("  if (e && e.originalEvent) { L.DomEvent.stopPropagation(e); }\n")
                  .append("  selectionLayer.clearLayers();\n")
                  .append("  map.flyTo([").append(inc.lat).append(", ").append(inc.lng).append("], Math.max(map.getZoom(), 15), { duration: 0.6, easeLinearity: 0.25 });\n")
                  .append("  if (window.AndroidBridge && window.AndroidBridge.onIncidentSelected) { window.AndroidBridge.onIncidentSelected('").append(rawId).append("'); }\n")
                  .append("});\n")
                  .append("marker_").append(safeId).append(".addTo(incidentsLayer);\n")
                  .append("bounds.push([").append(inc.lat).append(", ").append(inc.lng).append("]);\n");
            }
        }

        // Tap Anywhere on the Map to Inspect Location (Google Maps / OSM style)
        sb.append("map.on('click', function(e) {\n")
          .append("  selectionLayer.clearLayers();\n")
          .append("  var lat = e.latlng.lat;\n")
          .append("  var lng = e.latlng.lng;\n")
          .append("  var selectHtml = \"<div style='position:relative;width:32px;height:42px;display:flex;flex-direction:column;align-items:center;'>\" +\n")
          .append("    \"<div style='width:32px;height:32px;border-radius:16px;background:#6616D7;border:3px solid #ffffff;animation:pulseRing 1.8s infinite;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:14px;'>📍</div>\" +\n")
          .append("    \"<div style='width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid #6616D7;margin-top:-1px;'></div>\" +\n")
          .append("    \"</div>\";\n")
          .append("  var selectIcon = L.divIcon({ className: 'leaflet-selection-pin', html: selectHtml, iconSize: [32, 42], iconAnchor: [16, 42] });\n")
          .append("  L.marker([lat, lng], { icon: selectIcon }).addTo(selectionLayer);\n")
          .append("  map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.5, easeLinearity: 0.25 });\n")
          .append("  if (window.AndroidBridge && window.AndroidBridge.onLocationSelected) {\n")
          .append("    window.AndroidBridge.onLocationSelected(lat, lng);\n")
          .append("  }\n")
          .append("});\n");

        // Global Controller Functions for Floating UI Controls with Smooth Easing
        sb.append("window.zoomIn = function() { map.zoomIn({ animate: true }); };\n")
          .append("window.zoomOut = function() { map.zoomOut({ animate: true }); };\n")
          .append("window.centerMap = function(lat, lng) { map.flyTo([lat, lng], 15, { duration: 0.8, easeLinearity: 0.25 }); };\n")
          .append("window.clearSelection = function() { selectionLayer.clearLayers(); };\n");

        sb.append("if (bounds.length > 0) { map.fitBounds(bounds, { padding: [30, 30] }); }\n")
          .append("</script></body></html>");

        return sb.toString();
    }
}
