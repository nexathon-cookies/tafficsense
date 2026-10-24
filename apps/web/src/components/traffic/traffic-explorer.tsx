"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { reportCategories, reportCategoryIcons } from "@/lib/reports/rules";
import { IncidentIcon } from "@/components/icons/incident-icons";
import { useSearchParams } from "next/navigation";
import type { TrafficSnapshot } from "@/lib/traffic/snapshot";
import type { PublicIncident, PublicTraversal } from "@/lib/traffic/phase4";
import { incidentView, traversalView } from "@/lib/traffic/phase4-presentation";
import type { RouteAlert } from "@/lib/route-alerts/rules";
import type { RouteComparison } from "@/lib/route-alerts/snapshot";
import { routeAlertView } from "@/lib/route-alerts/presentation";
import { resolveSegment } from "@/lib/traffic/presentation";
import { assessmentView } from "@/lib/evidence/assessment";
import type { SlowdownAssessment } from "@/lib/evidence/slowdown";
import { slowdownView } from "@/lib/evidence/slowdown-presentation";
import { useAssessmentClock } from "./use-assessment-clock";
import { RefreshTraffic } from "./refresh-traffic";
import { TrafficMap } from "./traffic-map";
import type { LiveIncident } from "@/lib/incidents/server";
import { findNearestPreset } from "@/lib/routing/presets";

export function TrafficExplorer({ snapshot, slowdownAssessments, incidents, traversals, routeAlerts }: {
  snapshot: TrafficSnapshot; slowdownAssessments: SlowdownAssessment[]; incidents: PublicIncident[]; traversals: PublicTraversal[];
  routeComparison: RouteComparison; routeAlerts: RouteAlert[];
}) {
  const params = useSearchParams();
  const deadlines = useMemo(() => [...slowdownAssessments, ...incidents, ...traversals, ...routeAlerts],
    [slowdownAssessments, incidents, traversals, routeAlerts]);
  const { elapsedMs, refreshStarted } = useAssessmentClock(snapshot, deadlines);
  const alertViews = Object.fromEntries(routeAlerts.map(row => [row.segment_id, routeAlertView(row, snapshot.read_at, elapsedMs)]));
  const incidentViews = Object.fromEntries(incidents.map(row => [row.id, incidentView(row, snapshot.read_at, elapsedMs)]));
  const traversalViews = Object.fromEntries(traversals.map(row => [row.segment_id, traversalView(row, snapshot.read_at, elapsedMs)]));
  const lifecycleLabels = Object.fromEntries((snapshot.fixture?.segments ?? []).map(segment => {
    const rows = incidents.filter(row => row.segment_id === segment.id).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const current = rows.find(row => row.is_current) ?? rows[0];
    return [segment.id, current ? incidentViews[current.id].label : "No retained incident · road status unknown"];
  }));
  const slowdowns = Object.fromEntries(slowdownAssessments.map(row =>
    [row.segment_id, slowdownView(row, snapshot.read_at, elapsedMs)]));
  const assessments = Object.fromEntries(snapshot.report_assessments.map(row =>
    [row.segment_id, assessmentView(row, snapshot.read_at, elapsedMs)]));
  const episodeCounts = Object.fromEntries((snapshot.fixture?.segments ?? []).map(segment =>
    [segment.id, snapshot.incident_episodes.filter(episode => episode.segment_id === segment.id).length]));
  const [directionFilter, setDirectionFilter] = useState<"all" | "outbound" | "inbound">("all");
  const selectSegment = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("segment", id);
    window.history.pushState(null, "", url);
  }, []);

  const fixture = snapshot.fixture;

  const initialIncidentId = params.get("incident");
  const [selectedLiveIncidentId, setSelectedLiveIncidentId] = useState<string | null>(initialIncidentId);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [incidentFilter, setIncidentFilter] = useState<"all" | "verified" | "accident" | "hazards">("all");

  const filteredIncidents = useMemo(() => {
    return liveIncidents.filter((inc) => {
      if (incidentFilter === "verified") return ["L3", "L4", "L5", "L6"].includes(inc.level);
      if (incidentFilter === "accident") return inc.category === "accident";
      if (incidentFilter === "hazards") return ["flood", "road_closed", "hazard"].includes(inc.category);
      return true;
    });
  }, [liveIncidents, incidentFilter]);

  if (!fixture) return (
    <div className="panel" role="status">
      <h2>No synthetic traffic data</h2>
      <p>No demonstration corridor is loaded. This does not mean roads are clear. A local operator can load a scenario; guest browsing cannot run the simulator.</p>
      {params.has("segment") && <p>The requested segment is not available in this empty dataset.</p>}
      <RefreshTraffic onRefresh={refreshStarted} />
    </div>
  );
  const selected = resolveSegment(fixture, params.getAll("segment"));
  const visibleSegments = fixture.segments.filter(s => directionFilter === "all" || s.direction === directionFilter);

  return (
    <div data-testid="traffic-ready" className="relative w-full h-full overflow-hidden flex flex-col">
      {/* Fullscreen Map Canvas */}
      <TrafficMap
        fixture={fixture}
        reports={snapshot.reports}
        assessments={assessments}
        slowdowns={slowdowns}
        episodeCounts={episodeCounts}
        lifecycleLabels={lifecycleLabels}
        traversalViews={traversalViews}
        alertViews={alertViews}
        selectedId={selected?.id ?? null}
        onSelect={selectSegment}
        activeLiveIncidentId={selectedLiveIncidentId}
        onSelectLiveIncident={setSelectedLiveIncidentId}
        onIncidentsChange={setLiveIncidents}
      />

      {/* Floating Google Maps Overlay Panel on Top-Left */}
      <aside className="absolute top-4 left-4 z-20 w-80 sm:w-96 max-h-[calc(100vh-80px)] flex flex-col bg-surface/95 backdrop-blur-md rounded-2xl border border-surface-container shadow-2xl overflow-hidden pointer-events-auto">
        <div className="p-3.5 pb-2.5 border-b border-surface-container bg-surface-container-low/70">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-surface-on flex items-center gap-1.5 m-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Mangaluru Live Traffic
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
              ● {liveIncidents.length} REAL INCIDENT{liveIncidents.length !== 1 ? "S" : ""}
            </span>
          </div>
          <p className="text-[11px] text-surface-on-variant mt-1 m-0">
            Live database incidents from community commuters.
          </p>

          {/* Filter Chips */}
          <div className="flex items-center gap-1 mt-2.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Incident filters">
            <button
              type="button"
              onClick={() => setIncidentFilter("all")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition whitespace-nowrap ${
                incidentFilter === "all" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on hover:bg-surface-container-high"
              }`}
            >
              All ({liveIncidents.length})
            </button>
            <button
              type="button"
              onClick={() => setIncidentFilter("verified")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition whitespace-nowrap ${
                incidentFilter === "verified" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on hover:bg-surface-container-high"
              }`}
            >
              L3+ Verified ({liveIncidents.filter(i => ["L3", "L4", "L5", "L6"].includes(i.level)).length})
            </button>
            <button
              type="button"
              onClick={() => setIncidentFilter("accident")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition whitespace-nowrap ${
                incidentFilter === "accident" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on hover:bg-surface-container-high"
              }`}
            >
              Accidents
            </button>
            <button
              type="button"
              onClick={() => setIncidentFilter("hazards")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition whitespace-nowrap ${
                incidentFilter === "hazards" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on hover:bg-surface-container-high"
              }`}
            >
              Hazards
            </button>
          </div>
        </div>

        {/* Scrollable Feed of DB Incidents */}
        <div className="overflow-y-auto divide-y divide-surface-container flex-1 max-h-[300px]" role="list">
          {filteredIncidents.length === 0 ? (
            <p className="text-xs text-surface-on-variant p-4 text-center m-0">No incidents match this filter.</p>
          ) : (
            filteredIncidents.map(inc => {
              const preset = findNearestPreset([inc.lng, inc.lat]);
              const isSelected = inc.id === selectedLiveIncidentId;
              return (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => setSelectedLiveIncidentId(inc.id)}
                  className={`w-full text-left p-3 transition flex items-start gap-2.5 hover:bg-surface-container-low ${
                    isSelected ? "bg-primary/10 border-l-4 border-primary" : ""
                  }`}
                >
                  <span className="text-primary mt-0.5 shrink-0">
                    <IncidentIcon category={inc.category} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-surface-on truncate">
                        {preset?.name ?? reportCategories[inc.category]}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                        ["L3", "L4", "L5", "L6"].includes(inc.level)
                          ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                          : "bg-amber-50 text-amber-950 border-amber-200"
                      }`}>
                        {inc.level}
                      </span>
                    </div>
                    <p className="text-[11px] text-surface-on-variant m-0 truncate mt-0.5">
                      {reportCategories[inc.category]} · {inc.report_count} report{inc.report_count !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] text-surface-on-variant/80 m-0 truncate">
                      {inc.level_reason}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Route Planner Link */}
        <div className="p-2.5 border-t border-surface-container bg-surface-container-lowest flex items-center justify-between gap-2">
          <Link
            href="/planner"
            className="button text-xs py-1.5 px-3 w-full text-center font-semibold"
          >
            Plan Route in City Planner →
          </Link>
        </div>

        {/* Collapsible Corridor Details for Tests & Operator Tools */}
        <details className="border-t border-surface-container bg-surface-container-low/40 text-xs">
          <summary className="p-2.5 font-semibold text-surface-on cursor-pointer hover:bg-surface-container-low flex items-center justify-between select-none">
            <span>Corridor Segments & Analysis</span>
            <span className="text-[10px] text-surface-on-variant font-mono">L1–L6</span>
          </summary>
          <div className="p-2.5 pt-0 space-y-2 max-h-[220px] overflow-y-auto">
            <div className="flex items-center gap-1 text-[11px] pt-1">
              <button type="button" className={`px-2 py-0.5 rounded text-xs font-semibold ${directionFilter === "all" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on"}`} onClick={() => setDirectionFilter("all")}>All ({fixture.segments.length})</button>
              <button type="button" className={`px-2 py-0.5 rounded text-xs font-semibold ${directionFilter === "outbound" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on"}`} onClick={() => setDirectionFilter("outbound")}>Outbound</button>
              <button type="button" className={`px-2 py-0.5 rounded text-xs font-semibold ${directionFilter === "inbound" ? "bg-primary text-primary-on" : "bg-surface-container text-surface-on"}`} onClick={() => setDirectionFilter("inbound")}>Inbound</button>
            </div>
            <ul data-segment-list className="space-y-1">
              {visibleSegments.map(segment => (
                <li key={segment.id}>
                  <a
                    href={`/traffic?segment=${encodeURIComponent(segment.id)}`}
                    data-segment-id={segment.id}
                    aria-current={selected?.id === segment.id ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      selectSegment(segment.id);
                    }}
                    className="block p-1.5 rounded border border-surface-container text-[11px] hover:bg-surface-container"
                  >
                    {segment.name} ({segment.direction})
                  </a>
                </li>
              ))}
            </ul>
            <div className="pt-1">
              <RefreshTraffic onRefresh={refreshStarted} />
            </div>
          </div>
        </details>
      </aside>
    </div>
  );
}
