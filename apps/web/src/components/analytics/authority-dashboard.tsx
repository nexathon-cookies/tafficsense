"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  computeAnalytics,
  computeRecurrenceHeatmap,
  computeRecurrenceStatement,
  computeCauseDelaySummary,
} from "@/lib/analytics/metrics";
import { MANGALURU_JUNCTIONS, HISTORICAL_INCIDENTS, type HistoricalIncident } from "@/lib/analytics/history";
import { HotspotMap } from "@/components/analytics/hotspot-map";
import { IncidentReviewPanel } from "@/components/analytics/incident-review-panel";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Colour scale for heatmap cells: 0→transparent, 1-2→light amber, 3-4→medium amber, 5+→strong red
function heatCellStyle(count: number): string {
  if (count === 0) return "bg-surface-container";
  if (count <= 2) return "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-100";
  if (count <= 4) return "bg-amber-300 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-semibold";
  return "bg-red-500 dark:bg-red-700 text-white font-bold";
}

function suggestedInvestigation(cause: string): string {
  if (/waterlogging|flood/i.test(cause)) return "Inspect drainage and flood-response readiness around the reported corridor.";
  if (/maintenance|road repair/i.test(cause)) return "Coordinate works scheduling and safe diversion signage with the road-maintenance team.";
  if (/collision|accident/i.test(cause)) return "Review junction operations, conflict points, and emergency-response access with the competent authority.";
  if (/closure|restriction/i.test(cause)) return "Confirm closure controls, public notices, and an appropriate signed diversion.";
  return "Collect a longer observation window before commissioning a traffic-engineering investigation.";
}

/** Approximate centres of the junctions tracked by the analytics dataset (lat, lng). */
const JUNCTION_COORDS: Record<string, [number, number]> = {
  hampankatta: [12.868, 74.842],
  "ksrtc-bejai": [12.885, 74.848],
  "jyothi-ambedkar": [12.871, 74.845],
  ladyhill: [12.894, 74.841],
  pumpwell: [12.858, 74.862],
};

/** Maps a live incident location to the closest tracked junction. */
function nearestJunction(lat: number, lng: number) {
  let best: (typeof MANGALURU_JUNCTIONS)[number] = MANGALURU_JUNCTIONS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const junction of MANGALURU_JUNCTIONS) {
    const [jLat, jLng] = JUNCTION_COORDS[junction.id];
    const dLat = lat - jLat;
    const dLng = (lng - jLng) * Math.cos((jLat * Math.PI) / 180);
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = junction;
    }
  }
  return best;
}

/** Maps live incident categories onto the analytics cause taxonomy. */
function liveCategoryToCause(category: string): HistoricalIncident["cause"] {
  switch (category) {
    case "accident":
      return "accident";
    case "road_repair":
    case "road_closed":
    case "bridge_maintenance":
      return "road_repair";
    case "heavy_traffic":
    case "heavy_volume":
      return "heavy_volume";
    case "flood":
    case "heavy_rain":
      return "flood";
    default:
      return "unknown";
  }
}

type DashboardTab = "all" | "map" | "review" | "diagnostics" | "history";
type MapLayout = "hero" | "split";

export function AuthorityDashboard() {
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedJunction, setSelectedJunction] = useState("all");
  const [showDemoHistory, setShowDemoHistory] = useState(false);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("all");
  const [mapLayout, setMapLayout] = useState<MapLayout>("hero");
  const [liveIncidents, setLiveIncidents] = useState<HistoricalIncident[]>([]);

  const refreshLiveIncidents = useCallback(() => {
    return fetch("/api/incidents", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.incidents)) {
          const mapped: HistoricalIncident[] = data.incidents.map((live: {
            id: string;
            category: string;
            first_reported_at: string;
            lat: number;
            lng: number;
            level: string;
            provenance: string;
          }) => {
            const cause = liveCategoryToCause(live.category);
            const junction = nearestJunction(live.lat, live.lng);
            const date = new Date(live.first_reported_at);
            const hour = date.getUTCHours();
            let peak_window: HistoricalIncident["peak_window"] = "off_peak";
            if (hour >= 8 && hour < 10) peak_window = "08:00-10:00";
            else if (hour >= 12 && hour < 14) peak_window = "12:00-14:00";
            else if (hour >= 17 && hour < 19) peak_window = "17:00-19:00";

            return {
              id: live.id,
              junction_id: junction.id,
              junction_name: junction.name,
              segment_id: junction.segment_id,
              direction: "outbound" as const,
              occurred_at: live.first_reported_at,
              duration_minutes: 0,
              commuter_delay_minutes: 0,
              cause,
              month: typeof live.first_reported_at === "string" ? live.first_reported_at.slice(0, 7) : "2026-10",
              peak_window,
              provenance: "reported" as const,
            };
          });
          setLiveIncidents(mapped);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void refreshLiveIncidents();
    const refresh = () => void refreshLiveIncidents();
    window.addEventListener("trafficsense:incidents-changed", refresh);
    const poll = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("trafficsense:incidents-changed", refresh);
      window.clearInterval(poll);
    };
  }, [refreshLiveIncidents]);

  const activeSource = useMemo(() => {
    return showDemoHistory ? [...liveIncidents, ...HISTORICAL_INCIDENTS] : liveIncidents;
  }, [showDemoHistory, liveIncidents]);

  const data = useMemo(() => computeAnalytics(selectedMonth, activeSource), [selectedMonth, activeSource]);
  const heatmap = useMemo(() => computeRecurrenceHeatmap(selectedMonth, activeSource), [selectedMonth, activeSource]);
  const recurrenceStatement = useMemo(
    () => computeRecurrenceStatement(selectedMonth, selectedJunction, activeSource),
    [selectedMonth, selectedJunction, activeSource],
  );
  const causeDelaySummary = useMemo(() => computeCauseDelaySummary(selectedMonth, activeSource), [selectedMonth, activeSource]);
  const investigation = useMemo(() => suggestedInvestigation(data.primary_cause), [data.primary_cause]);

  const hourSlots = useMemo(() => Object.keys(heatmap[0] ?? {}).sort(), [heatmap]);
  const activeSlots = useMemo(
    () => hourSlots.filter((slot) => Object.values(heatmap).some((dayRow) => (dayRow[slot] ?? 0) > 0)),
    [hourSlots, heatmap],
  );

  function exportCsv() {
    const headers = [
      "Incident ID",
      "Junction Name",
      "Segment ID",
      "Direction",
      "Occurred At (UTC)",
      "Duration (Minutes)",
      "Commuter Delay (Minutes)",
      "Cause",
      "Peak Window",
      "Provenance",
    ];

    const rows = data.incidents.map((i) => [
      i.id,
      `"${i.junction_name}"`,
      i.segment_id,
      i.direction,
      i.occurred_at,
      i.duration_minutes,
      i.commuter_delay_minutes,
      i.cause,
      i.peak_window,
      i.provenance,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mangaluru-traffic-analytics-${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const problemReportCard = (
    <section
      className="p-5 rounded-xl bg-surface-container-lowest border border-primary/30 shadow-sm space-y-3"
      aria-labelledby="problem-report-title"
    >
      <div className="flex items-center justify-between gap-2 border-b border-surface-container pb-2">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
            DECISION-SUPPORT DIRECTIVE
          </span>
          <h2 id="problem-report-title" className="text-base font-bold text-surface-on m-0">
            Authority Problem Report
          </h2>
        </div>
        <span className="text-xs text-surface-on-variant">Advisory finding</span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-surface-container-low p-3">
          <dt className="text-xs text-surface-on-variant">Priority corridor location</dt>
          <dd className="font-semibold text-surface-on mt-1">{data.top_hotspot}</dd>
        </div>
        <div className="rounded-lg bg-surface-container-low p-3">
          <dt className="text-xs text-surface-on-variant">Reported cause mix</dt>
          <dd className="font-semibold text-surface-on mt-1 capitalize">{data.primary_cause.replace("_", " ")}</dd>
        </div>
        <div className="rounded-lg bg-surface-container-low p-3">
          <dt className="text-xs text-surface-on-variant">Recurrence pattern</dt>
          <dd className="font-semibold text-surface-on mt-1">
            {showDemoHistory ? recurrenceStatement : "Live-only records; collect a longer time window."}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-container-low p-3">
          <dt className="text-xs text-surface-on-variant">Delay evidence</dt>
          <dd className="font-semibold text-surface-on mt-1">
            {showDemoHistory ? `${data.total_delay_hours} hrs observed` : "Not measured for live reports"}
          </dd>
        </div>
      </dl>

      <div className="text-xs border-l-4 border-primary bg-surface-container-low px-3.5 py-2.5 rounded-r-lg text-surface-on space-y-1">
        <p className="font-bold text-primary m-0">Suggested investigation protocol:</p>
        <p className="text-surface-on m-0">{investigation}</p>
      </div>
    </section>
  );

  const hotspotRankingsCard = (
    <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-surface-container pb-2">
        <div>
          <h2 className="text-base font-bold text-surface-on m-0">Corridor Hotspot Rankings</h2>
          <p className="text-xs text-surface-on-variant m-0">
            Prioritized by commuter delay-hours and recurrence frequency.
          </p>
        </div>
        <span className="text-[10px] font-mono text-primary font-bold">
          SORT: DELAY (DESC)
        </span>
      </div>

      <div className="space-y-2.5">
        {data.hotspots.map((h, index) => {
          const rankNumber = index + 1;
          const isSelected = selectedHotspotId === h.junction_id;
          const isTop = rankNumber === 1;

          return (
            <div
              key={h.junction_id}
              onClick={() => setSelectedHotspotId(h.junction_id)}
              className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between gap-3 ${
                isSelected
                  ? "bg-primary/5 border-primary ring-2 ring-primary/40 shadow-sm"
                  : "bg-surface-container-low border-surface-container hover:border-primary/40 hover:bg-surface-container"
              }`}
              title="Click to center on map"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`font-mono font-bold text-xs rounded-full w-7 h-7 flex items-center justify-center shrink-0 ${
                    isTop
                      ? "bg-red-600 text-white"
                      : rankNumber <= 3
                      ? "bg-amber-600 text-white"
                      : "bg-surface-container-high text-surface-on"
                  }`}
                >
                  #{rankNumber}
                </span>

                <div className="space-y-0.5">
                  <p className="font-bold text-surface-on text-xs sm:text-sm m-0 leading-tight">
                    {h.junction_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-surface-on-variant">
                    <span>{h.incident_count} events</span>
                    <span>·</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-surface-container">
                      {h.primary_window}
                    </span>
                    <span>·</span>
                    <span className="capitalize">{h.primary_cause.replace("_", " ")}</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-bold text-xs sm:text-sm text-warning-on-container">
                  {showDemoHistory ? `${h.total_delay_hours} hrs` : "Live view"}
                </div>
                <span className="text-[10px] text-surface-on-variant block">
                  {showDemoHistory ? `~${h.average_delay_minutes}m avg` : `${h.incident_count} reports`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedHotspotId && (
        <div className="pt-2 flex items-center justify-between text-xs text-surface-on-variant border-t border-surface-container">
          <span>
            Focusing on: <strong className="text-surface-on">{selectedHotspotId}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSelectedHotspotId(null)}
            className="text-primary hover:underline text-xs"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );

  const quickReviewCard = (
    <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-surface-on">Active Incident Review Queue</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
          {liveIncidents.length} REPORTED
        </span>
      </div>
      <p className="text-xs text-surface-on-variant m-0">
        Community reports awaiting authority verification (L6 confirmation, OSRM route spread analysis, or resolution).
      </p>
      <button
        type="button"
        onClick={() => setActiveTab("review")}
        className="button secondary text-xs w-full py-1.5 mt-1"
      >
        Open Incident Review Console →
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Executive Command Toolbar */}
      <div className="p-4 rounded-xl border border-surface-container bg-surface-container-lowest shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Analysis Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-xs font-semibold text-surface-on-variant" htmlFor="month-select">
              Analysis Window:
            </label>
            <select
              id="month-select"
              className="text-xs rounded-lg border border-surface-container bg-surface-container-low px-3 py-1.5 text-surface-on font-medium focus:ring-2 focus:ring-primary"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="all">All Available Months (Jul – Oct 2026)</option>
              <option value="2026-07">July 2026</option>
              <option value="2026-08">August 2026</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-10">October 2026</option>
            </select>

            <span className="text-[10px] font-mono px-2 py-1 rounded bg-surface-container-high text-surface-on-variant font-bold">
              {showDemoHistory ? "SIMULATED + LIVE DATA" : `LIVE ONLY (${liveIncidents.length} stored)`}
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="button secondary text-xs px-3.5 py-1.5 flex items-center gap-1.5"
              onClick={() => void refreshLiveIncidents()}
              title="Refresh live incident records"
            >
              <span>↻</span>
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="button text-xs px-3.5 py-1.5 flex items-center gap-1.5"
              onClick={exportCsv}
              title="Download filtered incident data as CSV"
              aria-label="Export CSV"
            >
              <span>↓</span>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Demo History Switch & Honest Data Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-surface-container/60">
          <label htmlFor="demo-history-toggle" className="flex items-center gap-2 cursor-pointer text-xs font-medium text-surface-on">
            <input
              id="demo-history-toggle"
              type="checkbox"
              checked={showDemoHistory}
              onChange={(e) => setShowDemoHistory(e.target.checked)}
              className="rounded border-surface-container text-primary"
            />
            <span>Include 4-month simulated demo history (for corridor congestion trend evaluation)</span>
          </label>
          <span className="text-[11px] text-surface-on-variant">
            {showDemoHistory ? "Synthetic observations enabled" : "Strict live reports only"}
          </span>
        </div>
      </div>

      {showDemoHistory && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-100 flex items-start gap-2.5 shadow-sm">
          <span className="text-base leading-none">ℹ️</span>
          <span>
            <strong>DEMO HISTORY ACTIVE:</strong> Displaying 4 months of synthetic historical incidents for long-term corridor trend evaluation alongside real citizen reports. Off by default per honesty rules so real counts are never inflated.
          </span>
        </div>
      )}

      {/* Navigation View Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-surface-container pb-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === "all"
              ? "bg-primary text-white shadow-sm"
              : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
          }`}
        >
          📊 Executive Dashboard Grid
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "map"}
          onClick={() => setActiveTab("map")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === "map"
              ? "bg-primary text-white shadow-sm"
              : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
          }`}
        >
          🗺️ Corridor Hotspot Map &amp; Rankings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "review"}
          onClick={() => setActiveTab("review")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === "review"
              ? "bg-primary text-white shadow-sm"
              : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
          }`}
        >
          🚨 Incident Review &amp; Verification
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "diagnostics"}
          onClick={() => setActiveTab("diagnostics")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === "diagnostics"
              ? "bg-primary text-white shadow-sm"
              : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
          }`}
        >
          🗓️ Recurrence Heatmap &amp; Causes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          onClick={() => setActiveTab("history")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
            activeTab === "history"
              ? "bg-primary text-white shadow-sm"
              : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
          }`}
        >
          📜 Incident Audit Log
        </button>
      </div>

      {/* Row 1: KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-surface-on-variant">
              <span>Total Incidents</span>
              <span className="text-base">🚨</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-surface-on mt-1 tracking-tight">
              {data.total_incidents}
            </div>
          </div>
          <span className="text-[11px] text-surface-on-variant mt-2 pt-2 border-t border-surface-container/60">
            {showDemoHistory ? "Synthetic + live observations" : "Real stored observations"}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-surface-on-variant">
              <span>Total Commuter Delay</span>
              <span className="text-base">⏱️</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-warning-on-container mt-1 tracking-tight">
              {showDemoHistory ? `${data.total_delay_hours} hrs` : "Not measured"}
            </div>
          </div>
          <span className="text-[11px] text-surface-on-variant mt-2 pt-2 border-t border-surface-container/60">
            {showDemoHistory ? "Synthetic history model" : "Live reports do not measure delay"}
          </span>
        </div>

        <div
          onClick={() => {
            const top = data.hotspots[0]?.junction_id;
            if (top) setSelectedHotspotId(top);
          }}
          className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm flex flex-col justify-between cursor-pointer hover:border-primary/50 transition"
          title="Click to locate top hotspot on map"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-surface-on-variant">
              <span>Top Congested Hotspot</span>
              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                #1 RANK
              </span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-primary mt-1 truncate" title={data.top_hotspot}>
              {data.top_hotspot}
            </div>
          </div>
          <span className="text-[11px] text-surface-on-variant mt-2 pt-2 border-t border-surface-container/60 flex items-center justify-between">
            <span>Highest delay impact</span>
            <span className="text-primary font-medium">Locate ↗</span>
          </span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-surface-on-variant">
              <span>Primary Trigger Cause</span>
              <span className="text-base">🔍</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-surface-on mt-1 truncate capitalize" title={data.primary_cause}>
              {data.primary_cause.replace("_", " ")}
            </div>
          </div>
          <span className="text-[11px] text-surface-on-variant mt-2 pt-2 border-t border-surface-container/60">
            Most frequent corridor factor
          </span>
        </div>
      </div>

      {/* Row 2: Operational Corridor (OSM Map + Hotspot Rankings & Decision Support) */}
      {(activeTab === "all" || activeTab === "map") && (
        <div className="space-y-6">
          {/* Map Section Header with Big Screen Hero vs Split View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-surface-on m-0">
                Corridor Hotspot Map
              </h2>
              <p className="text-xs text-surface-on-variant m-0">
                Live OpenStreetMap showing ranked congestion nodes and citizen reports along Mangaluru central corridor.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-primary font-bold hidden sm:inline">
                {data.hotspots.length} JUNCTIONS
              </span>
              <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-lg border border-surface-container text-xs shadow-sm">
                <button
                  type="button"
                  onClick={() => setMapLayout("hero")}
                  className={`px-3 py-1 rounded font-semibold transition ${
                    mapLayout === "hero"
                      ? "bg-primary text-white shadow-sm"
                      : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
                  }`}
                >
                  🖥️ Big Screen Hero
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayout("split")}
                  className={`px-3 py-1 rounded font-semibold transition ${
                    mapLayout === "split"
                      ? "bg-primary text-white shadow-sm"
                      : "text-surface-on-variant hover:text-surface-on hover:bg-surface-container"
                  }`}
                >
                  ◫ Split View
                </button>
              </div>
            </div>
          </div>

          {mapLayout === "hero" ? (
            /* Big Screen Hero View: Full-width Map across 100% of the screen */
            <div className="space-y-6">
              <HotspotMap
                hotspots={data.hotspots}
                liveIncidents={data.incidents}
                selectedHotspotId={selectedHotspotId}
                onSelectHotspot={setSelectedHotspotId}
                showDemoHistory={showDemoHistory}
                heightClassName="h-[620px] sm:h-[720px] lg:h-[780px]"
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-6 space-y-6">
                  {problemReportCard}
                </div>
                <div className="lg:col-span-6 space-y-6">
                  {hotspotRankingsCard}
                  {quickReviewCard}
                </div>
              </div>
            </div>
          ) : (
            /* Split View: Side-by-side 7:5 columns */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 space-y-6">
                <HotspotMap
                  hotspots={data.hotspots}
                  liveIncidents={data.incidents}
                  selectedHotspotId={selectedHotspotId}
                  onSelectHotspot={setSelectedHotspotId}
                  showDemoHistory={showDemoHistory}
                  heightClassName="h-[620px] lg:h-[680px]"
                />
                {problemReportCard}
              </div>
              <div className="lg:col-span-5 space-y-6">
                {hotspotRankingsCard}
                {quickReviewCard}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Active Incident Review Console */}
      {(activeTab === "all" || activeTab === "review") && (
        <div className="space-y-2">
          <IncidentReviewPanel />
        </div>
      )}

      {/* Row 4: Diagnostics & Heatmap (Recurrence Heatmap + Cause Distribution) */}
      {(activeTab === "all" || activeTab === "diagnostics") && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (7 cols): Recurrence Heatmap */}
          <div className="lg:col-span-7 p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container pb-2">
              <div>
                <h2 className="text-base font-bold text-surface-on m-0">Recurrence Heatmap</h2>
                <p className="text-xs text-surface-on-variant m-0">
                  Incident frequency by weekday and 30-minute time slot (IST). SIMULATED trend baseline.
                </p>
              </div>
              <span className="text-[10px] font-mono text-surface-on-variant">ASIA/KOLKATA (+05:30)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="text-[10px] border-collapse w-full" aria-label="Incident recurrence heatmap">
                <thead>
                  <tr>
                    <th className="py-1 px-2 text-left text-surface-on-variant font-medium">Day \ Slot</th>
                    {activeSlots.map((slot) => (
                      <th key={slot} className="py-1 px-1 font-mono text-surface-on-variant font-normal whitespace-nowrap text-center">
                        {slot}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_LABELS.map((label, dayIdx) => (
                    <tr key={dayIdx}>
                      <td className="py-1 px-2 font-medium text-surface-on whitespace-nowrap">{label}</td>
                      {activeSlots.map((slot) => {
                        const count = heatmap[dayIdx]?.[slot] ?? 0;
                        return (
                          <td
                            key={slot}
                            title={`${label} ${slot}: ${count} incident${count !== 1 ? "s" : ""}`}
                            className={`py-1 px-1 text-center rounded transition ${heatCellStyle(count)}`}
                            style={{ minWidth: "26px" }}
                          >
                            {count > 0 ? count : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recurrence Statement & Junction Filter */}
            <div className="pt-3 border-t border-surface-container space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-surface-on-variant" htmlFor="junction-select">
                  Recurrence statement for:
                </label>
                <select
                  id="junction-select"
                  className="text-xs rounded-lg border border-surface-container bg-surface-container-low px-3 py-1.5 text-surface-on font-medium"
                  value={selectedJunction}
                  onChange={(e) => setSelectedJunction(e.target.value)}
                >
                  <option value="all">All Corridors &amp; Junctions</option>
                  {MANGALURU_JUNCTIONS.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs sm:text-sm text-surface-on font-medium border-l-4 border-primary pl-3 py-1.5 bg-surface-container-low rounded-r-lg m-0">
                {recurrenceStatement}
              </p>
              <p className="text-[10px] text-surface-on-variant m-0">
                N and M computed from synthetic incident timestamps in Asia/Kolkata. Decision support only.
              </p>
            </div>
          </div>

          {/* Right Column (5 cols): Cause Mix & Delay by Incident Type */}
          <div className="lg:col-span-5 space-y-6">
            {/* Incident Cause Distribution */}
            <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
              <div>
                <h2 className="text-base font-bold text-surface-on m-0">Incident Cause Distribution</h2>
                <p className="text-xs text-surface-on-variant m-0">
                  Relative frequency of contributing factors across the selected analysis window.
                </p>
              </div>

              <div className="space-y-2.5">
                {data.cause_mix.map((c) => (
                  <div key={c.cause} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-surface-on">{c.label}</span>
                      <span className="font-mono text-surface-on-variant text-[11px]">
                        {c.count} ({c.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.max(c.percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-cause Delay Table */}
            <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
              <div>
                <h2 className="text-base font-bold text-surface-on m-0">Delay by Incident Type</h2>
                <p className="text-xs text-surface-on-variant m-0">
                  Per-reason incident count and total delay hours, sorted by delay impact (PDF §8).
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-surface-container text-surface-on-variant">
                      <th className="py-2 px-2.5">Cause</th>
                      <th className="py-2 px-2.5 text-right">Incidents</th>
                      <th className="py-2 px-2.5 text-right">Delay (hrs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {causeDelaySummary.map((row) => (
                      <tr key={row.cause} className="hover:bg-surface-container-low transition">
                        <td className="py-2 px-2.5 font-semibold text-surface-on">{row.label}</td>
                        <td className="py-2 px-2.5 text-right font-mono">{row.count}</td>
                        <td className="py-2 px-2.5 text-right font-bold text-warning-on-container">
                          {showDemoHistory ? row.total_delay_hours : "Not measured"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Row 5: Historical Incident Log */}
      {(activeTab === "all" || activeTab === "history") && (
        <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container pb-2">
            <div>
              <h2 className="text-base font-bold text-surface-on m-0">Auditable Incident Log</h2>
              <p className="text-xs text-surface-on-variant m-0">
                Complete record of stored observations and citizen incident submissions (Asia/Kolkata timestamps).
              </p>
            </div>
            <span className="text-xs font-mono text-surface-on-variant">{data.incidents.length} TOTAL ROWS</span>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-surface-container-lowest border-b border-surface-container z-10">
                <tr className="text-surface-on-variant">
                  <th className="py-2 px-3">Date / Time (IST)</th>
                  <th className="py-2 px-3">Junction</th>
                  <th className="py-2 px-3">Direction</th>
                  <th className="py-2 px-3">Cause</th>
                  <th className="py-2 px-3">Delay</th>
                  <th className="py-2 px-3">Duration</th>
                  <th className="py-2 px-3">Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {data.incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-surface-container-low transition">
                    <td className="py-2 px-3 font-mono whitespace-nowrap">
                      {new Intl.DateTimeFormat("en-GB", {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      }).format(new Date(inc.occurred_at))}
                    </td>
                    <td className="py-2 px-3 font-medium text-surface-on">{inc.junction_name}</td>
                    <td className="py-2 px-3 capitalize">{inc.direction}</td>
                    <td className="py-2 px-3 capitalize">{inc.cause.replace("_", " ")}</td>
                    <td className="py-2 px-3 font-bold text-warning-on-container">
                      {inc.provenance === "simulated" ? `${inc.commuter_delay_minutes} min` : "Not measured"}
                    </td>
                    <td className="py-2 px-3">
                      {inc.provenance === "simulated" ? `${inc.duration_minutes} min` : "Not measured"}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container font-semibold">
                        {inc.provenance.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
