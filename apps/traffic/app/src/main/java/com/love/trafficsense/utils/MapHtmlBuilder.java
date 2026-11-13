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
          .append("<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'/>")
          .append("<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'/>")
          .append("<style>")
          .append("html, body, #map { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #FAF8FF; }")
          .append(".leaflet-container { font: 12px -apple-system, Roboto, sans-serif; background: #FAF8FF; }")
          .append(".leaflet-control-attribution { font-size: 9px !important; }")
          .append(".leaflet-accident-pin { background: transparent !important; border: none !important; }")
          .append("</style>")
          .append("</head><body>")
          .append("<div id='map'></div>")
          .append("<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script>")
          .append("<script>")
          .append("var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([12.8687, 74.8436], 13);")
          .append("L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);")
          .append("var incidentsLayer = L.layerGroup().addTo(map);")
          .append("var primaryRouteLayer = L.layerGroup().addTo(map);")
          .append("var altRouteLayer = L.layerGroup().addTo(map);")
          .append("var bounds = [];\n");

        // Render Primary Route Polyline
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
        } else if (primaryRoute == null) {
            // Baseline Mangaluru Corridor fallback
            sb.append("var baselineCoords = [[12.8687, 74.8436],[12.8640, 74.8470],[12.8580, 74.8550]];\n")
              .append("L.polyline(baselineCoords, { color: '#005C55', weight: 5, opacity: 0.85 }).addTo(primaryRouteLayer);\n")
              .append("bounds.push([12.8687, 74.8436]); bounds.push([12.8580, 74.8550]);\n");
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
                  .append("marker_").append(safeId).append(".on('click', function() {")
                  .append("  if (window.AndroidBridge) { window.AndroidBridge.onIncidentSelected('").append(rawId).append("'); }")
                  .append("});\n")
                  .append("marker_").append(safeId).append(".addTo(incidentsLayer);\n")
                  .append("bounds.push([").append(inc.lat).append(", ").append(inc.lng).append("]);\n");
            }
        }

        sb.append("if (bounds.length > 0) { map.fitBounds(bounds, { padding: [30, 30] }); }\n")
          .append("</script></body></html>");

        return sb.toString();
    }
}
