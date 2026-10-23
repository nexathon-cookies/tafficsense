"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import type { Map as MapInstance, Marker as MarkerInstance } from "maplibre-gl";
import { formatRouteDuration, formatRouteDistance, type RouteOption } from "@/lib/routing/types";
import { reportCategories, reportCategoryIcons, type ReportCategory } from "@/lib/reports/rules";
import type { LiveIncident } from "@/lib/incidents/server";
import { createFallbackStyle } from "@/lib/traffic/mangaluru-basemap";
import "maplibre-gl/dist/maplibre-gl.css";

import { MANGALURU_PRESETS } from "@/lib/routing/presets";
export { MANGALURU_PRESETS };


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

  useEffect(() => {
    if (!showReportForm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowReportForm(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showReportForm]);

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

  // Initialize route & incidents on mount, reading ?from=...&to=... if present
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        let currentStart = activeStart;
        let currentDest = activeDest;

        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const fromParam = params.get("from");
          const toParam = params.get("to");

          if (fromParam) {
            const idx = MANGALURU_PRESETS.findIndex((p) =>
              p.name.toLowerCase().includes(fromParam.toLowerCase())
            );
            if (idx !== -1) {
              setStartIndex(idx);
              currentStart = MANGALURU_PRESETS[idx].coords;
            }
          }

          if (toParam) {
            const idx = MANGALURU_PRESETS.findIndex((p) =>
              p.name.toLowerCase().includes(toParam.toLowerCase())
            );
            if (idx !== -1) {
              setDestIndex(idx);
              currentDest = MANGALURU_PRESETS[idx].coords;
            }
          }
        }

        const [routeRes, incidentRes, trafficRes] = await Promise.all([
          fetch("/api/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: currentStart, destination: currentDest }),
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
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      {/* Fullscreen Map Canvas */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Floating Directions Drawer (Top-Left) */}
      <aside className="absolute top-4 left-4 z-20 w-80 sm:w-[420px] max-h-[calc(100vh-95px)] flex flex-col bg-surface/95 dark:bg-surface-dim/95 backdrop-blur-md rounded-2xl border border-surface-container shadow-2xl overflow-hidden pointer-events-auto">
        <div className="p-3.5 pb-2.5 border-b border-surface-container bg-surface-container-low/60 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-surface-on flex items-center gap-1.5 m-0">
              <span>🗺️</span>
              <span>City Route Intelligence</span>
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-surface-on-variant">
              FREE-FLOW
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
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
              className="button secondary text-xs px-3 py-2 font-medium flex items-center gap-1.5"
              onClick={() => setShowReportForm(true)}
            >
              <span>📢</span>
              <span>Report Incident</span>
            </button>
          </div>
          <span className="text-[11px] text-surface-on-variant">
            {liveIncidents.length} active live incident{liveIncidents.length !== 1 ? "s" : ""} on map
          </span>
        </div>
      </div>

      {/* Scrollable Drawer Body */}
      <div className="overflow-y-auto p-3.5 space-y-3 flex-1">
        {reportFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-sm ${
              reportFeedback.startsWith("❌")
                ? "bg-rose-50 dark:bg-rose-950 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100"
                : "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{reportFeedback.startsWith("❌") ? "⚠️" : "✓"}</span>
              <span>{reportFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setReportFeedback(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100 px-1"
              aria-label="Dismiss feedback"
            >
              ✕
            </button>
          </div>
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

        {/* Route Cards */}
        {routes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-surface-on-variant uppercase tracking-wider">Calculated Routes</span>
              <span className="text-[10px] text-surface-on-variant">{routes.length} options</span>
            </div>
            {routes.map((r, index) => {
              const isSelected = r.id === (selectedRouteId ?? routes[0]?.id);
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRouteId(r.id)}
                  className={`p-3 rounded-xl border transition cursor-pointer space-y-1.5 ${
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

                  <div className="flex items-baseline gap-2.5">
                    <span className="text-xl font-bold text-surface-on">
                      {formatRouteDuration(r.duration_s)}
                    </span>
                    <span className="text-xs font-medium text-surface-on-variant">
                      {formatRouteDistance(r.distance_m)}
                    </span>
                  </div>

                  <p className="text-xs text-surface-on-variant leading-tight m-0">
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
    </aside>

    {/* Floating Selected Incident Card (Bottom-Right) */}
    {selectedIncident && (
      <section className="absolute bottom-6 right-4 sm:right-6 z-20 w-[calc(100vw-2rem)] sm:w-96 bg-surface/95 dark:bg-surface-dim/95 backdrop-blur-md rounded-2xl border border-surface-container shadow-2xl p-4 space-y-2.5 pointer-events-auto" aria-labelledby="selected-incident-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-mono text-surface-on-variant">SELECTED MAP INCIDENT</p>
            <h3 id="selected-incident-title" className="text-base font-bold text-surface-on flex items-center gap-1.5 mt-0.5">
              <span>{reportCategoryIcons[selectedIncident.category]}</span>
              <span>{reportCategories[selectedIncident.category]}</span>
            </h3>
          </div>
          <button type="button" className="text-xs text-surface-on-variant hover:text-surface-on p-1" onClick={() => setSelectedIncidentId(null)} aria-label="Close">✕</button>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs m-0">
          <div><dt className="text-surface-on-variant">Verification</dt><dd className="font-semibold text-surface-on mt-0.5">{selectedIncident.level} · {selectedIncident.provenance}</dd></div>
          <div><dt className="text-surface-on-variant">Reports</dt><dd className="font-semibold text-surface-on mt-0.5">{selectedIncident.report_count}</dd></div>
          <div><dt className="text-surface-on-variant">Reported</dt><dd className="font-semibold text-surface-on mt-0.5">{formatIncidentTime(selectedIncident.first_reported_at)} IST</dd></div>
          <div><dt className="text-surface-on-variant">Status</dt><dd className="font-semibold text-surface-on mt-0.5 capitalize">{selectedIncident.status}</dd></div>
        </dl>
        <p className="text-xs text-surface-on-variant m-0">{selectedIncident.level_reason}</p>
        <p className="text-[11px] text-surface-on-variant m-0">This open incident expires if it receives no new confirmation by {formatIncidentTime(new Date(Date.parse(selectedIncident.last_confirmed_at) + 3 * 60 * 60 * 1000).toISOString())} IST.</p>
      </section>
    )}

    {/* Floating Bottom-Right Map Controls & Legend */}
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-auto">
      <button
        type="button"
        onClick={() => {
          const selected = routes.find((r) => r.id === (selectedRouteId ?? routes[0]?.id));
          if (mapRef.current && selected && selected.geometry.coordinates.length > 0) {
            import("maplibre-gl").then(({ LngLatBounds }) => {
              const bounds = new LngLatBounds();
              for (const coord of selected.geometry.coordinates) {
                bounds.extend(coord as [number, number]);
              }
              mapRef.current?.fitBounds(bounds, { padding: 50, maxZoom: 15 });
            });
          } else {
            mapRef.current?.flyTo({ center: [74.856, 12.870], zoom: 13, duration: 800 });
          }
        }}
        className="px-3 py-1.5 rounded-xl bg-surface/95 backdrop-blur border border-surface-container shadow-md text-xs font-semibold text-surface-on hover:bg-surface-container flex items-center gap-1.5"
        title="Recenter route view"
      >
        <span>🎯</span>
        <span>Recenter Route</span>
      </button>
      <div className="text-[11px] bg-surface/80 backdrop-blur px-2.5 py-1 rounded-lg border border-surface-container/60 shadow-xs flex items-center gap-2 text-surface-on-variant">
        <span className="w-2.5 h-1 bg-blue-600 rounded" />
        <span>Recommended</span>
        <span className="w-2.5 h-1 bg-slate-500 rounded border-dashed" />
        <span>Alternative</span>
        <span>·</span>
        <a href="/map-notices.txt" target="_blank" rel="noreferrer" className="hover:underline">Notices</a>
      </div>
    </div>

    {/* Incident Reporting Modal (Plan 4 Module 3) */}
    {showReportForm && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowReportForm(false);
        }}
      >
        <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl border border-surface-container overflow-hidden flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-surface-container flex items-center justify-between bg-surface-container-low/50">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📢</span>
              <div>
                <h3 id="report-modal-title" className="text-sm sm:text-base font-bold text-surface-on m-0">
                  Report Road Incident at Your Location
                </h3>
                <p className="text-[11px] text-surface-on-variant m-0 mt-0.5">
                  Dispatched to server verification queue · OpenStreetMap
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-surface-on-variant hidden sm:inline-block">
                L1–L3 SERVER VERIFICATION
              </span>
              <button
                type="button"
                onClick={() => setShowReportForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-surface-on-variant text-base font-bold transition"
                aria-label="Close report modal"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Body Form */}
          <form onSubmit={handleReportSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Verification explanation banner */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-surface-container text-xs text-surface-on-variant space-y-1">
              <p className="font-semibold text-surface-on">Commuter Verification Pipeline</p>
              <p>
                Sign in with a commuter account to submit. Initial reports record your device location as L2 support. When 3 distinct signed-in commuters report within 300m and 15 minutes, the server promotes the incident to <strong>L3 Corroborated</strong> and automatically offers alternative detours.
              </p>
            </div>

            {/* Category selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-surface-on" htmlFor="report-cat-dropdown">
                  1. Incident Type
                </label>
                <span className="text-[11px] text-surface-on-variant">17 PDF categories</span>
              </div>

              {/* Quick select buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-label="Incident category quick select">
                {[
                  { id: "accident", label: "Accident", icon: "💥" },
                  { id: "road_closed", label: "Road Closure", icon: "⛔" },
                  { id: "flood", label: "Flood / Waterlog", icon: "🌊" },
                  { id: "road_repair", label: "Road Repair", icon: "🚧" },
                  { id: "heavy_traffic", label: "Heavy Traffic", icon: "🚙" },
                  { id: "fallen_tree", label: "Tree / Hazard", icon: "🌲" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={reportCategory === item.id}
                    onClick={() => setReportCategory(item.id as ReportCategory)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-medium transition ${
                      reportCategory === item.id
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm ring-1 ring-primary"
                        : "border-surface-container bg-surface-container-low text-surface-on hover:bg-surface-container"
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* All 17 categories select dropdown */}
              <div className="pt-1">
                <label htmlFor="report-cat-dropdown" className="text-[11px] text-surface-on-variant block mb-1">
                  Or pick from all 17 categories:
                </label>
                <select
                  id="report-cat-dropdown"
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                  className="w-full text-xs rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-surface-on focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {Object.entries(reportCategories).map(([key, label]) => (
                    <option key={key} value={key}>
                      {reportCategoryIcons[key as ReportCategory]} {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Incident Location */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-surface-on" htmlFor="report-loc">
                  2. Incident Location (Mangaluru)
                </label>
                <button
                  type="button"
                  onClick={() => handleRequestGps("report")}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-medium border transition ${
                    useGpsReport
                      ? "bg-primary text-white border-primary"
                      : "bg-surface-container-low border-surface-container text-primary hover:bg-surface-container"
                  }`}
                >
                  {useGpsReport ? "📍 Using Device GPS" : "📍 Use device GPS"}
                </button>
              </div>

              {useGpsReport && userLocation ? (
                <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
                  <span className="font-mono">
                    GPS Fix: {userLocation[1].toFixed(5)}° N, {userLocation[0].toFixed(5)}° E
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseGpsReport(false)}
                    className="text-[11px] font-semibold text-primary underline ml-2"
                  >
                    Switch to preset
                  </button>
                </div>
              ) : (
                <select
                  id="report-loc"
                  className="w-full text-xs rounded-xl border border-surface-container bg-surface-container-low px-3 py-2.5 text-surface-on focus:outline-none focus:ring-2 focus:ring-primary/40"
                  value={reportLocationIndex}
                  onChange={(e) => {
                    setUseGpsReport(false);
                    setReportLocationIndex(Number(e.target.value));
                  }}
                >
                  {MANGALURU_PRESETS.map((p, idx) => (
                    <option key={p.name} value={idx}>
                      {p.name} ({p.coords[1].toFixed(4)}° N, {p.coords[0].toFixed(4)}° E)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Optional Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-surface-on" htmlFor="report-note">
                3. Observed Details (Optional)
              </label>
              <input
                id="report-note"
                type="text"
                placeholder="e.g. Near traffic signal, left lane blocked, water depth ~1 ft"
                className="w-full text-xs rounded-xl border border-surface-container bg-surface-container-low px-3 py-2.5 text-surface-on placeholder:text-surface-on-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-surface-container flex items-center justify-end gap-2.5">
              <button
                type="button"
                className="button secondary text-xs px-4 py-2 font-medium"
                onClick={() => setShowReportForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button text-xs px-5 py-2 font-bold"
                disabled={isSubmittingReport}
              >
                {isSubmittingReport ? "Submitting Report…" : "Submit Incident Report"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
);
}
