"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { computeAnalytics, computeRecurrenceHeatmap, computeRecurrenceStatement, computeCauseDelaySummary } from "@/lib/analytics/metrics";
import { MANGALURU_JUNCTIONS, HISTORICAL_INCIDENTS, type HistoricalIncident } from "@/lib/analytics/history";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Colour scale for heatmap cells: 0→transparent, 1-2→light amber, 3-4→medium amber, 5+→strong red
function heatCellStyle(count: number): string {
  if (count === 0) return "bg-surface-container";
  if (count <= 2) return "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-100";
  if (count <= 4) return "bg-amber-300 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-semibold";
  return "bg-red-400 dark:bg-red-700 text-white font-bold";
}

// Corridor hotspot schematic: simplified coordinate map for numbered marker overlay
// These are relative positions (% of a 320×180 viewBox) approximating the Mangaluru corridor.
const HOTSPOT_COORDS: Record<string, { x: number; y: number }> = {
  "hampankatta": { x: 60, y: 90 },
  "ksrtc-bejai": { x: 200, y: 70 },
  "jyothi-ambedkar": { x: 100, y: 130 },
  "ladyhill": { x: 240, y: 140 },
  "pumpwell": { x: 30, y: 60 },
};

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
    // Equirectangular approximation is plenty accurate at city scale.
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

export function AuthorityDashboard() {
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedJunction, setSelectedJunction] = useState("all");
  const [showDemoHistory, setShowDemoHistory] = useState(false);
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

  // Derive hour slots from heatmap keys of day 0 (all days have same slots)
  const hourSlots = useMemo(() => Object.keys(heatmap[0] ?? {}).sort(), [heatmap]);
  // Show only slots that contain any incident across all days for compactness
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

  return (
    <div className="space-y-6">
      {/* Demo History Toggle (Plan 4 Section 9) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-surface-container bg-surface-container-low">
        <label htmlFor="demo-history-toggle" className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-surface-on">
          <input
            id="demo-history-toggle"
            type="checkbox"
            checked={showDemoHistory}
            onChange={(e) => setShowDemoHistory(e.target.checked)}
            className="rounded border-surface-container"
          />
          Include 4-month simulated demo history (for trend demonstration)
        </label>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container-high text-surface-on-variant">
          {showDemoHistory ? "SIMULATED + LIVE DATA" : `LIVE ROWS ONLY (${liveIncidents.length} stored)`}
        </span>
      </div>

      {showDemoHistory && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-100 flex items-start gap-2">
          <span className="text-sm">ℹ️</span>
          <span>
            <strong>DEMO HISTORY ACTIVE:</strong> Showing 4 months of synthetic historical incidents for long-term trend demonstration alongside real reports. Off by default per Plan 4 honesty rules so real counts are never inflated.
          </span>
        </div>
      )}

      {/* Month filter */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-surface-on-variant" htmlFor="month-select">
          Analysis period
        </label>
        <select
          id="month-select"
          className="text-xs rounded-lg border border-surface-container bg-surface-container-lowest px-3 py-1.5 text-surface-on"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          <option value="all">All months (Jul – Oct 2026)</option>
          <option value="2026-07">July 2026</option>
          <option value="2026-08">August 2026</option>
          <option value="2026-09">September 2026</option>
          <option value="2026-10">October 2026</option>
        </select>
        {/* Export on its own row on mobile, inline on desktop */}
        <div className="flex-1 flex justify-end">
          <button
            className="button text-xs px-4 py-1.5"
            onClick={exportCsv}
            title="Download incident log as CSV"
            aria-label="Export CSV"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm">
          <span className="text-xs text-surface-on-variant block">Total Incidents</span>
          <span className="text-2xl font-bold text-surface-on mt-1 block">{data.total_incidents}</span>
          <span className="text-[11px] text-surface-on-variant">
            {showDemoHistory ? "Synthetic + live observations" : "Real stored observations"}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm">
          <span className="text-xs text-surface-on-variant block">Total Commuter Delay</span>
          <span className="text-2xl font-bold text-warning-on-container mt-1 block">
            {showDemoHistory ? `${data.total_delay_hours} hrs` : "Not measured"}
          </span>
          <span className="text-[11px] text-surface-on-variant">{showDemoHistory ? "Synthetic history only" : "Live reports do not measure delay"}</span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm">
          <span className="text-xs text-surface-on-variant block">Top Congested Hotspot</span>
          <span className="text-lg font-bold text-primary mt-1 block truncate" title={data.top_hotspot}>
            {data.top_hotspot}
          </span>
          <span className="text-[11px] text-surface-on-variant">Highest delay concentration</span>
        </div>

        <div className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm">
          <span className="text-xs text-surface-on-variant block">Primary Cause</span>
          <span className="text-lg font-bold text-surface-on mt-1 block truncate" title={data.primary_cause}>
            {data.primary_cause}
          </span>
          <span className="text-[11px] text-surface-on-variant">Most frequent trigger</span>
        </div>
      </div>

      <section className="p-5 rounded-xl bg-surface-container-lowest border border-primary/30 shadow-sm space-y-3" aria-labelledby="problem-report-title">
        <div>
          <p className="text-[10px] font-mono text-primary">AUTHORITY PROBLEM REPORT</p>
          <h2 id="problem-report-title" className="text-base font-bold text-surface-on">Where to investigate next</h2>
          <p className="text-xs text-surface-on-variant">This is a decision-support summary, not a confirmed cause finding or an engineering mandate.</p>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-surface-container-low p-3"><dt className="text-xs text-surface-on-variant">Priority location</dt><dd className="font-semibold text-surface-on mt-1">{data.top_hotspot}</dd></div>
          <div className="rounded-lg bg-surface-container-low p-3"><dt className="text-xs text-surface-on-variant">Reported cause mix</dt><dd className="font-semibold text-surface-on mt-1">{data.primary_cause}</dd></div>
          <div className="rounded-lg bg-surface-container-low p-3"><dt className="text-xs text-surface-on-variant">Recurrence</dt><dd className="font-semibold text-surface-on mt-1">{showDemoHistory ? recurrenceStatement : "Live-only records; collect a longer time window."}</dd></div>
          <div className="rounded-lg bg-surface-container-low p-3"><dt className="text-xs text-surface-on-variant">Delay evidence</dt><dd className="font-semibold text-surface-on mt-1">{showDemoHistory ? "Synthetic history only" : "Not measured for live reports"}</dd></div>
        </dl>
        <p className="text-xs border-l-4 border-primary bg-surface-container-low px-3 py-2 rounded-r-lg text-surface-on"><strong>Suggested investigation:</strong> {investigation}</p>
      </section>

      {/* Hotspot map — schematic SVG with numbered rank markers */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
        <div>
          <h2 className="text-base font-bold text-surface-on">Corridor Hotspot Map</h2>
          <p className="text-xs text-surface-on-variant">
            Ranked markers overlaid on the Mangaluru corridor schematic. Numbers indicate delay-based rank (1 = worst). SIMULATED data.
          </p>
        </div>
        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 320 180"
            aria-label="Mangaluru corridor hotspot map schematic"
            className="w-full max-w-lg border border-surface-container rounded-lg bg-surface-container-low"
            style={{ minWidth: "240px" }}
          >
            {/* Schematic road lines */}
            <line x1="20" y1="90" x2="280" y2="90" stroke="currentColor" strokeOpacity="0.2" strokeWidth="6" strokeLinecap="round" />
            <line x1="80" y1="50" x2="260" y2="150" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" strokeLinecap="round" />
            <text x="8" y="85" fontSize="7" className="fill-current opacity-40">Primary route →</text>
            <text x="62" y="45" fontSize="6" className="fill-current opacity-30">Alt →</text>
            {/* Ranked hotspot markers */}
            {data.hotspots.map((h, index) => {
              const coords = HOTSPOT_COORDS[h.junction_id];
              if (!coords) return null;
              return (
                <g key={h.junction_id}>
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r="14"
                    className="fill-primary opacity-90"
                  />
                  <text
                    x={coords.x}
                    y={coords.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                    fontWeight="bold"
                    className="fill-white"
                  >
                    #{index + 1}
                  </text>
                  <text
                    x={coords.x}
                    y={coords.y + 22}
                    textAnchor="middle"
                    fontSize="6"
                    className="fill-current opacity-70"
                  >
                    {h.junction_name.split(" ")[0]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Hotspots Ranking Table — responsive: table on desktop, cards on mobile */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-surface-on">Corridor Hotspot Rankings</h2>
            <p className="text-xs text-surface-on-variant">
              Junctions prioritized by total commuter delay-hours and recurrence frequency.
            </p>
          </div>
          <span className="text-xs font-mono text-primary font-bold hidden sm:block">SORT: TOTAL DELAY (DESC)</span>
        </div>

        {/* Desktop table — hidden on mobile */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-surface-container text-surface-on-variant">
                <th className="py-2.5 px-3"># Rank</th>
                <th className="py-2.5 px-3">Junction</th>
                <th className="py-2.5 px-3">Total Delay</th>
                <th className="py-2.5 px-3">Incidents</th>
                <th className="py-2.5 px-3">Avg Delay</th>
                <th className="py-2.5 px-3">Peak Window</th>
                <th className="py-2.5 px-3">Predominant Cause</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {data.hotspots.map((h, index) => (
                <tr key={h.junction_id} className="hover:bg-surface-container-low transition">
                  <td className="py-3 px-3 font-mono font-bold text-primary">#{index + 1}</td>
                  <td className="py-3 px-3 font-semibold text-surface-on">{h.junction_name}</td>
                  <td className="py-3 px-3 font-bold text-warning-on-container">{showDemoHistory ? `${h.total_delay_hours} hrs` : "Not measured"}</td>
                  <td className="py-3 px-3">{h.incident_count} events</td>
                  <td className="py-3 px-3">{showDemoHistory ? `~${h.average_delay_minutes} min` : "Not measured"}</td>
                  <td className="py-3 px-3 font-mono">{h.primary_window}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex px-2 py-0.5 rounded bg-surface-container text-surface-on font-medium">
                      {h.primary_cause}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards — visible only on mobile */}
        <div className="sm:hidden space-y-3">
          {data.hotspots.map((h, index) => (
            <div
              key={h.junction_id}
              className="rounded-lg border border-surface-container bg-surface-container-low p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-primary text-sm">#{index + 1}</span>
                <span className="text-[10px] font-mono bg-surface-container px-2 py-0.5 rounded text-surface-on-variant">
                  {h.primary_window}
                </span>
              </div>
              <p className="font-semibold text-surface-on text-sm leading-tight">{h.junction_name}</p>
              <div className="flex items-center gap-4 text-xs text-surface-on-variant">
                <span>
                  <span className="font-bold text-warning-on-container">{showDemoHistory ? `${h.total_delay_hours} hrs` : "Not measured"}</span> total delay
                </span>
                <span>{h.incident_count} events</span>
              </div>
              <div className="text-xs text-surface-on-variant">
                Avg <span className="font-semibold">{showDemoHistory ? `~${h.average_delay_minutes} min` : "Not measured"}</span> ·{" "}
                <span className="px-1.5 py-0.5 rounded bg-surface-container text-surface-on font-medium">
                  {h.primary_cause}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recurrence heatmap */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
        <div>
          <h2 className="text-base font-bold text-surface-on">Recurrence Heatmap</h2>
          <p className="text-xs text-surface-on-variant">
            Incident frequency by weekday and 30-minute time slot (IST). Darker cells indicate higher recurrence.
            Data is SIMULATED.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="text-[10px] border-collapse" aria-label="Incident recurrence heatmap">
            <thead>
              <tr>
                <th className="py-1 px-2 text-left text-surface-on-variant font-medium">Day \ Slot</th>
                {activeSlots.map((slot) => (
                  <th key={slot} className="py-1 px-1 font-mono text-surface-on-variant font-normal whitespace-nowrap">
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
                        style={{ minWidth: "28px" }}
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

        {/* Recurrence statement */}
        <div className="pt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-surface-on-variant" htmlFor="junction-select">
              Recurrence for:
            </label>
            <select
              id="junction-select"
              className="text-xs rounded-lg border border-surface-container bg-surface-container-lowest px-3 py-1.5 text-surface-on"
              value={selectedJunction}
              onChange={(e) => setSelectedJunction(e.target.value)}
            >
              <option value="all">All junctions</option>
              {MANGALURU_JUNCTIONS.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </div>
          <p className="text-sm text-surface-on font-medium border-l-4 border-primary pl-3 py-1 bg-surface-container-low rounded-r-lg">
            {recurrenceStatement}
          </p>
          <p className="text-[10px] text-surface-on-variant">
            N and M computed from synthetic incident timestamps in Asia/Kolkata. Not a prediction.
          </p>
        </div>
      </div>

      {/* Per-cause delay table (PDF §8) */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
        <div>
          <h2 className="text-base font-bold text-surface-on">Delay by Incident Type</h2>
          <p className="text-xs text-surface-on-variant">
            Per-reason incident count and total delay hours, sorted by delay impact. As described in PDF §8.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-surface-container text-surface-on-variant">
                <th className="py-2 px-3">Cause</th>
                <th className="py-2 px-3 text-right">Incidents</th>
                <th className="py-2 px-3 text-right">Total Delay (hrs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {causeDelaySummary.map((row) => (
                <tr key={row.cause} className="hover:bg-surface-container-low transition">
                  <td className="py-2.5 px-3 font-semibold text-surface-on">{row.label}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{row.count}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-warning-on-container">{showDemoHistory ? row.total_delay_hours : "Not measured"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cause Mix & Breakdown */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-surface-on">Incident Cause Distribution</h2>
          <p className="text-xs text-surface-on-variant">
            Relative frequency of contributing factors across the selected analysis window.
          </p>
        </div>

        <div className="space-y-3">
          {data.cause_mix.map((c) => (
            <div key={c.cause} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-surface-on">{c.label}</span>
                <span className="font-mono text-surface-on-variant">
                  {c.count} incidents ({c.percentage}%)
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

      {/* Incident History Log */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-surface-on">Historical Incident Log</h2>
          <span className="text-xs text-surface-on-variant">Timestamps displayed in Asia/Kolkata</span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-surface-container-lowest border-b border-surface-container">
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
                  <td className="py-2 px-3 font-mono">
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
                  <td className="py-2 px-3 font-medium">{inc.junction_name}</td>
                  <td className="py-2 px-3 capitalize">{inc.direction}</td>
                  <td className="py-2 px-3 capitalize">{inc.cause.replace("_", " ")}</td>
                  <td className="py-2 px-3 font-bold text-warning-on-container">{inc.provenance === "simulated" ? `${inc.commuter_delay_minutes} min` : "Not measured"}</td>
                  <td className="py-2 px-3">{inc.provenance === "simulated" ? `${inc.duration_minutes} min` : "Not measured"}</td>
                  <td className="py-2 px-3">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container">
                      {inc.provenance.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
