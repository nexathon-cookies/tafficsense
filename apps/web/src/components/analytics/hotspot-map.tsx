"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as MapInstance, Marker as MarkerInstance, Popup as PopupInstance } from "maplibre-gl";
import { createFallbackStyle } from "@/lib/traffic/mangaluru-basemap";
import type { HistoricalIncident } from "@/lib/analytics/history";
import type { HotspotRanking } from "@/lib/analytics/metrics";
import "maplibre-gl/dist/maplibre-gl.css";
import { getIncidentSvgString } from "@/components/icons/incident-icons";
import { RefreshIcon, XIcon } from "@/components/icons/ui-icons";

function getCauseIcon(cause: string): string {
  switch (cause) {
    case "accident": return getIncidentSvgString("accident", 14);
    case "road_repair": return getIncidentSvgString("road_repair", 14);
    case "heavy_volume": return getIncidentSvgString("heavy_traffic", 14);
    case "flood": return getIncidentSvgString("flood", 14);
    default: return getIncidentSvgString("other", 14);
  }
}

function getCauseLabel(cause: string): string {
  switch (cause) {
    case "accident": return "Accident";
    case "road_repair": return "Road Maintenance";
    case "heavy_volume": return "Heavy Volume";
    case "flood": return "Waterlogging";
    default: return "General Incident";
  }
}

/** Canonical coordinates [lng, lat] for Mangaluru corridor junctions tracked by analytics. */
export const HOTSPOT_GEO_COORDS: Record<string, [number, number]> = {
  hampankatta: [74.842, 12.868],
  "ksrtc-bejai": [74.848, 12.885],
  "jyothi-ambedkar": [74.845, 12.871],
  ladyhill: [74.841, 12.894],
  pumpwell: [74.862, 12.858],
};

const MANGALURU_CORRIDOR_CENTER: [number, number] = [74.851, 12.876];
const DEFAULT_ZOOM = 13.0;

type HotspotMapProps = {
  hotspots: HotspotRanking[];
  liveIncidents?: HistoricalIncident[];
  selectedHotspotId?: string | null;
  onSelectHotspot?: (id: string | null) => void;
  showDemoHistory?: boolean;
  className?: string;
  heightClassName?: string;
};

export function HotspotMap({
  hotspots,
  liveIncidents = [],
  selectedHotspotId = null,
  onSelectHotspot,
  showDemoHistory = false,
  className = "",
  heightClassName = "h-[580px] sm:h-[660px] lg:h-[740px]",
}: HotspotMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const hotspotMarkersRef = useRef<Record<string, MarkerInstance>>({});
  const liveMarkersRef = useRef<MarkerInstance[]>([]);
  const activePopupRef = useRef<PopupInstance | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showLivePins, setShowLivePins] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHudDrawer, setShowHudDrawer] = useState(true);

  // Initialize MapLibre GL map
  useEffect(() => {
    let disposed = false;
    let map: MapInstance | null = null;
    let fallbackUsed = false;

    async function initMap() {
      try {
        const { Map, NavigationControl, setWorkerUrl } = await import("maplibre-gl");
        if (disposed || !containerRef.current) return;

        setWorkerUrl("/maplibre-gl-worker.mjs");

        map = new Map({
          container: containerRef.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: MANGALURU_CORRIDOR_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 11,
          maxZoom: 17,
          maxBounds: [
            [74.70, 12.75],
            [74.95, 13.05],
          ],
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          cooperativeGestures: true,
        });

        map.addControl(new NavigationControl({ showCompass: false }), "top-right");

        map.on("error", () => {
          if (!fallbackUsed && map) {
            fallbackUsed = true;
            try {
              map.setStyle(createFallbackStyle());
            } catch {
              // ignore fallback error
            }
          }
        });

        map.once("load", () => {
          if (disposed) return;
          mapRef.current = map;
          setMapReady(true);
        });
      } catch (err) {
        console.error("Failed to initialize OpenStreetMap hotspot map:", err);
      }
    }

    void initMap();

    return () => {
      disposed = true;
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
      Object.values(hotspotMarkersRef.current).forEach((m) => m.remove());
      hotspotMarkersRef.current = {};
      liveMarkersRef.current.forEach((m) => m.remove());
      liveMarkersRef.current = [];
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Handle Fullscreen toggle and canvas resize
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      setTimeout(() => {
        mapRef.current?.resize();
      }, 150);
      return next;
    });
  }, []);

  // Escape key exits fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        setTimeout(() => {
          mapRef.current?.resize();
        }, 150);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Window resize observer to ensure canvas always stays sharp
  useEffect(() => {
    const handleResize = () => {
      mapRef.current?.resize();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Reset view to whole Mangaluru corridor
  const handleResetView = useCallback(() => {
    if (!mapRef.current) return;
    onSelectHotspot?.(null);
    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }
    mapRef.current.flyTo({
      center: MANGALURU_CORRIDOR_CENTER,
      zoom: DEFAULT_ZOOM,
      duration: 800,
    });
  }, [onSelectHotspot]);

  // Render or update ranked corridor hotspot markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let disposed = false;

    // Clean existing hotspot markers
    Object.values(hotspotMarkersRef.current).forEach((m) => m.remove());
    hotspotMarkersRef.current = {};

    void import("maplibre-gl").then(({ Marker, Popup }) => {
      if (disposed || !mapRef.current) return;

      hotspots.forEach((h, index) => {
        const coords = HOTSPOT_GEO_COORDS[h.junction_id];
        if (!coords) return;

        const rankNumber = index + 1;
        const isTopHotspot = rankNumber === 1;
        const isSelected = selectedHotspotId === h.junction_id;

        // Create custom DOM element for ranked marker
        const el = document.createElement("div");
        el.className = "group relative flex flex-col items-center cursor-pointer select-none transition-transform duration-200";
        el.style.zIndex = isSelected ? "40" : isTopHotspot ? "30" : `${25 - index}`;
        if (isSelected) {
          el.style.transform = "scale(1.2)";
        }

        // Outer badge
        const badge = document.createElement("div");
        badge.className = `flex items-center justify-center font-bold font-mono text-white rounded-full shadow-lg border-2 ${
          isTopHotspot
            ? "bg-red-600 border-white ring-4 ring-red-400/50 w-10 h-10 text-xs"
            : rankNumber <= 3
            ? "bg-amber-600 border-white ring-2 ring-amber-400/40 w-9 h-9 text-xs"
            : "bg-indigo-600 border-white w-8 h-8 text-[11px]"
        } ${isSelected ? "ring-4 ring-primary scale-110" : ""}`;
        badge.innerHTML = `<span>#${rankNumber}</span>`;

        // Pulse ring for #1 worst hotspot
        if (isTopHotspot) {
          const pulse = document.createElement("div");
          pulse.className = "absolute -inset-1.5 rounded-full bg-red-500/30 animate-ping pointer-events-none";
          el.appendChild(pulse);
        }

        el.appendChild(badge);

        // Junction name chip underneath
        const label = document.createElement("div");
        label.className = `mt-1 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-tight whitespace-nowrap shadow-sm border ${
          isSelected
            ? "bg-primary text-white border-primary"
            : "bg-surface-container-lowest/95 text-surface-on border-surface-container hover:bg-surface-container-low"
        }`;
        label.textContent = h.junction_name.split(" ")[0];
        el.appendChild(label);

        // Popup HTML content
        const delayHtml = showDemoHistory
          ? `<strong class="text-amber-600 dark:text-amber-400">${h.total_delay_hours} hrs</strong> commuter delay`
          : `<span class="text-surface-on-variant">Not measured (live reports only)</span>`;

        const avgDelayHtml = showDemoHistory
          ? `Avg <span class="font-semibold text-surface-on">~${h.average_delay_minutes} min</span> delay`
          : `<span class="text-surface-on-variant">Live frequency view</span>`;

        const popupContent = `
          <div class="p-3 text-xs space-y-2 font-sans min-w-[220px]">
            <div class="flex items-center justify-between gap-2 border-b border-surface-container pb-1.5">
              <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                isTopHotspot ? "bg-red-600 text-white" : "bg-primary text-white"
              }">RANK #${rankNumber} HOTSPOT</span>
              <span class="font-mono text-[10px] text-surface-on-variant">${h.primary_window}</span>
            </div>
            <p class="font-bold text-sm text-surface-on leading-tight">${h.junction_name}</p>
            <div class="text-[11px] text-surface-on-variant space-y-1.5">
              <div class="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-primary shrink-0"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>${delayHtml}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-500 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span><strong>${h.incident_count}</strong> recorded events (${avgDelayHtml})</span>
              </div>
              <div class="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-surface-on-variant shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>Predominant cause: <strong class="capitalize">${h.primary_cause.replace("_", " ")}</strong></span>
              </div>
            </div>
          </div>
        `;

        const popup = new Popup({
          offset: 28,
          closeButton: true,
          maxWidth: "300px",
          className: "hotspot-popup",
        }).setHTML(popupContent);

        el.addEventListener("click", () => {
          onSelectHotspot?.(h.junction_id);
          if (activePopupRef.current) {
            activePopupRef.current.remove();
          }
          popup.setLngLat(coords).addTo(map);
          activePopupRef.current = popup;
          map.flyTo({ center: coords, zoom: 15.0, duration: 600 });
        });

        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat(coords)
          .addTo(map);

        hotspotMarkersRef.current[h.junction_id] = marker;

        // If this marker is selected, show popup
        if (isSelected) {
          popup.setLngLat(coords).addTo(map);
          activePopupRef.current = popup;
        }
      });
    });

    return () => {
      disposed = true;
    };
  }, [hotspots, mapReady, selectedHotspotId, showDemoHistory, onSelectHotspot]);

  // Fly to selected hotspot if selection changed from external table click
  useEffect(() => {
    if (!mapRef.current || !selectedHotspotId) return;
    const coords = HOTSPOT_GEO_COORDS[selectedHotspotId];
    if (coords) {
      mapRef.current.flyTo({ center: coords, zoom: 15.0, duration: 600 });
    }
  }, [selectedHotspotId]);

  // Render live incident pins on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let disposed = false;
    liveMarkersRef.current.forEach((m) => m.remove());
    liveMarkersRef.current = [];

    if (!showLivePins || liveIncidents.length === 0) return;

    void import("maplibre-gl").then(({ Marker, Popup }) => {
      if (disposed || !mapRef.current) return;

      liveIncidents.forEach((inc) => {
        // live incident coordinates
        const jCoords = HOTSPOT_GEO_COORDS[inc.junction_id];
        // small deterministic jitter if exact junction center is used so pins don't overlap completely
        const lng = jCoords ? jCoords[0] + 0.0015 : 74.848;
        const lat = jCoords ? jCoords[1] - 0.001 : 12.875;

        const el = document.createElement("div");
        el.className =
          "px-2 py-0.5 rounded-full bg-surface-container-lowest/95 border border-amber-500 shadow-md flex items-center gap-1 text-[11px] font-bold cursor-pointer hover:scale-110 transition";
        const icon = getCauseIcon(inc.cause);
        const causeLabel = getCauseLabel(inc.cause);
        el.title = `Live report: ${inc.junction_name} (${causeLabel})`;
        el.innerHTML = `<span>${icon}</span><span class="text-[9px] px-1 rounded bg-amber-500 text-white font-mono font-bold">LIVE</span>`;

        const popup = new Popup({ offset: 20, closeButton: true, maxWidth: "260px" }).setHTML(`
          <div class="p-2.5 text-xs space-y-1">
            <p class="font-bold text-surface-on">${icon} ${causeLabel}</p>
            <p class="text-surface-on-variant text-[11px]">Location: ${inc.junction_name}</p>
            <p class="text-[10px] font-mono text-amber-600">Reported at ${inc.occurred_at.slice(0, 16).replace("T", " ")} UTC</p>
          </div>
        `);

        el.addEventListener("click", () => {
          popup.setLngLat([lng, lat]).addTo(map);
        });

        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(map);

        liveMarkersRef.current.push(marker);
      });
    });

    return () => {
      disposed = true;
    };
  }, [liveIncidents, mapReady, showLivePins]);

  return (
    <div
      className={`relative overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen bg-surface-container-lowest m-0 p-0"
          : `rounded-xl border border-surface-container bg-surface-container-low shadow-sm ${className}`
      }`}
    >
      {/* Top Map Control Bar */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2">
        <div className="bg-surface-container-lowest/95 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-surface-container shadow text-xs flex items-center gap-2">
          <span className="font-extrabold text-surface-on">Corridor Hotspot Map</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-surface-on-variant font-bold">
            OPENSTREETMAP
          </span>
          {isFullscreen && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-white font-bold">
              FULL SCREEN MODE
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleResetView}
          className="bg-surface-container-lowest/95 backdrop-blur-md hover:bg-surface-container px-3 py-1.5 rounded-lg border border-surface-container shadow text-xs font-medium text-surface-on transition flex items-center gap-1.5"
          title="Reset map view to whole Mangaluru corridor"
          aria-label="Reset view"
        >
          <RefreshIcon size={14} className="shrink-0" />
          <span>Reset Corridor View</span>
        </button>

        {/* Full Screen Toggle Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`backdrop-blur-md px-3 py-1.5 rounded-lg border shadow text-xs font-semibold transition flex items-center gap-1.5 ${
            isFullscreen
              ? "bg-red-600 text-white border-red-700 hover:bg-red-700"
              : "bg-surface-container-lowest/95 text-surface-on border-surface-container hover:bg-surface-container"
          }`}
          title={isFullscreen ? "Exit Full Screen Mode (Esc)" : "Expand to Full Screen Big Screen Mode"}
          aria-label={isFullscreen ? "Exit full screen" : "Expand to full screen"}
        >
          {isFullscreen ? (
            <XIcon size={14} className="shrink-0" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
          <span>{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
        </button>
      </div>

      {/* Floating Quick Junction Selector Bar (Top-Right under Navigation Controls) */}
      <div className="absolute top-14 left-3 z-20 hidden sm:flex flex-wrap items-center gap-1.5 bg-surface-container-lowest/90 backdrop-blur-md p-1.5 rounded-lg border border-surface-container shadow text-xs">
        <span className="text-[10px] font-mono font-bold text-surface-on-variant px-1.5">
          JUMP TO:
        </span>
        {hotspots.map((h, idx) => (
          <button
            key={h.junction_id}
            type="button"
            onClick={() => {
              onSelectHotspot?.(h.junction_id);
              const coords = HOTSPOT_GEO_COORDS[h.junction_id];
              if (coords && mapRef.current) {
                mapRef.current.flyTo({ center: coords, zoom: 15.0, duration: 600 });
              }
            }}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
              selectedHotspotId === h.junction_id
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container hover:bg-surface-container-high text-surface-on"
            }`}
          >
            <span className="font-mono text-[10px] opacity-75">#{idx + 1}</span>
            <span>{h.junction_name.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* Legend & Toggle Overlay (Bottom-Left) */}
      <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-2 bg-surface-container-lowest/90 backdrop-blur-md p-2 rounded-lg border border-surface-container shadow text-[11px]">
        <div className="flex items-center gap-1.5 pr-2 border-r border-surface-container">
          <span className="w-3.5 h-3.5 rounded-full bg-red-600 border border-white text-white font-mono text-[9px] flex items-center justify-center font-bold">
            #1
          </span>
          <span className="text-surface-on font-medium">Top Hotspot</span>
        </div>
        <div className="flex items-center gap-1.5 pr-2 border-r border-surface-container">
          <span className="w-3.5 h-3.5 rounded-full bg-amber-600 border border-white text-white font-mono text-[9px] flex items-center justify-center font-bold">
            #2
          </span>
          <span className="text-surface-on font-medium">Ranked Hotspots</span>
        </div>
        {liveIncidents.length > 0 && (
          <label className="flex items-center gap-1.5 cursor-pointer text-surface-on font-medium select-none">
            <input
              type="checkbox"
              checked={showLivePins}
              onChange={(e) => setShowLivePins(e.target.checked)}
              className="rounded border-surface-container text-primary"
            />
            <span>Show Live Reports ({liveIncidents.length})</span>
          </label>
        )}
      </div>

      {/* Fullscreen Mode: Floating HUD Drawer on Right side */}
      {isFullscreen && (
        <div className="absolute top-3 right-14 z-20 max-w-sm w-80 bg-surface-container-lowest/95 backdrop-blur-md rounded-xl border border-surface-container shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="p-3 border-b border-surface-container flex items-center justify-between">
            <span className="text-xs font-bold text-surface-on">Corridor Operations HUD</span>
            <button
              type="button"
              onClick={() => setShowHudDrawer(!showHudDrawer)}
              className="text-xs text-primary hover:underline"
            >
              {showHudDrawer ? "Minimize" : "Show Rankings"}
            </button>
          </div>

          {showHudDrawer && (
            <div className="p-3 space-y-2 overflow-y-auto text-xs">
              <p className="text-[11px] text-surface-on-variant m-0">
                Click any junction below to inspect and center on map:
              </p>
              <div className="space-y-1.5">
                {hotspots.map((h, idx) => (
                  <div
                    key={h.junction_id}
                    onClick={() => {
                      onSelectHotspot?.(h.junction_id);
                      const coords = HOTSPOT_GEO_COORDS[h.junction_id];
                      if (coords && mapRef.current) {
                        mapRef.current.flyTo({ center: coords, zoom: 15.0, duration: 600 });
                      }
                    }}
                    className={`p-2 rounded-lg border cursor-pointer transition flex items-center justify-between gap-2 ${
                      selectedHotspotId === h.junction_id
                        ? "bg-primary/10 border-primary ring-2 ring-primary/40"
                        : "bg-surface-container-low border-surface-container hover:bg-surface-container"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary text-white font-mono text-[10px] flex items-center justify-center font-bold">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-surface-on">{h.junction_name}</span>
                    </div>
                    <span className="font-mono text-warning-on-container font-bold text-[11px]">
                      {showDemoHistory ? `${h.total_delay_hours}h` : `${h.incident_count} events`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map Canvas Container */}
      <div
        ref={containerRef}
        className={`w-full bg-surface-container ${
          isFullscreen ? "h-screen w-screen" : heightClassName
        }`}
        aria-label="Interactive OpenStreetMap of Mangaluru corridor congestion hotspots"
      />
    </div>
  );
}
