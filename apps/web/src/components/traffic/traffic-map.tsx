"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapInstance, Marker } from "maplibre-gl";
import type { TrafficFixture } from "@/lib/traffic/simulator";
import type { PublicReport } from "@/lib/reports/rules";
import { reportCategories, reportCategoryIcons } from "@/lib/reports/rules";
import type { LiveIncident } from "@/lib/incidents/server";
import { formatLiveIncidentTime, liveIncidentLevelLabel } from "@/lib/incidents/presentation";
import { episodeSummary } from "@/lib/traffic/presentation";
import type { AssessmentView } from "@/lib/evidence/assessment";
import type { SlowdownView } from "@/lib/evidence/slowdown-presentation";
import type { TraversalView } from "@/lib/traffic/phase4-presentation";
import type { routeAlertView } from "@/lib/route-alerts/presentation";
import { createFallbackStyle, MANGALURU_BASEMAP_GEOJSON } from "@/lib/traffic/mangaluru-basemap";
import { findNearestPreset } from "@/lib/routing/presets";
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./traffic.module.css";

type MapProps = {
  fixture: TrafficFixture;
  reports: PublicReport[];
  assessments: Record<string, AssessmentView>;
  slowdowns: Record<string, SlowdownView>;
  episodeCounts: Record<string, number>;
  lifecycleLabels: Record<string, string>;
  traversalViews: Record<string, TraversalView>;
  alertViews: Record<string, ReturnType<typeof routeAlertView>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeLiveIncidentId?: string | null;
  onSelectLiveIncident?: (id: string | null) => void;
  onIncidentsChange?: (incidents: LiveIncident[]) => void;
};

export function TrafficMap(props: MapProps) {
  const [attempt, setAttempt] = useState(0);
  const geometryKey = JSON.stringify(props.fixture.segments.map(({ id, name, direction, geometry }) => ({ id, name, direction, geometry })));
  return <MapAttempt key={`${attempt}:${geometryKey}`} {...props} geometryKey={geometryKey} onRetry={() => setAttempt(value => value + 1)} />;
}

function MapAttempt({
  fixture,
  reports,
  assessments,
  slowdowns,
  episodeCounts,
  lifecycleLabels,
  traversalViews,
  alertViews,
  geometryKey,
  selectedId,
  onSelect,
  activeLiveIncidentId,
  onSelectLiveIncident,
  onIncidentsChange,
  onRetry,
}: MapProps & { geometryKey: string; onRetry: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markers = useRef<Marker[]>([]);
  const liveMarkers = useRef<Marker[]>([]);
  const selection = useRef(selectedId);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [failure, setFailure] = useState<"timeout" | "resources" | "renderer" | "initialization" | null>(null);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [liveIncidentState, setLiveIncidentState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [internalSelectedLiveIncidentId, setInternalSelectedLiveIncidentId] = useState<string | null>(null);

  const effectiveSelectedIncidentId = activeLiveIncidentId !== undefined ? activeLiveIncidentId : internalSelectedLiveIncidentId;
  const setIncidentSelection = useCallback((id: string | null) => {
    setInternalSelectedLiveIncidentId(id);
    onSelectLiveIncident?.(id);
  }, [onSelectLiveIncident]);

  useEffect(() => {
    let disposed = false;
    async function loadLiveIncidents() {
      try {
        const response = await fetch("/api/incidents", { cache: "no-store" });
        const data = await response.json();
        if (disposed) return;
        if (!data.ok || !Array.isArray(data.incidents)) throw new Error("Incident data was unavailable");
        setLiveIncidents(data.incidents);
        setLiveIncidentState("ready");
        onIncidentsChange?.(data.incidents);
      } catch {
        if (!disposed) setLiveIncidentState("unavailable");
      }
    }
    void loadLiveIncidents();
    const refresh = window.setInterval(() => void loadLiveIncidents(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(refresh);
    };
  }, [onIncidentsChange]);
  useEffect(() => {
    selection.current = selectedId;
    const map = mapRef.current;
    if (map?.getLayer("selected-segment")) map.setFilter("selected-segment", ["==", ["get", "id"], selectedId ?? ""]);
    for (const marker of markers.current) {
      const button = marker.getElement();
      button.setAttribute("aria-pressed", String(button.dataset.mapSegment === selectedId));
    }
  }, [selectedId]);

  useEffect(() => {
    for (const marker of markers.current) {
      const button = marker.getElement();
      const segment = fixture.segments.find(row => row.id === button.dataset.mapSegment);
      const view = segment && assessments[segment.id];
      const slowdown = segment && slowdowns[segment.id];
      if (!segment || !view || !slowdown) continue;
      const count = reports.filter(report => report.segment_id === segment.id).length;
      button.dataset.reportCount = String(count);
      const countBadge = button.querySelector<HTMLElement>("[data-report-badge]");
      if (countBadge) { countBadge.textContent = String(count); countBadge.hidden = count === 0; }
      button.dataset.assessmentState = view.state;
      button.dataset.slowdownState = slowdown.state;
      button.dataset.episodeCount = String(episodeCounts[segment.id]);
      const label = `Select ${segment.name}, ${segment.direction}, simulated; ${button.dataset.reportCount} unconfirmed demo reports, including stale reports. ${episodeSummary(episodeCounts[segment.id])}. ${view.label}. ${slowdown.label} ${slowdown.windowLabel} ${lifecycleLabels[segment.id]}. ${traversalViews[segment.id].label}. ${alertViews[segment.id].label}`;
      button.dataset.lifecycleLabel = lifecycleLabels[segment.id];
      button.dataset.delayState = traversalViews[segment.id].state;
      button.dataset.routeAlertState = alertViews[segment.id].state;
      button.setAttribute("aria-label", label);
      button.title = label;
      const badge = button.querySelector<HTMLElement>("[data-evidence-badge]");
      if (badge) {
        badge.textContent = view.state === "multiple" ? "L3" : view.state === "expired" ? "↻" : "";
        badge.hidden = view.state === "insufficient";
      }
      const slowdownBadge = button.querySelector<HTMLElement>("[data-slowdown-badge]");
      if (slowdownBadge) {
        slowdownBadge.textContent = slowdown.state === "supported" ? "L4" : "↻";
        slowdownBadge.hidden = slowdown.state !== "supported" && slowdown.state !== "expired";
      }
    }
  }, [assessments, slowdowns, episodeCounts, lifecycleLabels, traversalViews, alertViews, fixture, reports, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;
    let disposed = false;
    for (const marker of liveMarkers.current) marker.remove();
    liveMarkers.current = [];

    void import("maplibre-gl").then(({ Marker }) => {
      if (disposed || !mapRef.current) return;
      for (const incident of liveIncidents) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = styles.liveIncidentMarker;
        button.dataset.liveIncidentMarker = incident.id;
        button.textContent = reportCategoryIcons[incident.category] ?? "⚠️";
        const category = reportCategories[incident.category] ?? incident.category;
        const label = `${category}. ${liveIncidentLevelLabel(incident)}. Reported ${formatLiveIncidentTime(incident.first_reported_at)}.`;
        button.setAttribute("aria-label", `Show report details: ${label}`);
        button.title = label;
        button.addEventListener("click", () => {
          setIncidentSelection(incident.id);
          map?.flyTo({ center: [incident.lng, incident.lat], zoom: 15, duration: 600 });
        });
        const marker = new Marker({ element: button, anchor: "bottom" })
          .setLngLat([incident.lng, incident.lat])
          .addTo(map);
        liveMarkers.current.push(marker);
      }
    });

    return () => {
      disposed = true;
      for (const marker of liveMarkers.current) marker.remove();
      liveMarkers.current = [];
    };
  }, [liveIncidents, state, setIncidentSelection]);

  useEffect(() => {
    const segments = JSON.parse(geometryKey) as Pick<TrafficFixture["segments"][number], "id" | "name" | "direction" | "geometry">[];
    let disposed = false;
    let failed = false;
    let fallbackUsed = false;
    let map: MapInstance | null = null;
    const fail = (reason: "timeout" | "resources" | "renderer" | "initialization") => {
      if (disposed || failed) return;
      failed = true;
      clearTimeout(deadline);
      setFailure(reason);
      setState("failed");
      mapRef.current = null;
      for (const marker of markers.current) marker.remove();
      markers.current = [];
      for (const marker of liveMarkers.current) marker.remove();
      liveMarkers.current = [];
      map?.remove();
      map = null;
    };
    const deadline = setTimeout(() => {
      if (!fallbackUsed && map) {
        fallbackUsed = true;
        try {
          map.setStyle(createFallbackStyle());
          return;
        } catch {
          // Fall through to fail if fallback style also fails
        }
      }
      fail("timeout");
    }, 15000);

    const setupLayers = (mapInstance: MapInstance) => {
      if (!mapInstance.getSource("mangaluru-basemap")) {
        mapInstance.addSource("mangaluru-basemap", {
          type: "geojson",
          data: MANGALURU_BASEMAP_GEOJSON,
        });
        if (!mapInstance.getLayer("schematic-water")) {
          mapInstance.addLayer({
            id: "schematic-water",
            type: "fill",
            source: "mangaluru-basemap",
            filter: ["==", ["get", "kind"], "water"],
            paint: { "fill-color": "#cfe2fe", "fill-opacity": 0.8 },
          });
        }
        if (!mapInstance.getLayer("schematic-secondary")) {
          mapInstance.addLayer({
            id: "schematic-secondary",
            type: "line",
            source: "mangaluru-basemap",
            filter: ["==", ["get", "kind"], "secondary"],
            paint: { "line-color": "#cbd5e1", "line-width": 3 },
          });
        }
        if (!mapInstance.getLayer("schematic-arterial-casing")) {
          mapInstance.addLayer({
            id: "schematic-arterial-casing",
            type: "line",
            source: "mangaluru-basemap",
            filter: ["==", ["get", "kind"], "arterial"],
            paint: { "line-color": "#94a3b8", "line-width": 6 },
          });
          mapInstance.addLayer({
            id: "schematic-arterial-core",
            type: "line",
            source: "mangaluru-basemap",
            filter: ["==", ["get", "kind"], "arterial"],
            paint: { "line-color": "#ffffff", "line-width": 3.5 },
          });
        }
      }
      if (!mapInstance.getSource("synthetic-segments")) {
        mapInstance.addSource("synthetic-segments", {
          type: "geojson",
          data: { type: "FeatureCollection", features: segments.map(segment => ({
            type: "Feature", id: segment.id,
            properties: { id: segment.id, direction: segment.direction, alternative: segment.id.startsWith("alternative-") },
            geometry: segment.geometry,
          })) },
        });
        mapInstance.addLayer({ id: "segment-lines", type: "line", source: "synthetic-segments", paint: {
          "line-color": ["case", ["==", ["get", "direction"], "inbound"], "#904d00", ["get", "alternative"], "#6616d7", "#005c55"],
          "line-width": 5,
          "line-offset": ["case", ["==", ["get", "direction"], "inbound"], 8, 0],
        } });
        mapInstance.addLayer({ id: "selected-segment", type: "line", source: "synthetic-segments",
          filter: ["==", ["get", "id"], selection.current ?? ""], paint: { "line-color": "#131b2e", "line-width": 3, "line-dasharray": [2, 2],
            "line-offset": ["case", ["==", ["get", "direction"], "inbound"], 8, 0],
          },
        });
      }
    };

    async function initialize() {
      try {
        const { Map, Marker, NavigationControl, setWorkerUrl } = await import("maplibre-gl");
        if (disposed || failed || !container.current) return;
        setWorkerUrl("/maplibre-gl-worker.mjs");
        map = new Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [74.85, 12.88], zoom: 13,
          minZoom: 11, maxZoom: 17,
          maxBounds: [[74.79, 12.82], [74.92, 12.94]],
          attributionControl: false, dragRotate: false, pitchWithRotate: false,
          touchPitch: false, cooperativeGestures: true,
        });
        mapRef.current = map;
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        map.on("error", () => {
          if (!fallbackUsed && map) {
            fallbackUsed = true;
            try {
              map.setStyle(createFallbackStyle());
              return;
            } catch {
              // Ignore fallback error
            }
          }
        });
        map.getCanvas().addEventListener("webglcontextlost", () => fail("renderer"));
        map.on("style.load", () => {
          if (disposed || failed || !map) return;
          setupLayers(map);
        });
        map.once("load", () => {
          if (disposed || failed || !map) return;
          setupLayers(map);
          for (const [index, segment] of segments.entries()) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = styles.marker;
            button.textContent = String(index + 1);
            button.dataset.mapSegment = segment.id;
            button.setAttribute("aria-label", `Select ${segment.name}, ${segment.direction}, simulated; evidence loading`);
            const countBadge = document.createElement("span");
            countBadge.className = styles.markerCount;
            countBadge.dataset.reportBadge = "";
            countBadge.hidden = true;
            countBadge.setAttribute("aria-hidden", "true");
            button.append(countBadge);
            const evidenceBadge = document.createElement("span");
            evidenceBadge.className = styles.markerEvidence;
            evidenceBadge.dataset.evidenceBadge = "";
            evidenceBadge.setAttribute("aria-hidden", "true");
            evidenceBadge.hidden = true;
            button.append(evidenceBadge);
            const slowdownBadge = document.createElement("span");
            slowdownBadge.className = styles.markerSlowdown;
            slowdownBadge.dataset.slowdownBadge = "";
            slowdownBadge.setAttribute("aria-hidden", "true");
            slowdownBadge.hidden = true;
            button.append(slowdownBadge);
            button.setAttribute("aria-pressed", String(selection.current === segment.id));
            button.addEventListener("click", () => onSelect(segment.id));
            const marker = new Marker({ element: button, offset: segment.direction === "inbound" ? [44, 0] : [0, 0] })
              .setLngLat(segment.geometry.coordinates[Math.floor(segment.geometry.coordinates.length / 2)])
              .addTo(map);
            markers.current.push(marker);
          }
          map.on("click", "segment-lines", event => {
            const id = event.features?.[0]?.properties.id;
            if (typeof id === "string" && segments.some(segment => segment.id === id)) onSelect(id);
          });
          map.fitBounds([[74.839, 12.87], [74.86, 12.89]], { padding: 65, animate: false });
          map.once("idle", () => {
            if (disposed || failed) return;
            clearTimeout(deadline);
            setState("ready");
          });
        });
      } catch {
        fail("initialization");
      }
    }
    void initialize();
    return () => {
      disposed = true;
      clearTimeout(deadline);
      for (const marker of markers.current) marker.remove();
      markers.current = [];
      for (const marker of liveMarkers.current) marker.remove();
      liveMarkers.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, [geometryKey, onSelect]);

  const selectedLiveIncident = liveIncidents.find(incident => incident.id === effectiveSelectedIncidentId) ?? null;
  const nearestPreset = selectedLiveIncident ? findNearestPreset([selectedLiveIncident.lng, selectedLiveIncident.lat]) : null;

  return (
    <div data-map-state={state} data-map-failure={failure ?? undefined} className={styles.mapRegion}>
      {state === "loading" && (
        <div className="absolute top-4 right-4 z-20 bg-surface/90 backdrop-blur px-3 py-1.5 rounded-full border border-surface-container text-xs shadow-md">
          Loading map…
        </div>
      )}
      {state === "failed" && (
        <div className="absolute top-4 right-4 z-20 bg-rose-50 text-rose-900 px-3 py-1.5 rounded-xl border border-rose-200 text-xs shadow-md flex items-center gap-2">
          <span>Map fallback active</span>
          <button type="button" className="underline font-bold" onClick={onRetry}>Retry</button>
        </div>
      )}
      {liveIncidentState === "unavailable" && (
        <div className="absolute top-4 right-4 z-20 bg-amber-50 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-200 text-xs shadow-md">
          Community reports temporarily unavailable
        </div>
      )}

      <div ref={container} className={styles.mapCanvas}
        role="region" aria-label="Interactive map with current community reports and synthetic segment selection" />

      {selectedLiveIncident && (
        <section className={styles.liveIncidentDetails} aria-live="polite" aria-label="Selected community report">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={styles.liveIncidentEyebrow}>COMMUNITY REPORT</p>
              <h3 className="flex items-center gap-1.5 mt-0.5">
                <span>{reportCategoryIcons[selectedLiveIncident.category] ?? "⚠️"}</span>
                <span>{reportCategories[selectedLiveIncident.category] ?? selectedLiveIncident.category}</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIncidentSelection(null)}
              className="text-xs px-2 py-1 rounded hover:bg-black/5 text-surface-on-variant"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2 my-1.5">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900">
              {selectedLiveIncident.level} · {selectedLiveIncident.report_count} report{selectedLiveIncident.report_count !== 1 ? "s" : ""}
            </span>
            {nearestPreset && (
              <span className="text-xs text-surface-on-variant font-medium">
                Near {nearestPreset.name}
              </span>
            )}
          </div>

          <p><strong>{liveIncidentLevelLabel(selectedLiveIncident)}.</strong></p>
          <p>Reported <time dateTime={selectedLiveIncident.first_reported_at}>{formatLiveIncidentTime(selectedLiveIncident.first_reported_at)}</time>. This is a reported incident, not a measured traffic delay.</p>

          <div className="mt-3 pt-2 border-t border-rose-200 flex items-center gap-2">
            <a
              href={`/planner?from=${encodeURIComponent(nearestPreset?.name ?? "Hampankatta Junction")}&to=KSRTC / Bejai Circle`}
              className="button text-xs py-1.5 px-3 w-full text-center font-semibold"
            >
              Plan Detour Around This →
            </a>
          </div>
        </section>
      )}

      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => mapRef.current?.flyTo({ center: [74.856, 12.870], zoom: 13, duration: 800 })}
          className="px-3 py-1.5 rounded-xl bg-surface/95 backdrop-blur border border-surface-container shadow-md text-xs font-semibold text-surface-on hover:bg-surface-container flex items-center gap-1.5"
          title="Recenter Mangaluru map"
        >
          <span>🎯</span>
          <span>Recenter</span>
        </button>
        <div className="text-[11px] bg-surface/80 backdrop-blur px-2.5 py-1 rounded-lg border border-surface-container/60 shadow-xs flex items-center gap-2 text-surface-on-variant">
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="hover:underline">OpenFreeMap</a>
          <span>·</span>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:underline">© OSM</a>
          <span>·</span>
          <a href="/map-notices.txt" target="_blank" rel="noreferrer" className="hover:underline">Notices</a>
        </div>
      </div>
    </div>
  );
}
