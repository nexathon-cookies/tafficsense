"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import type { Map as MapInstance, Marker as MarkerInstance } from "maplibre-gl";
import { formatRouteDuration, formatRouteDistance, type RouteOption } from "@/lib/routing/types";
import { reportCategories, reportCategoryIcons, type ReportCategory } from "@/lib/reports/rules";
import type { LiveIncident } from "@/lib/incidents/server";
import { createFallbackStyle } from "@/lib/traffic/mangaluru-basemap";
import "maplibre-gl/dist/maplibre-gl.css";

export const MANGALURU_PRESETS = [
  { name: "Hampankatta Junction", coords: [74.8426, 12.8698] as [number, number] },
  { name: "KSRTC / Bejai Circle", coords: [74.8530, 12.8856] as [number, number] },
  { name: "Ambedkar (Jyothi) Circle", coords: [74.8465, 12.8715] as [number, number] },
  { name: "Ladyhill Circle", coords: [74.8385, 12.8890] as [number, number] },
  { name: "Pumpwell (Mahaveera) Circle", coords: [74.8685, 12.8550] as [number, number] },
  { name: "Mangaluru Central Railway", coords: [74.8390, 12.8640] as [number, number] },
  { name: "Kadri Manjunatha Temple", coords: [74.8580, 12.8820] as [number, number] },
  { name: "Mangalore International Airport", coords: [74.8900, 12.9610] as [number, number] },
];

type TrafficSeveritySegment = {
  id: string;
  name: string;
  direction: "inbound" | "outbound";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  severity: "slowdown" | "corroborated" | "reported" | "clear";
  provenance: "simulated";
};

const severityColours: Record<TrafficSeveritySegment["severity"], string> = {
  slowdown: "#ea580c",
  corroborated: "#d97706",
  reported: "#ca8a04",
  clear: "#059669",
};

export function RoutePlanner() {
  const [startIndex, setStartIndex] = useState<number>(0); // Hampankatta
  const [destIndex, setDestIndex] = useState<number>(1); // KSRTC Bejai
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [useGpsStart, setUseGpsStart] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [trafficSeverity, setTrafficSeverity] = useState<TrafficSeveritySegment[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Incident reporting state
  const [showReportForm, setShowReportForm] = useState<boolean>(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory>("accident");
  const [reportLocationIndex, setReportLocationIndex] = useState<number>(0);
  const [useGpsReport, setUseGpsReport] = useState<boolean>(false);
  const [reportNote, setReportNote] = useState<string>("");
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  function initialRouteId(routeList: RouteOption[]): string | null {
    return routeList.find(route => route.incidents_on_route.length > 0)?.id ?? routeList[0]?.id ?? null;
  }

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markersRef = useRef<MarkerInstance[]>([]);

  // Get active start & destination coordinates
  const activeStart: [number, number] = useGpsStart && userLocation
    ? userLocation
    : MANGALURU_PRESETS[startIndex].coords;
  const activeDest: [number, number] = MANGALURU_PRESETS[destIndex].coords;

  // Request browser GPS position
  function handleRequestGps(target: "start" | "report" = "start") {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(coords);
        setGpsAccuracy(pos.coords.accuracy);
        if (target === "report") {
          setUseGpsReport(true);
        } else {
          setUseGpsStart(true);
        }
      },
      (err) => {
        setGpsError(`Location was not shared (${err.message}). Choose a map location or allow location access to report from your position.`);
        if (target === "report") {
          setUseGpsReport(false);
        } else {
          setUseGpsStart(false);
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // Fetch driving routes between activeStart and activeDest
  function fetchRoutes(startCoords: [number, number], destCoords: [number, number]) {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: startCoords,
            destination: destCoords,
          }),
        });

        const data = await res.json();
        if (!data.ok || !data.routes || data.routes.length === 0) {
          setStatusMessage(data.error ?? "No routes found between these locations.");
          setRoutes([]);
          setSelectedRouteId(null);
          return;
        }

        setRoutes(data.routes);
        setSelectedRouteId(initialRouteId(data.routes));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        setStatusMessage(`Could not retrieve route: ${msg}`);
      }
    });
  }

  // Fetch active incidents
  async function loadIncidents() {
    try {
      const res = await fetch("/api/incidents");
      const data = await res.json();
      if (data.ok && Array.isArray(data.incidents)) {
        setLiveIncidents(data.incidents);
      }
    } catch {
      // Ignore network errors on background poll
    }
  }

  async function loadTrafficSeverity() {
    try {
      const res = await fetch("/api/traffic", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && Array.isArray(data.segments)) setTrafficSeverity(data.segments);
    } catch {
      // Severity overlay is additive; route planning remains available if the simulated reader is unavailable.
    }
  }

  // Submit incident report
  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingReport(true);
    setReportFeedback(null);

    const reportCoords = useGpsReport && userLocation
      ? userLocation
      : MANGALURU_PRESETS[reportLocationIndex].coords;

    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: reportCategory,
          lat: reportCoords[1],
          lng: reportCoords[0],
          gps_accuracy_m: useGpsReport ? gpsAccuracy : null,
          gps_fix_at: useGpsReport ? new Date().toISOString() : null,
          note: reportNote || null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        const reporters = typeof data.distinct_reporters === "number" ? data.distinct_reporters : 1;
        setReportFeedback(`Reported. ${reporters} ${reporters === 1 ? "person has" : "people have"} reported this.`);
        setReportNote("");
        setShowReportForm(false);
        // Refresh incidents and recalculate route
        await Promise.all([loadIncidents(), loadTrafficSeverity()]);
        fetchRoutes(activeStart, activeDest);
      } else {
        setReportFeedback(`❌ Could not submit: ${data.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setReportFeedback(`❌ Submission failed: ${msg}`);
    } finally {
      setIsSubmittingReport(false);
    }
  }

  // Map rendering helper
  const renderRoutesOnMap = (
    map: MapInstance,
    routeList: RouteOption[],
    selectedId: string | null,
    incidentList: LiveIncident[],
    severityList: TrafficSeveritySegment[]
  ) => {
    if (!map.isStyleLoaded()) {
      map.once("style.load", () => {
        renderRoutesOnMap(map, routeList, selectedId, incidentList, severityList);
      });
      return;
    }

    // Clear old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    // Remove existing layers and sources if present
    if (map.getLayer("routes-alt-layer")) map.removeLayer("routes-alt-layer");
    if (map.getLayer("routes-primary-layer")) map.removeLayer("routes-primary-layer");
    if (map.getSource("routes-geojson")) map.removeSource("routes-geojson");
    if (map.getLayer("traffic-severity-layer")) map.removeLayer("traffic-severity-layer");
    if (map.getSource("traffic-severity-geojson")) map.removeSource("traffic-severity-geojson");

    map.addSource("traffic-severity-geojson", {
      type: "geojson",
      data: { type: "FeatureCollection", features: severityList.map((segment) => ({
        type: "Feature" as const,
        properties: { severity: segment.severity, name: segment.name, provenance: segment.provenance },
        geometry: segment.geometry,
      })) },
    });
    map.addLayer({
      id: "traffic-severity-layer", type: "line", source: "traffic-severity-geojson",
      paint: { "line-color": ["match", ["get", "severity"], "slowdown", severityColours.slowdown, "corroborated", severityColours.corroborated, "reported", severityColours.reported, severityColours.clear], "line-width": 7, "line-opacity": 0.48 },
    });

    // Build GeoJSON features for all routes
    const features = routeList.map((r) => ({
      type: "Feature" as const,
      properties: {
        id: r.id,
        is_selected: r.id === (selectedId ?? routeList[0]?.id),
        is_recommended: r.is_recommended,
        avoids_incident: r.avoids_incident,
      },
      geometry: r.geometry,
    }));

    map.addSource("routes-geojson", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    // Layer 1: Alternative / unselected routes
    map.addLayer({
      id: "routes-alt-layer",
      type: "line",
      source: "routes-geojson",
      filter: ["!=", ["get", "id"], selectedId ?? routeList[0]?.id ?? ""],
      paint: {
        "line-color": "#64748b",
        "line-width": 4,
        "line-dasharray": [2, 2],
        "line-opacity": 0.7,
      },
    });

    // Layer 2: Selected / recommended route
    map.addLayer({
      id: "routes-primary-layer",
      type: "line",
      source: "routes-geojson",
      filter: ["==", ["get", "id"], selectedId ?? routeList[0]?.id ?? ""],
      paint: {
        "line-color": "#2563eb",
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });

    // Add Start, Destination, and Incident markers
    import("maplibre-gl").then(({ Marker, LngLatBounds }) => {
      // Start Marker (Green)
      const startEl = document.createElement("div");
      startEl.className = "w-5 h-5 rounded-full bg-emerald-600 border-2 border-white shadow flex items-center justify-center text-[10px] text-white font-bold";
      startEl.textContent = "A";
      const startMarker = new Marker({ element: startEl })
        .setLngLat(activeStart)
        .addTo(map);
      markersRef.current.push(startMarker);

      // Destination Marker (Red)
      const destEl = document.createElement("div");
      destEl.className = "w-5 h-5 rounded-full bg-rose-600 border-2 border-white shadow flex items-center justify-center text-[10px] text-white font-bold";
      destEl.textContent = "B";
      const destMarker = new Marker({ element: destEl })
        .setLngLat(activeDest)
        .addTo(map);
      markersRef.current.push(destMarker);

      // Incident Markers (Emoji + Level Badge)
      for (const inc of incidentList) {
        const incEl = document.createElement("div");
        const icon = reportCategoryIcons[inc.category] ?? "⚠️";
        incEl.className = "px-1.5 py-0.5 rounded-full bg-surface-container-lowest/95 border border-surface-container shadow flex items-center gap-1 text-[11px] font-bold cursor-pointer";
        incEl.title = `Show details: ${reportCategories[inc.category] ?? inc.category} (${inc.level}): ${inc.level_reason}`;
        incEl.setAttribute("role", "button");
        incEl.setAttribute("tabindex", "0");
        incEl.setAttribute("aria-label", `Show details for ${reportCategories[inc.category] ?? inc.category}, ${inc.level}, ${inc.report_count} reports`);
        incEl.innerHTML = `<span>${icon}</span><span class="text-[9px] px-1 rounded bg-amber-500 text-white">${inc.level}</span>`;
        const selectIncident = () => setSelectedIncidentId(inc.id);
        incEl.addEventListener("click", selectIncident);
        incEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectIncident();
          }
        });

        const incMarker = new Marker({ element: incEl })
          .setLngLat([inc.lng, inc.lat])
          .addTo(map);
        markersRef.current.push(incMarker);
      }

      // Fit map bounds to encompass the route coordinates
      const selected = routeList.find((r) => r.id === (selectedId ?? routeList[0]?.id));
      if (selected && selected.geometry.coordinates.length > 0) {
        const bounds = new LngLatBounds();
        for (const coord of selected.geometry.coordinates) {
          bounds.extend(coord as [number, number]);
        }
        map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      }
    });
  };

  // Initialize route & incidents on mount
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const [routeRes, incidentRes, trafficRes] = await Promise.all([
          fetch("/api/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: activeStart, destination: activeDest }),
          }),
          fetch("/api/incidents"),
          fetch("/api/traffic", { cache: "no-store" }),
        ]);

        const routeData = await routeRes.json();
        const incidentData = await incidentRes.json();
        const trafficData = await trafficRes.json();

        if (!cancelled) {
          if (incidentData.ok && Array.isArray(incidentData.incidents)) {
            setLiveIncidents(incidentData.incidents);
          }
          if (trafficData.ok && Array.isArray(trafficData.segments)) setTrafficSeverity(trafficData.segments);
          if (routeData.ok && Array.isArray(routeData.routes) && routeData.routes.length > 0) {
            setRoutes(routeData.routes);
            setSelectedRouteId(initialRouteId(routeData.routes));
          }
        }
      } catch {
        // Fallback gracefully on mount
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainer.current) return;
    let disposed = false;

    async function initMap() {
      const { Map, NavigationControl, AttributionControl, setWorkerUrl } = await import("maplibre-gl");
      if (disposed || !mapContainer.current) return;

      setWorkerUrl("/maplibre-gl-worker.mjs");

      let fallbackUsed = false;
      const map = new Map({
        container: mapContainer.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [74.85, 12.875],
        zoom: 12.5,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new AttributionControl({ compact: true }), "bottom-right");

      map.on("error", () => {
        if (!fallbackUsed && map) {
          fallbackUsed = true;
          try {
            map.setStyle(createFallbackStyle());
          } catch {
            // Ignore fallback error
          }
        }
      });

      map.on("load", () => {
        if (disposed) return;
        mapRef.current = map;
        renderRoutesOnMap(map, routes, selectedRouteId, liveIncidents, trafficSeverity);
      });

      map.on("style.load", () => {
        if (disposed || !mapRef.current) return;
        renderRoutesOnMap(map, routes, selectedRouteId, liveIncidents, trafficSeverity);
      });
    }

    void initMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update map polylines whenever routes or incidents change
  useEffect(() => {
    if (mapRef.current) {
      renderRoutesOnMap(mapRef.current, routes, selectedRouteId, liveIncidents, trafficSeverity);
    }
  }, [routes, selectedRouteId, liveIncidents, trafficSeverity]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRoute = routes.find((r) => r.id === (selectedRouteId ?? routes[0]?.id));
  const selectedIncident = liveIncidents.find((incident) => incident.id === selectedIncidentId) ?? null;
  const selectedRouteWarnings = activeRoute?.incidents_on_route ?? [];
  const avoidingRoute = routes.find(route => route.avoids_incident && route.id !== activeRoute?.id) ?? null;
  const verifiedRouteImpact = selectedRouteWarnings.some((warning) => ["L3", "L4", "L6"].includes(warning.level));
  const hasClearAlternative = routes.some((route) => route.id !== activeRoute?.id && route.incidents_on_route.length === 0);
  const roadClosure = liveIncidents.find((incident) => incident.category === "road_closed");
  const closureLocation = roadClosure ? MANGALURU_PRESETS.reduce((closest, preset) => {
    const distance = Math.hypot(preset.coords[0] - roadClosure.lng, preset.coords[1] - roadClosure.lat);
    return distance < closest.distance ? { name: preset.name, distance } : closest;
  }, { name: "the reported location", distance: Number.POSITIVE_INFINITY }).name : null;
  const formatIncidentTime = (value: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

  return (
    <div className="space-y-4">
      {/* Search / Selection Card */}
      <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-surface-on">City Route Intelligence</h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-container text-surface-on-variant">
            ESTIMATED · FREE-FLOW ONLY
          </span>
        </div>

        <p className="text-xs text-surface-on-variant">
          Select any origin and destination across Mangaluru to calculate real driving paths, compare alternatives, and automatically detour around verified incidents.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Origin selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-surface-on flex items-center gap-1.5" htmlFor="start-select">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                Origin (Start A)
              </label>
              <button
                type="button"
                onClick={() => handleRequestGps("start")}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                📍 My location
              </button>
            </div>
            {useGpsStart && userLocation ? (
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
                <span>GPS fix ({userLocation[1].toFixed(4)}, {userLocation[0].toFixed(4)})</span>
                <button
                  type="button"
                  onClick={() => setUseGpsStart(false)}
                  className="text-[11px] font-semibold underline ml-2"
                >
                  Reset
                </button>
              </div>
            ) : (
              <select
                id="start-select"
                className="w-full text-xs rounded-lg border border-surface-container bg-surface-container-low px-3 py-2 text-surface-on"
                value={startIndex}
                onChange={(e) => {
                  setUseGpsStart(false);
                  setStartIndex(Number(e.target.value));
                }}
              >
                {MANGALURU_PRESETS.map((p, idx) => (
                  <option key={p.name} value={idx}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {gpsError && <p className="text-[11px] text-rose-600">{gpsError}</p>}
          </div>

          {/* Destination selector */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-surface-on flex items-center gap-1.5" htmlFor="dest-select">
              <span className="w-2 h-2 rounded-full bg-rose-600 inline-block" />
              Destination (End B)
            </label>
            <select
              id="dest-select"
              className="w-full text-xs rounded-lg border border-surface-container bg-surface-container-low px-3 py-2 text-surface-on"
              value={destIndex}
              onChange={(e) => setDestIndex(Number(e.target.value))}
            >
              {MANGALURU_PRESETS.map((p, idx) => (
                <option key={p.name} value={idx}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="button text-xs px-5 py-2 font-semibold"
              disabled={isPending}
              onClick={() => fetchRoutes(activeStart, activeDest)}
            >
              {isPending ? "Calculating paths…" : "Find Best Route"}
            </button>
            <button
              type="button"
              className="text-xs px-3 py-2 rounded-lg border border-surface-container bg-surface-container-low text-surface-on hover:bg-surface-container transition flex items-center gap-1.5 font-medium"
              onClick={() => setShowReportForm((prev) => !prev)}
            >
              <span>📢</span>
              <span>{showReportForm ? "Close Form" : "Report Incident"}</span>
            </button>
          </div>
          <span className="text-[11px] text-surface-on-variant">
            {liveIncidents.length} active live incident{liveIncidents.length !== 1 ? "s" : ""} on map
          </span>
        </div>
      </div>

      {reportFeedback && (
        <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container text-xs text-surface-on">
          {reportFeedback}
        </div>
      )}

      {/* Expandable Incident Reporting Form (Plan 4 Module 3) */}
      {showReportForm && (
        <form
          onSubmit={handleReportSubmit}
          className="p-4 rounded-xl bg-surface-container-lowest border border-primary/30 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-surface-on flex items-center gap-2">
              <span>📢</span> Report Road Incident at Your Location
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-surface-on-variant">
              L1–L3 SERVER VERIFICATION
            </span>
          </div>

          <p className="text-xs text-surface-on-variant">
            Sign in with a commuter account to submit. A recent device location is recorded as L2 location support; it does not prove the cause or congestion. When 3 distinct signed-in commuters report within 300m and 15 minutes, the server promotes the incident to L3 and can offer a route that avoids the reported area.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Category selection */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-surface-on" htmlFor="report-cat">
                Incident Type (17 PDF categories)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" role="group" aria-label="Incident category">
                {Object.entries(reportCategories).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={reportCategory === key}
                    className={`text-left text-[11px] px-2 py-1.5 rounded border ${reportCategory === key ? "border-primary bg-primary/10 font-bold" : "border-surface-container bg-surface-container-low"}`}
                    onClick={() => setReportCategory(key as ReportCategory)}>
                    {reportCategoryIcons[key as ReportCategory]} {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Incident Location */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-surface-on" htmlFor="report-loc">
                  Incident Location
                </label>
                <button
                  type="button"
                  onClick={() => handleRequestGps("report")}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  📍 Use device GPS
                </button>
              </div>
              {useGpsReport && userLocation ? (
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
                  <span>GPS fix ({userLocation[1].toFixed(4)}, {userLocation[0].toFixed(4)})</span>
                  <button
                    type="button"
                    onClick={() => setUseGpsReport(false)}
                    className="text-[11px] font-semibold underline ml-2"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <select
                  id="report-loc"
                  className="w-full text-xs rounded-lg border border-surface-container bg-surface-container-low px-3 py-2 text-surface-on"
                  value={reportLocationIndex}
                  onChange={(e) => {
                    setUseGpsReport(false);
                    setReportLocationIndex(Number(e.target.value));
                  }}
                >
                  {MANGALURU_PRESETS.map((p, idx) => (
                    <option key={p.name} value={idx}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Note input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-surface-on" htmlFor="report-note">
              Optional Note
            </label>
            <input
              id="report-note"
              type="text"
              placeholder="e.g. Near traffic signal, left lane blocked"
              className="w-full text-xs rounded-lg border border-surface-container bg-surface-container-low px-3 py-2 text-surface-on"
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg border border-surface-container text-surface-on-variant hover:bg-surface-container"
              onClick={() => setShowReportForm(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button text-xs px-5 py-1.5 font-semibold"
              disabled={isSubmittingReport}
            >
              {isSubmittingReport ? "Submitting…" : "Submit Incident Report"}
            </button>
          </div>
        </form>
      )}

      {statusMessage && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-100">
          {statusMessage}
        </div>
      )}

      {verifiedRouteImpact && !activeRoute?.avoids_incident && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="space-y-2">
            <p className="text-xs font-bold text-rose-900 dark:text-rose-100">Your selected route intersects a reported incident</p>
            <p className="text-xs text-rose-800 dark:text-rose-200">{selectedRouteWarnings[0].label}. Choose whether to avoid it; this is not a safety guarantee.</p>
            {avoidingRoute && <button type="button" className="button text-xs px-3 py-1.5" onClick={() => setSelectedRouteId(avoidingRoute.id)}>
              Avoid this route · {formatRouteDuration(avoidingRoute.duration_s)} free-flow
            </button>}
          </div>
        </div>
      )}

      {verifiedRouteImpact && !hasClearAlternative && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 flex items-start gap-3">
          <span className="text-xl">⛔</span>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-rose-900 dark:text-rose-100">No clear alternative route found</p>
            <p className="text-xs text-rose-800 dark:text-rose-200">Available route options also pass near reported incidents. This planner cannot assess road safety; delay travel and check official road guidance.</p>
          </div>
        </div>
      )}

      {roadClosure && closureLocation && (
        <div role="status" className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-100">
          <strong>Road closure reported near {closureLocation}.</strong> It has {roadClosure.report_count} signed-in report{roadClosure.report_count === 1 ? "" : "s"} and is currently {roadClosure.level}; inspect its marker before travelling.
        </div>
      )}

      {/* Incident Avoidance Banner (when re-routing triggered) */}
      {activeRoute?.avoids_incident && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-400 dark:border-amber-800 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-100">
              Avoiding the reported incident
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {activeRoute.avoided_incident_reason}. You chose this alternative. Travel times are free-flow estimates only.
            </p>
          </div>
        </div>
      )}

      {selectedIncident && (
        <section className="p-4 rounded-xl bg-surface-container-lowest border border-primary/30 shadow-sm space-y-3" aria-labelledby="selected-incident-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono text-surface-on-variant">SELECTED MAP INCIDENT</p>
              <h3 id="selected-incident-title" className="text-base font-bold text-surface-on">{reportCategoryIcons[selectedIncident.category]} {reportCategories[selectedIncident.category]}</h3>
            </div>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedIncidentId(null)}>Close details</button>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><dt className="text-surface-on-variant">Verification</dt><dd className="font-semibold text-surface-on mt-0.5">{selectedIncident.level} · {selectedIncident.provenance}</dd></div>
            <div><dt className="text-surface-on-variant">Reports</dt><dd className="font-semibold text-surface-on mt-0.5">{selectedIncident.report_count}</dd></div>
            <div><dt className="text-surface-on-variant">First reported</dt><dd className="font-semibold text-surface-on mt-0.5">{formatIncidentTime(selectedIncident.first_reported_at)} IST</dd></div>
            <div><dt className="text-surface-on-variant">Status</dt><dd className="font-semibold text-surface-on mt-0.5 capitalize">{selectedIncident.status}</dd></div>
          </dl>
          <p className="text-xs text-surface-on-variant">{selectedIncident.level_reason}</p>
          <p className="text-[11px] text-surface-on-variant">This open incident expires if it receives no new confirmation by {formatIncidentTime(new Date(Date.parse(selectedIncident.last_confirmed_at) + 3 * 60 * 60 * 1000).toISOString())} IST.</p>
        </section>
      )}

      {/* Map display */}
      <div className="relative rounded-xl overflow-hidden border border-surface-container shadow-sm bg-surface-container-low">
        <div ref={mapContainer} className="w-full h-80 sm:h-96" />
        <div className="absolute top-2 left-2 bg-surface-container-lowest/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-surface-container text-[11px] space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-blue-600 rounded" />
            <span className="font-semibold text-surface-on">Recommended route</span>
          </div>
          {routes.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-slate-500 rounded border-dashed" />
              <span className="text-surface-on-variant">Alternative path</span>
            </div>
          )}
          <div className="pt-1 mt-1 border-t border-surface-container text-surface-on-variant">Current reports</div>
          <div className="flex items-center gap-2"><span className="w-3 h-1 bg-emerald-600 rounded" /><span className="text-surface-on-variant">Clear</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-1 bg-amber-500 rounded" /><span className="text-surface-on-variant">Reported / corroborated</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-1 bg-orange-600 rounded" /><span className="text-surface-on-variant">L4 slowdown support</span></div>
        </div>
      </div>

      {/* Route Cards */}
      {routes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {routes.map((r, index) => {
            const isSelected = r.id === (selectedRouteId ?? routes[0]?.id);
            return (
              <div
                key={r.id}
                onClick={() => setSelectedRouteId(r.id)}
                className={`p-4 rounded-xl border transition cursor-pointer space-y-2 ${
                  isSelected
                    ? "bg-primary/5 border-primary shadow-sm"
                    : "bg-surface-container-lowest border-surface-container hover:bg-surface-container-low"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-surface-on flex items-center gap-1.5">
                    {r.is_recommended && <span className="text-primary font-bold">★ Recommended</span>}
                    {!r.is_recommended && <span className="text-surface-on-variant">Option {index + 1}</span>}
                  </span>
                  {r.avoids_incident && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-100">
                      Detour
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-surface-on">
                    {formatRouteDuration(r.duration_s)}
                  </span>
                  <span className="text-sm font-medium text-surface-on-variant">
                    {formatRouteDistance(r.distance_m)}
                  </span>
                </div>

                <p className="text-xs text-surface-on-variant leading-tight">
                  {r.name} · free-flow estimate
                </p>

                {r.incidents_on_route.length > 0 && (
                  <div className="pt-1 text-[11px] text-amber-700 dark:text-amber-300">
                    ⚠️ Passes near {r.incidents_on_route.length} reported incident ({r.incidents_on_route[0].label})
                  </div>
                )}

                {isSelected && (
                  <div className="pt-2 border-t border-surface-container flex items-center justify-between">
                    <span className="text-[11px] text-surface-on-variant">Ready to commute?</span>
                    <Link
                      href="/workspace"
                      className="text-xs font-semibold px-3 py-1 rounded bg-primary text-primary-on hover:opacity-90 transition"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Track this journey →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
