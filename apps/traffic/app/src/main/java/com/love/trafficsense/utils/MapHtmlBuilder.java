package com.love.trafficsense.utils;

import java.util.List;
import com.love.trafficsense.data.model.LiveIncident;
import com.love.trafficsense.data.model.RouteOption;

public class MapHtmlBuilder {

    public static String buildMapHtml(List<LiveIncident> incidents, RouteOption route, Double userLat, Double userLng) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!doctype html><html lang='en'><head>")
          .append("<meta charset='utf-8'/>")
          .append("<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'/>")
          .append("<link rel='stylesheet' href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'/>")
          .append("<style>")
          .append("html, body, #map { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #FAF8FF; }")
          .append(".leaflet-container { font: 12px -apple-system, Roboto, sans-serif; background: #FAF8FF; }")
          .append(".leaflet-control-attribution { font-size: 9px !important; }")
          .append(".accident-pin { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #ffffff; box-shadow: 0 3px 8px rgba(0,0,0,0.3); border: 2px solid #BA1A1A; font-size: 16px; cursor: pointer; }")
          .append(".accident-pin.flood { border-color: #005C55; }")
          .append(".accident-pin.traffic { border-color: #6616D7; }")
          .append(".accident-pin.construction { border-color: #904D00; }")
          .append("</style>")
          .append("</head><body>")
          .append("<div id='map'></div>")
          .append("<script src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'></script>")
          .append("<script>")
          .append("var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([12.8687, 74.8436], 13);")
          .append("L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);")
          .append("var incidentsLayer = L.layerGroup().addTo(map);")
          .append("var routeLayer = L.layerGroup().addTo(map);")
          .append("var bounds = [];");

        // Route Polyline
        if (route != null && route.geometry != null && route.geometry.coordinates != null && !route.geometry.coordinates.isEmpty()) {
            sb.append("var routeCoords = [");
            for (int i = 0; i < route.geometry.coordinates.size(); i++) {
                List<Double> pt = route.geometry.coordinates.get(i);
                if (pt != null && pt.size() >= 2) {
                    double lng = pt.get(0);
                    double lat = pt.get(1);
                    if (i > 0) sb.append(",");
                    sb.append("[").append(lat).append(",").append(lng).append("]");
                }
            }
            sb.append("];\n");
            sb.append("for (var b = 0; b < routeCoords.length; b++) { bounds.push(routeCoords[b]); }\n");
            String routeColor = route.hasHazards ? "#BA1A1A" : "#005C55";
            sb.append("L.polyline(routeCoords, { color: '").append(routeColor).append("', weight: 6, opacity: 0.9 }).addTo(routeLayer);\n");

            // Start & End markers
            List<Double> startPt = route.geometry.coordinates.get(0);
            List<Double> endPt = route.geometry.coordinates.get(route.geometry.coordinates.size() - 1);
            if (startPt != null && startPt.size() >= 2) {
                sb.append("L.circleMarker([").append(startPt.get(1)).append(",").append(startPt.get(0)).append("], { radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#005C55', fillOpacity: 1 }).addTo(routeLayer);\n");
            }
            if (endPt != null && endPt.size() >= 2) {
                sb.append("L.circleMarker([").append(endPt.get(1)).append(",").append(endPt.get(0)).append("], { radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#BA1A1A', fillOpacity: 1 }).addTo(routeLayer);\n");
            }
        } else {
            // Corridor Baseline route line fallback
            sb.append("var baselineCoords = [[12.8687, 74.8436],[12.8640, 74.8470],[12.8580, 74.8550]];\n")
              .append("L.polyline(baselineCoords, { color: '#005C55', weight: 5, opacity: 0.85 }).addTo(routeLayer);\n")
              .append("bounds.push([12.8687, 74.8436]); bounds.push([12.8580, 74.8550]);\n");
        }

        // User GPS dot
        if (userLat != null && userLng != null) {
            sb.append("L.circleMarker([").append(userLat).append(", ").append(userLng)
              .append("], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#005C55', fillOpacity: 1 }).addTo(map);\n")
              .append("bounds.push([").append(userLat).append(", ").append(userLng).append("]);\n");
        }

        // Render Incidents as Custom Teardrop/Circle Markers with Category Emojis
        if (incidents != null) {
            for (int idx = 0; idx < incidents.size(); idx++) {
                LiveIncident inc = incidents.get(idx);
                if (inc == null) continue;
                String safeId = inc.id != null ? inc.id.replaceAll("[^a-zA-Z0-9_]", "_") : ("inc_" + idx);
                String rawId = inc.id != null ? inc.id : safeId;

                String emoji = "⚠️";
                String pinClass = "accident-pin";
                String cat = inc.category != null ? inc.category.toLowerCase() : "";
                if (cat.contains("flood") || cat.contains("water")) {
                    emoji = "🌊";
                    pinClass = "accident-pin flood";
                } else if (cat.contains("accident") || cat.contains("crash")) {
                    emoji = "💥";
                    pinClass = "accident-pin";
                } else if (cat.contains("traffic") || cat.contains("congestion")) {
                    emoji = "🚗";
                    pinClass = "accident-pin traffic";
                } else if (cat.contains("construction") || cat.contains("repair")) {
                    emoji = "🚧";
                    pinClass = "accident-pin construction";
                } else if (cat.contains("close") || cat.contains("block")) {
                    emoji = "⛔";
                    pinClass = "accident-pin";
                }

                sb.append("var icon_").append(safeId).append(" = L.divIcon({")
                  .append("className: '").append(pinClass).append("',")
                  .append("html: '").append(emoji).append("',")
                  .append("iconSize: [34, 34], iconAnchor: [17, 17]")
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
