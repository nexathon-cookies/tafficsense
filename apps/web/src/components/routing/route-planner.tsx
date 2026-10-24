"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import type { Map as MapInstance, Marker as MarkerInstance } from "maplibre-gl";
import { formatRouteDuration, formatRouteDistance, type RouteOption } from "@/lib/routing/types";
import type { DetourRouteDetails } from "@/lib/routing/reroute";
import { reportCategories, reportCategoryIcons, type ReportCategory } from "@/lib/reports/rules";
import type { LiveIncident } from "@/lib/incidents/server";
import { createFallbackStyle } from "@/lib/traffic/mangaluru-basemap";
import "maplibre-gl/dist/maplibre-gl.css";

import { MANGALURU_PRESETS } from "@/lib/routing/presets";
import { L5PhotoPanel, toL5Category } from "@/components/reports/l5-photo-panel";
import type { L5VerificationResult } from "@/lib/vision/verify-incident-photo";
export { MANGALURU_PRESETS };

function createGeoJsonCircle(center: [number, number], radiusM = 250, points = 32) {
  const [lng, lat] = center;
  const latR = radiusM / 111000;
  const lngR = radiusM / (111000 * Math.cos((lat * Math.PI) / 180));
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lng + lngR * Math.cos(theta), lat + latR * Math.sin(theta)]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [coords],
    },
  };
}

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
  const [customStartCoord, setCustomStartCoord] = useState<[number, number] | null>(null);
  const [isPickingLocation, setIsPickingLocation] = useState<boolean>(false);
  const isPickingLocationRef = useRef<boolean>(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [useGpsStart, setUseGpsStart] = useState<boolean>(false);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeDetour, setActiveDetour] = useState<DetourRouteDetails | null>(null);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [showCoordinatesId, setShowCoordinatesId] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);

  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [trafficSeverity, setTrafficSeverity] = useState<TrafficSeveritySegment[]>([]);
  const [showTrafficOverlay, setShowTrafficOverlay] = useState<boolean>(false);
  const [dismissRoadClosure, setDismissRoadClosure] = useState<boolean>(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDrawerExpanded, setIsDrawerExpanded] = useState<boolean>(false);

  // Incident reporting state
  const [showReportForm, setShowReportForm] = useState<boolean>(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory>("accident");
  const [reportLocationIndex, setReportLocationIndex] = useState<number>(0);
  const [useGpsReport, setUseGpsReport] = useState<boolean>(false);
  const [reportNote, setReportNote] = useState<string>("");
  const [reportL5Result, setReportL5Result] = useState<L5VerificationResult | null>(null);
  const handleReportL5Result = useCallback((r: L5VerificationResult | null) => setReportL5Result(r), []);
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
  const activeStart: [number, number] = customStartCoord
    ? customStartCoord
    : useGpsStart && userLocation
    ? userLocation
    : MANGALURU_PRESETS[startIndex].coords;
  const activeDest: [number, number] = MANGALURU_PRESETS[destIndex].coords;

  useEffect(() => {
    isPickingLocationRef.current = isPickingLocation;
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = isPickingLocation ? "crosshair" : "";
    }
  }, [isPickingLocation]);

  // Dynamic reroute calculation avoiding a specific incident
  async function handleDynamicReroute(incidentId: string) {
    setIsRecalculating(true);
    setRecalculateError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/route/reroute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentLocation: activeStart,
          destination: activeDest,
          blockedIncidentId: incidentId,
          exclusionRadiusM: 200,
        }),
      });

      const data = await res.json();
      if (!data.ok || !data.detourRoute) {
        setRecalculateError(data.error || "No viable road detour found around this incident.");
        return;
      }

      const detour: DetourRouteDetails = data.detourRoute;
      setActiveDetour(detour);
      setRoutes((prev) => [detour, ...prev.filter((r) => r.id !== detour.id)]);
      setSelectedRouteId(detour.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setRecalculateError(`Could not recalculate detour: ${msg}`);
    } finally {
      setIsRecalculating(false);
    }
  }

  // Request browser GPS position
  function handleRequestGps(target: "start" | "report" = "start") {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported by your browser.");
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
        setStatusMessage(`Location was not shared (${err.message}). Choose a map location or allow location access to report from your position.`);
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

  const handleSwap = () => {
    const oldStart = startIndex;
    const oldDest = destIndex;
    setStartIndex(oldDest);
    setDestIndex(oldStart);
    setUseGpsStart(false);
    setCustomStartCoord(null);
    setActiveDetour(null);
    setRecalculateError(null);
    fetchRoutes(MANGALURU_PRESETS[oldDest].coords, MANGALURU_PRESETS[oldStart].coords);
  };

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

    const isL5Verified = Boolean(
      reportL5Result &&
        reportL5Result.source === "gemini" &&
        reportL5Result.isGenuineIncident &&
        reportL5Result.confidenceTier !== "low",
    );

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
          l5_verified: isL5Verified,
          l5_summary: isL5Verified ? (reportL5Result?.visualSummary ?? null) : null,
          l5_photo_data_url: isL5Verified ? (reportL5Result?.photoDataUrl ?? null) : null,
          l5_confidence_tier: isL5Verified ? (reportL5Result?.confidenceTier ?? null) : null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        const reporters = typeof data.distinct_reporters === "number" ? data.distinct_reporters : 1;
        setReportFeedback(`Reported. ${reporters} ${reporters === 1 ? "person has" : "people have"} reported this.`);
        setReportNote("");
        setReportL5Result(null);
        setShowReportForm(false);
        if (data.incident_id) {
          setSelectedIncidentId(data.incident_id);
        }
        if (mapRef.current) {
          mapRef.current.flyTo({ center: reportCoords, zoom: 15, duration: 800 });
        }
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
    severityList: TrafficSeveritySegment[],
    showAllTraffic: boolean
  ) => {
    if (!map.isStyleLoaded()) {
      map.once("style.load", () => {
        renderRoutesOnMap(map, routeList, selectedId, incidentList, severityList, showAllTraffic);
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
    if (map.getLayer("hazard-buffer-line")) map.removeLayer("hazard-buffer-line");
    if (map.getLayer("hazard-buffer-fill")) map.removeLayer("hazard-buffer-fill");
    if (map.getSource("hazard-buffer-geojson")) map.removeSource("hazard-buffer-geojson");
    if (map.getLayer("traffic-severity-layer")) map.removeLayer("traffic-severity-layer");
    if (map.getSource("traffic-severity-geojson")) map.removeSource("traffic-severity-geojson");

    // Only render corridor segments when enabled, or show only active slowdowns/reports
    const visibleSeverity = showAllTraffic
      ? severityList
      : severityList.filter((segment) => segment.severity !== "clear");

    if (visibleSeverity.length > 0) {
      map.addSource("traffic-severity-geojson", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: visibleSeverity.map((segment) => ({
            type: "Feature" as const,
            properties: { severity: segment.severity, name: segment.name, provenance: segment.provenance },
            geometry: segment.geometry,
          })),
        },
      });
      map.addLayer({
        id: "traffic-severity-layer",
        type: "line",
        source: "traffic-severity-geojson",
        paint: {
          "line-color": [
            "match",
            ["get", "severity"],
            "slowdown",
            severityColours.slowdown,
            "corroborated",
            severityColours.corroborated,
            "reported",
            severityColours.reported,
            severityColours.clear,
          ],
          "line-width": 6,
          "line-opacity": 0.55,
        },
      });
    }

    const selectedRoute = routeList.find((r) => r.id === (selectedId ?? routeList[0]?.id));
    const activeAvoidedPoint = activeDetour?.avoidedIncident?.point;

    // Draw hazard buffer circle if a detour avoiding an incident is selected
    if (selectedRoute?.avoids_incident && activeAvoidedPoint) {
      map.addSource("hazard-buffer-geojson", {
        type: "geojson",
        data: createGeoJsonCircle(activeAvoidedPoint, 250),
      });
      map.addLayer({
        id: "hazard-buffer-fill",
        type: "fill",
        source: "hazard-buffer-geojson",
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": 0.22,
        },
      });
      map.addLayer({
        id: "hazard-buffer-line",
        type: "line",
        source: "hazard-buffer-geojson",
        paint: {
          "line-color": "#dc2626",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
    }

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

    // Layer 2: Selected / recommended route (Emerald green if detour, Blue if standard)
    map.addLayer({
      id: "routes-primary-layer",
      type: "line",
      source: "routes-geojson",
      filter: ["==", ["get", "id"], selectedId ?? routeList[0]?.id ?? ""],
      paint: {
        "line-color": selectedRoute?.avoids_incident ? "#059669" : "#2563eb",
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });

    // Add Start, Destination, and Incident markers
    import("maplibre-gl").then(({ Marker, LngLatBounds }) => {
      // Start Marker (Green / Commuter Pin)
      const startEl = document.createElement("div");
      startEl.className = "w-6 h-6 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center text-[10px] text-white font-bold";
      startEl.title = `Origin: ${activeStart[1].toFixed(5)}, ${activeStart[0].toFixed(5)}`;
      startEl.textContent = customStartCoord ? "📍" : useGpsStart ? "GPS" : "A";
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

      // Detour Waypoint Marker (if active detour exists)
      if (selectedRoute?.avoids_incident && activeDetour?.bypassWaypoint) {
        const wpEl = document.createElement("div");
        wpEl.className = "px-2 py-0.5 rounded-full bg-emerald-700 text-white shadow-md flex items-center gap-1 text-[10px] font-bold border border-white";
        wpEl.title = `Detour waypoint: ${activeDetour.bypassStreetName || "alternative road"}`;
        wpEl.innerHTML = `<span>🔄</span><span>Via ${activeDetour.bypassStreetName || "Detour Road"}</span>`;
        const wpMarker = new Marker({ element: wpEl })
          .setLngLat(activeDetour.bypassWaypoint)
          .addTo(map);
        markersRef.current.push(wpMarker);
      }

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

      map.on("click", (e) => {
        if (isPickingLocationRef.current) {
          const clickedCoord: [number, number] = [
            Number(e.lngLat.lng.toFixed(6)),
            Number(e.lngLat.lat.toFixed(6)),
          ];
          setCustomStartCoord(clickedCoord);
          setIsPickingLocation(false);
          fetchRoutes(clickedCoord, activeDest);
        }
      });

      map.on("load", () => {
        if (disposed) return;
        mapRef.current = map;
        renderRoutesOnMap(map, routes, selectedRouteId, liveIncidents, trafficSeverity, showTrafficOverlay);
      });

      map.on("style.load", () => {
        if (disposed || !mapRef.current) return;
        renderRoutesOnMap(map, routes, selectedRouteId, liveIncidents, trafficSeverity, showTrafficOverlay);
      });
    }

    void initMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update map polylines whenever routes, incidents, activeDetour, or traffic overlay change
  useEffect(() => {
    if (mapRef.current) {
      renderRoutesOnMap(mapRef.current, routes, selectedRouteId, liveIncidents, trafficSeverity, showTrafficOverlay);
    }
  }, [routes, selectedRouteId, liveIncidents, trafficSeverity, activeDetour, activeStart, activeDest, showTrafficOverlay]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRoute = routes.find((r) => r.id === (selectedRouteId ?? routes[0]?.id));
  const selectedIncident = liveIncidents.find((incident) => incident.id === selectedIncidentId) ?? null;
  const selectedRouteWarnings = activeRoute?.incidents_on_route ?? [];
  const avoidingRoute = routes.find(route => route.avoids_incident && route.id !== activeRoute?.id) ?? null;
  const verifiedRouteImpact = selectedRouteWarnings.some((warning) => ["L3", "L4", "L5", "L6"].includes(warning.level));
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

      {/* Google Maps Style Floating Search & Direction Card (Top) */}
      <div className="absolute top-3 inset-x-3 sm:left-4 sm:right-auto sm:w-[420px] z-30 pointer-events-auto">
        <div className="bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-surface-container shadow-xl p-3 sm:p-3.5 space-y-2.5">
          {/* Header Row: Title & Live Telemetry */}
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold text-surface-on flex items-center gap-1.5 m-0">
              <span>🗺️</span>
              <span>City Route Intelligence</span>
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-semibold text-surface-on-variant">
                LIVE · {liveIncidents.length} hazard{liveIncidents.length === 1 ? "" : "s"}
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-container text-surface-on-variant border border-surface-container-highest">
                FREE-FLOW
              </span>
            </div>
          </div>

          {/* Google Maps Connected Origin & Destination Inputs */}
          <div className="flex items-center gap-2 bg-surface-container-low/60 rounded-xl p-2 border border-surface-container/60">
            {/* Visual Route Connector Track */}
            <div className="flex flex-col items-center justify-between py-1 self-stretch shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-200" />
              <div className="w-0.5 flex-1 my-1 border-l-2 border-dotted border-surface-on-variant/30" />
              <div className="w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-rose-200" />
            </div>

            {/* Inputs Column */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {/* Origin Row */}
              <div className="flex items-center gap-1.5 min-w-0">
                {isPickingLocation ? (
                  <div className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-center justify-between animate-pulse">
                    <span className="truncate">🎯 Click map for origin…</span>
                    <button
                      type="button"
                      onClick={() => setIsPickingLocation(false)}
                      className="text-[10px] font-bold text-amber-900 underline ml-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : customStartCoord ? (
                  <div className="flex-1 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 min-w-0">
                    <span className="font-medium truncate">📍 {customStartCoord[1].toFixed(4)}, {customStartCoord[0].toFixed(4)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStartCoord(null);
                        setActiveDetour(null);
                        setRecalculateError(null);
                        fetchRoutes(MANGALURU_PRESETS[startIndex].coords, activeDest);
                      }}
                      className="text-[10px] font-bold underline ml-1 shrink-0"
                    >
                      Reset
                    </button>
                  </div>
                ) : useGpsStart && userLocation ? (
                  <div className="flex-1 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 min-w-0">
                    <span className="font-medium truncate">GPS: {userLocation[1].toFixed(4)}, {userLocation[0].toFixed(4)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setUseGpsStart(false);
                        setActiveDetour(null);
                        setRecalculateError(null);
                        fetchRoutes(MANGALURU_PRESETS[startIndex].coords, activeDest);
                      }}
                      className="text-[10px] font-bold underline ml-1 shrink-0"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <select
                    id="start-select"
                    aria-label="Origin starting location"
                    className="flex-1 text-xs font-semibold rounded-lg border border-surface-container bg-surface px-2.5 py-1.5 text-surface-on shadow-2xs focus:ring-1 focus:ring-primary outline-none transition truncate"
                    value={startIndex}
                    onChange={(e) => {
                      const newIdx = Number(e.target.value);
                      setUseGpsStart(false);
                      setCustomStartCoord(null);
                      setStartIndex(newIdx);
                      setActiveDetour(null);
                      setRecalculateError(null);
                      fetchRoutes(MANGALURU_PRESETS[newIdx].coords, activeDest);
                    }}
                  >
                    {MANGALURU_PRESETS.map((p, idx) => (
                      <option key={p.name} value={idx}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Quick GPS & Map Pick Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartCoord(null);
                      setIsPickingLocation(false);
                      handleRequestGps("start");
                    }}
                    className="text-[11px] px-2 py-1.5 rounded-lg bg-surface hover:bg-surface-container text-primary font-bold border border-surface-container transition shadow-2xs"
                    title="Use GPS current position"
                  >
                    📍
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseGpsStart(false);
                      setIsPickingLocation(!isPickingLocation);
                    }}
                    className={`text-[11px] px-2 py-1.5 rounded-lg font-bold border transition shadow-2xs ${
                      isPickingLocation
                        ? "bg-amber-100 text-amber-900 border-amber-300 font-bold"
                        : "bg-surface hover:bg-surface-container text-primary border-surface-container"
                    }`}
                    title="Pick origin point on map"
                  >
                    {isPickingLocation ? "✕" : "🎯"}
                  </button>
                </div>
              </div>

              {/* Destination Row */}
              <div className="flex items-center gap-1.5 min-w-0">
                <select
                  id="dest-select"
                  aria-label="Destination location"
                  className="w-full text-xs font-semibold rounded-lg border border-surface-container bg-surface px-2.5 py-1.5 text-surface-on shadow-2xs focus:ring-1 focus:ring-primary outline-none transition truncate"
                  value={destIndex}
                  onChange={(e) => {
                    const newIdx = Number(e.target.value);
                    setDestIndex(newIdx);
                    setActiveDetour(null);
                    setRecalculateError(null);
                    fetchRoutes(activeStart, MANGALURU_PRESETS[newIdx].coords);
                  }}
                >
                  {MANGALURU_PRESETS.map((p, idx) => (
                    <option key={p.name} value={idx}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Invert / Swap Button */}
            <button
              type="button"
              onClick={handleSwap}
              className="w-8 h-8 rounded-full border border-surface-container bg-surface hover:bg-surface-container flex items-center justify-center text-xs font-bold text-surface-on shadow-2xs transition shrink-0"
              title="Swap origin and destination"
              aria-label="Swap origin and destination"
            >
              ⇅
            </button>
          </div>

          {/* Quick Filter / Action Pills Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
            <button
              type="button"
              disabled={isPending || isRecalculating}
              onClick={() => {
                setActiveDetour(null);
                setRecalculateError(null);
                fetchRoutes(activeStart, activeDest);
              }}
              className="px-2.5 py-1 rounded-full bg-primary text-white hover:bg-primary-hover font-bold transition whitespace-nowrap text-[11px] flex items-center gap-1 shadow-2xs"
            >
              <span>{isPending ? "⏳" : "🔍"}</span>
              <span>{isPending ? "Calculating…" : "Find Best Route"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTrafficOverlay((prev) => !prev)}
              className={`px-2.5 py-1 rounded-full border transition whitespace-nowrap text-[11px] font-semibold flex items-center gap-1 ${
                showTrafficOverlay
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                  : "bg-surface-container hover:bg-surface-container-high text-surface-on border-surface-container"
              }`}
            >
              <span>🚦</span>
              <span>Traffic {showTrafficOverlay ? "On" : "Off"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowReportForm(true)}
              className="px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-surface-on border border-surface-container transition whitespace-nowrap text-[11px] font-semibold flex items-center gap-1"
            >
              <span>📢</span>
              <span>Report Hazard</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Maps Style Expandable Bottom Sheet */}
      <aside
        className={`absolute bottom-0 inset-x-0 sm:left-4 sm:bottom-4 sm:inset-x-auto sm:w-[420px] z-20 flex flex-col bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md rounded-t-3xl sm:rounded-2xl border border-surface-container shadow-2xl overflow-hidden pointer-events-auto transition-all duration-300 ease-in-out ${
          isDrawerExpanded
            ? "max-h-[75vh] sm:max-h-[calc(100vh-220px)]"
            : "max-h-[145px]"
        }`}
      >
        {/* Drag Handle & Summary Row (Always Visible) */}
        <div
          onClick={() => setIsDrawerExpanded((prev) => !prev)}
          className="p-3 pb-2.5 border-b border-surface-container/60 cursor-pointer select-none bg-surface-container-low/40 hover:bg-surface-container-low/70 transition"
        >
          {/* Visual Drag Handle Bar */}
          <div className="w-10 h-1.5 rounded-full bg-surface-on-variant/30 mx-auto mb-2" />

          {/* Quick Route Peek View */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-black text-primary tracking-tight">
                  {activeRoute ? formatRouteDuration(activeRoute.duration_s) : "..."}
                </span>
                <span className="text-xs font-semibold text-surface-on-variant">
                  {activeRoute ? formatRouteDistance(activeRoute.distance_m) : ""}
                </span>
                {activeRoute?.is_recommended && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                    ★ Recommended
                  </span>
                )}
                {activeRoute?.avoids_incident && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                    Detour Active
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-surface-on-variant truncate m-0 mt-0.5">
                {activeRoute?.name ?? "Calculating best route..."} · free-flow
              </p>
            </div>

            {/* Expand / Collapse Control Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-bold text-primary flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary/10">
                <span>{routes.length} options</span>
                <span>{isDrawerExpanded ? "▼" : "▲"}</span>
              </span>
            </div>
          </div>

          {/* Compact Hazard Alert Strip in Peek State if route intersects hazard */}
          {selectedRouteWarnings.length > 0 && !activeRoute?.avoids_incident && !isDrawerExpanded && (
            <div className="mt-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <span>⚠️</span>
                <span className="truncate font-medium">Passes near {selectedRouteWarnings[0].label} ({selectedRouteWarnings[0].distance_to_route_m}m)</span>
              </div>
              <button
                type="button"
                disabled={isRecalculating}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDynamicReroute(selectedRouteWarnings[0].id);
                }}
                className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-700 text-white hover:bg-rose-800 transition"
              >
                {isRecalculating ? "Detouring…" : "Detour"}
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Drawer Body */}
        <div className="overflow-y-auto p-3.5 space-y-3 flex-1">
          {reportFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-xs ${
                reportFeedback.startsWith("❌")
                  ? "bg-rose-50 border-rose-200 text-rose-950"
                  : "bg-emerald-50 border-emerald-200 text-emerald-950"
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
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 shadow-xs">
              {statusMessage}
            </div>
          )}

          {/* No Alternative Available Alert Banner */}
          {recalculateError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-400 text-rose-950 space-y-2 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚫</span>
                  <h4 className="text-xs font-bold text-rose-950 m-0">
                    No Alternative Route Available
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setRecalculateError(null)}
                  className="text-xs text-rose-700 hover:text-rose-950 font-bold px-1"
                  aria-label="Dismiss alert"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed m-0">
                <strong>No street detour can safely clear this bottleneck.</strong> All primary roads pass directly through this hazard zone ({selectedRouteWarnings[0]?.label || "reported incident"}).
              </p>
              <div className="text-[11px] font-semibold text-rose-900 pt-1 border-t border-rose-200 flex items-center gap-1.5">
                <span>⏱️ Delaying departure or using alternate transit is strongly advised.</span>
              </div>
            </div>
          )}

          {/* Consolidated Hazard Intersect & Dynamic Recalculation Alert */}
          {selectedRouteWarnings.length > 0 && !activeRoute?.avoids_incident && !recalculateError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2.5 shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-lg leading-none mt-0.5">⚠️</span>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-rose-950 m-0">Route Intersects Reported Hazard</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-200">
                      {verifiedRouteImpact ? `${selectedRouteWarnings[0].level} Verified` : `${selectedRouteWarnings[0].level} Reported`}
                    </span>
                  </div>
                  <p className="text-xs text-rose-900 leading-relaxed m-0">
                    <strong>{selectedRouteWarnings[0].label}</strong> ({selectedRouteWarnings[0].distance_to_route_m}m from path).
                    {!hasClearAlternative && !avoidingRoute
                      ? " All primary road options intersect this bottleneck. Recalculate detour to search secondary street bypasses."
                      : " A clear alternative road exists or can be recalculated."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-rose-200/80">
                <button
                  type="button"
                  disabled={isRecalculating}
                  onClick={() => handleDynamicReroute(selectedRouteWarnings[0].id)}
                  className="text-xs px-3.5 py-1.5 font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isRecalculating ? (
                    <>
                      <span className="inline-block animate-spin">⏳</span>
                      <span>Recalculating detour…</span>
                    </>
                  ) : (
                    <>
                      <span>🔄</span>
                      <span>Recalculate Detour Around Incident</span>
                    </>
                  )}
                </button>
                {avoidingRoute && (
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 font-medium rounded-lg bg-surface-container hover:bg-surface-container-high text-surface-on border border-surface-container-highest transition"
                    onClick={() => setSelectedRouteId(avoidingRoute.id)}
                  >
                    Alternative · {formatRouteDuration(avoidingRoute.duration_s)}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Compact Dismissible Road Closure Notice */}
          {roadClosure && closureLocation && !dismissRoadClosure && (
            <div role="status" className="px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-sm">🚧</span>
                <span className="truncate">
                  Road closure near <strong>{closureLocation}</strong> ({roadClosure.level}, {roadClosure.report_count} report{roadClosure.report_count === 1 ? "" : "s"}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDismissRoadClosure(true)}
                className="text-xs text-amber-800 hover:text-amber-950 p-0.5 rounded shrink-0 font-bold"
                aria-label="Dismiss notice"
                title="Dismiss notice"
              >
                ✕
              </button>
            </div>
          )}

          {/* Incident Avoidance Banner (when re-routing triggered) */}
          {activeRoute?.avoids_incident && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5 shadow-xs">
              <span className="text-xl">🛡️</span>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-emerald-950 m-0">Dynamic Detour Active</p>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                    ROAD-SNAPPED
                  </span>
                </div>
                <p className="text-emerald-900 m-0 leading-relaxed">
                  {activeRoute.avoided_incident_reason}. Calculated along OpenStreetMap road network.
                </p>
                {activeDetour && (
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-emerald-950 font-medium pt-1">
                    <span>⏱️ +{formatRouteDuration(activeDetour.extraDurationSeconds)} extra</span>
                    <span>📏 +{formatRouteDistance(activeDetour.extraDistanceMeters)} detour</span>
                    {activeDetour.bypassStreetName && <span>🛣️ via {activeDetour.bypassStreetName}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Route Cards */}
          {routes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-surface-on-variant uppercase tracking-wider">Calculated Routes</span>
                <span className="text-[10px] text-surface-on-variant font-medium">{routes.length} options</span>
              </div>
              {routes.map((r, index) => {
                const isSelected = r.id === (selectedRouteId ?? routes[0]?.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRouteId(r.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer space-y-1.5 shadow-xs ${
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
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                          Detour Active
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
                      <div className="pt-1.5">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-[11px] font-medium">
                          <span>⚠️</span>
                          <span>Passes near {r.incidents_on_route[0].label} ({r.incidents_on_route[0].distance_to_route_m}m)</span>
                        </div>
                      </div>
                    )}

                    {isSelected && (
                      <div className="pt-2 border-t border-surface-container flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCoordinatesId(showCoordinatesId === r.id ? null : r.id);
                            }}
                            className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                          >
                            <span>📍</span>
                            <span>{showCoordinatesId === r.id ? "Hide Road Coordinates" : `View ${r.geometry.coordinates.length} Road Coordinates`}</span>
                          </button>
                          <Link
                            href={`/workspace?corridor=${encodeURIComponent(r.name)}`}
                            className="text-xs font-semibold px-3 py-1 rounded-lg bg-primary text-primary-on hover:opacity-90 transition shadow-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Track this journey →
                          </Link>
                        </div>

                        {showCoordinatesId === r.id && (
                          <div
                            className="p-2.5 rounded-xl bg-surface-container-low text-xs border border-surface-container space-y-2 mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between text-[11px] font-semibold text-surface-on">
                              <span>Coordinate Vertices ({r.geometry.coordinates.length} points)</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(JSON.stringify(r.geometry.coordinates, null, 2));
                                  setCopiedCoords(true);
                                  setTimeout(() => setCopiedCoords(false), 2000);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded bg-surface-container hover:bg-surface text-primary font-mono border"
                              >
                                {copiedCoords ? "✓ Copied!" : "Copy GeoJSON"}
                              </button>
                            </div>
                            <div className="max-h-36 overflow-y-auto font-mono text-[10px] space-y-1 bg-surface/70 p-2 rounded-lg border border-surface-container/60">
                              <div className="text-emerald-700 font-bold">
                                [Start] {r.geometry.coordinates[0][0].toFixed(5)}° E, {r.geometry.coordinates[0][1].toFixed(5)}° N
                              </div>
                              {r.geometry.coordinates.slice(1, -1).slice(0, 15).map((coord, idx) => (
                                <div key={idx} className="text-surface-on-variant pl-2">
                                  #{idx + 2} {coord[0].toFixed(5)}° E, {coord[1].toFixed(5)}° N
                                </div>
                              ))}
                              {r.geometry.coordinates.length > 17 && (
                                <div className="text-[10px] italic text-surface-on-variant pl-2">
                                  … +{r.geometry.coordinates.length - 17} intermediate road vertices …
                                </div>
                              )}
                              <div className="text-rose-700 font-bold">
                                [Dest] {r.geometry.coordinates[r.geometry.coordinates.length - 1][0].toFixed(5)}° E, {r.geometry.coordinates[r.geometry.coordinates.length - 1][1].toFixed(5)}° N
                              </div>
                            </div>
                          </div>
                        )}
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
        <section className="absolute bottom-40 sm:bottom-6 right-4 sm:right-6 z-20 w-[calc(100vw-2rem)] sm:w-96 bg-surface/95 backdrop-blur-md rounded-2xl border border-surface-container shadow-2xl p-4 space-y-2.5 pointer-events-auto" aria-labelledby="selected-incident-title">
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
          {selectedIncident.photo_data_url && (
            <div className="rounded-lg overflow-hidden border border-surface-container bg-surface-container-low">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedIncident.photo_data_url}
                alt="Verified road incident evidence"
                className="w-full h-32 object-cover block"
              />
              <div className="px-2 py-1 text-[10px] font-mono bg-emerald-950 text-emerald-100 flex items-center justify-between">
                <span>📷 BEST VERIFIED PHOTO · L5 AI VISION</span>
                <span>{(selectedIncident.photo_confidence ?? "moderate").toUpperCase()}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-surface-on-variant m-0">{selectedIncident.level_reason}</p>
          <p className="text-[11px] text-surface-on-variant m-0">This open incident expires if it receives no new confirmation by {formatIncidentTime(new Date(Date.parse(selectedIncident.last_confirmed_at) + 3 * 60 * 60 * 1000).toISOString())} IST.</p>

          <div className="pt-2.5 border-t border-surface-container flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-surface-on-variant">
              {selectedRouteWarnings.some((w) => w.id === selectedIncident.id)
                ? (recalculateError
                    ? "🚫 No alternative route exists around this bottleneck."
                    : "⚠️ Directly blocks your active route.")
                : "Reported incident in the city network."}
            </span>
            <button
              type="button"
              disabled={isRecalculating}
              onClick={() => handleDynamicReroute(selectedIncident.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              {isRecalculating ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  <span>Calculating detour…</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Plan Detour Around This</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* Floating Bottom-Right Map Controls & Legend */}
      <div className="absolute bottom-40 sm:bottom-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTrafficOverlay((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl backdrop-blur border shadow-md text-xs font-semibold flex items-center gap-1.5 transition ${
              showTrafficOverlay
                ? "bg-primary text-primary-on border-primary"
                : "bg-surface/95 border-surface-container text-surface-on hover:bg-surface-container"
            }`}
            title="Toggle central traffic corridor overlay"
          >
            <span>🚦</span>
            <span>Corridor Traffic: {showTrafficOverlay ? "On" : "Off"}</span>
          </button>

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
        </div>

        <div className="text-[11px] bg-surface/90 backdrop-blur px-3 py-1.5 rounded-xl border border-surface-container shadow-xs flex flex-wrap items-center gap-2.5 text-surface-on-variant">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1 bg-blue-600 rounded" />
            <span>Recommended</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1 bg-slate-500 rounded border-dashed" />
            <span>Alternative</span>
          </span>
          {showTrafficOverlay && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-1 bg-emerald-600 rounded" />
                <span>Corridor Clear</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-1 bg-amber-500 rounded" />
                <span>Slowdown</span>
              </span>
            </>
          )}
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
                <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900">
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

            {/* Optional L5 photo evidence */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-surface-on m-0">4. Photo Evidence (Optional · L5 AI Vision)</p>
              <L5PhotoPanel
                segmentId="planner-live-report"
                userSelectedCategory={toL5Category(reportCategory)}
                onResult={handleReportL5Result}
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
