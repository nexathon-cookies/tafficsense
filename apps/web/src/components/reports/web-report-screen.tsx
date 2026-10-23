"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportCategories, reportCategoryIcons, type ReportCategory } from "@/lib/reports/rules";
import type { Map as MapInstance, Marker as MarkerInstance } from "maplibre-gl";
import { createFallbackStyle } from "@/lib/traffic/mangaluru-basemap";
import "maplibre-gl/dist/maplibre-gl.css";

export const MANGALURU_LOCATIONS = [
  { name: "Hampankatta (City Centre)", coords: [74.842, 12.868] as [number, number] },
  { name: "Lalbagh Junction (MG Road)", coords: [74.846, 12.877] as [number, number] },
  { name: "KSRTC Bus Stand (Bejai)", coords: [74.848, 12.885] as [number, number] },
  { name: "Ladyhill Circle", coords: [74.841, 12.894] as [number, number] },
  { name: "Bunts Hostel Circle", coords: [74.849, 12.872] as [number, number] },
  { name: "Jyoti (Ambedkar) Circle", coords: [74.845, 12.871] as [number, number] },
  { name: "Nanthoor Junction", coords: [74.865, 12.874] as [number, number] },
  { name: "Pumpwell Circle", coords: [74.862, 12.858] as [number, number] },
  { name: "Kottara Chowki", coords: [74.838, 12.908] as [number, number] },
  { name: "Kadri Park / Circuit House", coords: [74.858, 12.882] as [number, number] },
];

export function WebReportScreen() {
  const [category, setCategory] = useState<ReportCategory>("accident");
  const [locationIndex, setLocationIndex] = useState<number>(0);
  const [useGps, setUseGps] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    incidentId: string;
    level: string;
    levelReason: string;
    distinctReporters?: number;
  } | null>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);

  const activeCoords: [number, number] = useGps && userLocation
    ? userLocation
    : MANGALURU_LOCATIONS[locationIndex].coords;

  // Request browser GPS position
  function handleRequestGps() {
    setErrorMessage(null);
    if (!navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(coords);
        setGpsAccuracy(pos.coords.accuracy);
        setUseGps(true);
      },
      (err) => {
        setErrorMessage(`Location access was denied or unavailable (${err.message}). Selected preset road location instead.`);
        setUseGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // Initialize MapLibre with OpenStreetMap tiles
  useEffect(() => {
    if (!mapContainer.current) return;
    let map: MapInstance;
    let disposed = false;

    async function initMap() {
      const { Map, NavigationControl, setWorkerUrl } = await import("maplibre-gl");
      setWorkerUrl("/maplibre-gl-worker.mjs");

      if (disposed || !mapContainer.current) return;

      map = new Map({
        container: mapContainer.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: activeCoords,
        zoom: 14,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("error", () => {
        try {
          map.setStyle(createFallbackStyle());
        } catch {
          // Fallback style error handling
        }
      });

      map.on("load", async () => {
        if (disposed) return;
        const { Marker } = await import("maplibre-gl");
        const marker = new Marker({ color: "#b91c1c" })
          .setLngLat(activeCoords)
          .addTo(map);
        markerRef.current = marker;
      });

      mapRef.current = map;
    }

    void initMap();

    return () => {
      disposed = true;
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update marker position when activeCoords change
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLngLat(activeCoords);
    }
    if (mapRef.current) {
      mapRef.current.easeTo({ center: activeCoords, zoom: 14.5 });
    }
  }, [activeCoords]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          lat: activeCoords[1],
          lng: activeCoords[0],
          gps_accuracy_m: useGps ? gpsAccuracy : null,
          gps_fix_at: useGps ? new Date().toISOString() : null,
          note: note.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to submit report");
      }

      setSuccessResult({
        incidentId: data.incident_id,
        level: data.level,
        levelReason: data.level_reason,
        distinctReporters: data.distinct_reporters,
      });
      setNote("");
      // Notify other views that incidents changed
      window.dispatchEvent(new Event("trafficsense:incidents-changed"));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Submission failed. Please check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Form Column */}
      <div className="lg:col-span-5 space-y-4">
        {successResult ? (
          <div className="p-6 rounded-xl bg-surface-container-lowest border border-success/40 shadow-sm space-y-4" role="alert">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                ✓
              </div>
              <div>
                <h2 className="text-base font-bold text-surface-on">Report Submitted Successfully</h2>
                <p className="text-xs text-surface-on-variant">
                  Initial verification tier: <strong className="font-mono text-primary">{successResult.level}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-surface-container-low border border-surface-container text-xs space-y-1.5">
              <p className="font-semibold text-surface-on">Dispatched to Authority Dashboard</p>
              <p className="text-surface-on-variant">
                Your report has been queued in the <strong>Civic Traffic Authority Dashboard</strong> for review and verification. When authorities confirm it, the report is upgraded to L6.
              </p>
              <p className="text-surface-on-variant font-mono text-[11px]">
                {successResult.levelReason}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Link href="/traffic" className="button text-xs py-2 text-center">
                View on Live Traffic Map →
              </Link>
              <Link href="/authority" className="button secondary text-xs py-2 text-center">
                Check Authority Verification Queue →
              </Link>
              <button
                type="button"
                onClick={() => setSuccessResult(null)}
                className="button secondary text-xs py-2"
              >
                Submit another report
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-surface-on">Submit a Road Incident Report</h2>
              <p className="text-xs text-surface-on-variant">
                Reports contribute to community verification and alert other commuters on active routes.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-error-container text-error-on text-xs">
                {errorMessage}
              </div>
            )}

            {/* Category Selection */}
            <div className="space-y-1.5">
              <label htmlFor="report-category" className="block text-xs font-semibold text-surface-on">
                1. Select Hazard Category
              </label>
              <select
                id="report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ReportCategory)}
                className="w-full text-xs p-2.5 rounded-lg bg-surface-container border border-surface-container-high text-surface-on"
              >
                {(Object.entries(reportCategories) as [ReportCategory, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {(reportCategoryIcons as Record<string, string>)[key] ?? "⚠️"} {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Location Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="report-location" className="text-xs font-semibold text-surface-on">
                  2. Incident Location (Mangaluru)
                </label>
                <button
                  type="button"
                  onClick={handleRequestGps}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                    useGps
                      ? "bg-primary text-primary-on border-primary"
                      : "bg-surface-container border-surface-container-high text-primary hover:bg-surface-container-high"
                  }`}
                >
                  {useGps ? "📍 Using Device GPS" : "Use GPS position"}
                </button>
              </div>

              {!useGps ? (
                <select
                  id="report-location"
                  value={locationIndex}
                  onChange={(e) => setLocationIndex(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-lg bg-surface-container border border-surface-container-high text-surface-on"
                >
                  {MANGALURU_LOCATIONS.map((loc, idx) => (
                    <option key={loc.name} value={idx}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2.5 rounded-lg bg-surface-container border border-surface-container-high text-xs text-surface-on flex items-center justify-between">
                  <span>
                    GPS: {activeCoords[1].toFixed(5)}, {activeCoords[0].toFixed(5)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseGps(false)}
                    className="text-[11px] text-primary hover:underline ml-2"
                  >
                    Switch to preset list
                  </button>
                </div>
              )}
            </div>

            {/* Observation Note */}
            <div className="space-y-1.5">
              <label htmlFor="report-note" className="block text-xs font-semibold text-surface-on">
                3. Observed Details (Optional)
              </label>
              <textarea
                id="report-note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="E.g. waterlogging on left lane, tree blocking right lane, slow crawling traffic..."
                className="w-full text-xs p-2.5 rounded-lg bg-surface-container border border-surface-container-high text-surface-on placeholder:text-surface-on-variant/50"
              />
            </div>

            <div className="p-3 rounded-lg bg-surface-container-low text-[11px] text-surface-on-variant space-y-1">
              <p className="font-semibold text-surface-on">Verification Pipeline:</p>
              <p>
                1. Initial report persists as <strong>L1 Reported</strong>.
              </p>
              <p>
                2. Reports from 3+ distinct commuters promote to <strong>L3 Corroborated</strong>.
              </p>
              <p>
                3. The <strong>Civic Traffic Authority</strong> verifies and confirms reports to <strong>L6 Confirmed</strong>.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full button bg-primary text-primary-on py-2.5 text-xs font-bold rounded-lg shadow hover:opacity-95 disabled:opacity-50"
            >
              {isSubmitting ? "Submitting Report…" : "Submit Incident to Verification Queue"}
            </button>
          </form>
        )}
      </div>

      {/* Map Column (OpenStreetMap SDK) */}
      <div className="lg:col-span-7 space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-surface-container bg-surface-container-low h-[480px]">
          <div ref={mapContainer} className="w-full h-full" />
          <div className="absolute bottom-2 left-2 bg-surface/90 backdrop-blur-sm px-2.5 py-1 rounded text-[10px] text-surface-on-variant border border-surface-container">
            OpenStreetMap road data via OpenFreeMap · Pin indicates report location
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-surface-on-variant px-1">
          <span>
            Location coordinates: <span className="font-mono">{activeCoords[1].toFixed(4)}° N, {activeCoords[0].toFixed(4)}° E</span>
          </span>
          <div className="flex items-center gap-2">
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="hover:underline">
              OpenFreeMap
            </a>
            <span>·</span>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:underline">
              © OpenStreetMap contributors
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
