"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { reportCategories, reportCategoryIcons } from "@/lib/reports/rules";
import { getIncidentCauseBreakdown } from "@/lib/reports/incident-cause";
import { useSearchParams } from "next/navigation";
import type { TrafficSnapshot } from "@/lib/traffic/snapshot";
import type { PublicIncident, PublicTraversal } from "@/lib/traffic/phase4";
import { incidentView, traversalView } from "@/lib/traffic/phase4-presentation";
import type { RouteAlert } from "@/lib/route-alerts/rules";
import type { RouteComparison } from "@/lib/route-alerts/snapshot";
import { routeAlertView } from "@/lib/route-alerts/presentation";
import { episodeSummary, formatTrafficTime, latestSegmentSamples, resolveSegment, snapshotFreshness } from "@/lib/traffic/presentation";
import { assessmentView } from "@/lib/evidence/assessment";
import type { SlowdownAssessment } from "@/lib/evidence/slowdown";
import { slowdownView } from "@/lib/evidence/slowdown-presentation";
import { deriveSegmentStatus } from "@/lib/traffic/segment-status";
import { CorridorStrip } from "./corridor-strip";
import { RouteComparisonBar } from "./route-comparison-bar";
import { useAssessmentClock } from "./use-assessment-clock";
import { RefreshTraffic } from "./refresh-traffic";
import { TrafficMap } from "./traffic-map";
import { SimulatedBanner } from "../simulated-banner";
import { VerificationLadder } from "./verification-ladder";
import styles from "./traffic.module.css";

const freshnessLabels = {
  recent: "Recent synthetic samples", stale: "Stale synthetic samples",
  future: "Future-dated samples", missing: "No samples", unknown: "Sample freshness needs refresh",
};

export function TrafficExplorer({ snapshot, slowdownAssessments, incidents, traversals, routeComparison, routeAlerts }: {
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
  const freshness = useCallback(
    (observedAt: string | null) => snapshotFreshness(observedAt, snapshot.read_at, elapsedMs),
    [snapshot.read_at, elapsedMs]
  );
  const sampleLabel = (observedAt: string | null) => freshnessLabels[freshness(observedAt)];
  const selectSegment = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("segment", id);
    window.history.pushState(null, "", url);
  }, []);

  const fixture = snapshot.fixture;

  const segmentStatuses = useMemo(() => {
    if (!fixture) return {};
    return Object.fromEntries(
      fixture.segments.map(segment => {
        const samples = latestSegmentSamples(fixture, segment.id);
        const segmentFreshness = freshness(samples.observedAt);
        const traversal = traversalViews[segment.id];
        const delaySeconds = traversal?.delaySeconds ?? null;
        const segmentReports = snapshot.reports.filter(r => r.segment_id === segment.id);
        const hasRecentReport = segmentReports.some(r => freshness(r.observed_at) === "recent");
        const hasAlert = alertViews[segment.id]?.state === "alert";

        return [
          segment.id,
          deriveSegmentStatus({
            direction: segment.direction,
            hasAlert,
            slowdownState: slowdowns[segment.id]?.state,
            assessmentState: assessments[segment.id]?.state,
            hasRecentReport,
            delaySeconds,
            freshness: segmentFreshness,
          }),
        ];
      })
    );
  }, [fixture, alertViews, slowdowns, assessments, traversalViews, snapshot.reports, freshness]);

  if (!fixture) return (
    <div className="panel" role="status">
      <h2>No synthetic traffic data</h2>
      <p>No demonstration corridor is loaded. This does not mean roads are clear. A local operator can load a scenario; guest browsing cannot run the simulator.</p>
      {params.has("segment") && <p>The requested segment is not available in this empty dataset.</p>}
      <RefreshTraffic onRefresh={refreshStarted} />
    </div>
  );
  const selected = resolveSegment(fixture, params.getAll("segment"));
  const latest = selected ? latestSegmentSamples(fixture, selected.id) : null;
  const visibleSegments = fixture.segments.filter(s => directionFilter === "all" || s.direction === directionFilter);
  const selectedEpisodes = selected ? snapshot.incident_episodes.filter(episode => episode.segment_id === selected.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)) : [];
  const selectedIncidents = selected ? incidents.filter(row => row.segment_id === selected.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id)) : [];
  const selectedTraversal = selected ? traversals.find(row => row.segment_id === selected.id) : null;
  const selectedReports = selected ? snapshot.reports.filter(report => report.segment_id === selected.id)
    .sort((a, b) => b.received_at.localeCompare(a.received_at) || a.id.localeCompare(b.id)) : [];

  return (
    <div data-testid="traffic-ready" className={styles.explorer}>
      <SimulatedBanner />
      <div className={`panel ${styles.summary}`}>
        <div>
          <h2>{fixture.corridor.name}</h2>
          <p><strong>Stored scenario: {fixture.corridor.scenario}</strong></p>
          <p>{fixture.corridor.geometry_note}</p>
          <p className={styles.timestamp}>Scenario anchor: <time dateTime={fixture.corridor.anchor_at}>{formatTrafficTime(fixture.corridor.anchor_at)}</time></p>
          <p className={styles.timestamp}>Data read: <time dateTime={snapshot.read_at}>{formatTrafficTime(snapshot.read_at)}</time></p>
        </div>
        <RefreshTraffic onRefresh={refreshStarted} />
      </div>

      <CorridorStrip
        fixture={fixture}
        statuses={segmentStatuses}
        selectedId={selected?.id ?? null}
        onSelect={selectSegment}
      />

      <div className={styles.heroGrid}>
        <section className={`panel ${styles.mapPanel}`} aria-labelledby="map-title">
          <div className={styles.mapHeader}>
            <h2 id="map-title" className="m-0 text-xl font-bold">Corridor Map</h2>
            <span className="simulated-pill">SIMULATED · INTERACTIVE</span>
          </div>
          <TrafficMap fixture={fixture} reports={snapshot.reports} assessments={assessments} slowdowns={slowdowns} episodeCounts={episodeCounts}
            lifecycleLabels={lifecycleLabels} traversalViews={traversalViews} alertViews={alertViews} selectedId={selected?.id ?? null} onSelect={selectSegment} />
        </section>

        <section className={`panel ${styles.list}`} aria-labelledby="segment-list-title">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h2 id="segment-list-title" className="m-0 text-lg font-bold">Directed segments</h2>
            <div className={styles.directionToggle} role="group" aria-label="Filter segments by direction">
              <button
                type="button"
                className={`button ${directionFilter === "all" ? styles.toggleActive : "secondary"}`}
                onClick={() => setDirectionFilter("all")}
                aria-pressed={directionFilter === "all"}
              >
                All ({fixture.segments.length})
              </button>
              <button
                type="button"
                className={`button ${directionFilter === "outbound" ? styles.toggleActive : "secondary"}`}
                onClick={() => setDirectionFilter("outbound")}
                aria-pressed={directionFilter === "outbound"}
              >
                Outbound ({fixture.segments.filter(s => s.direction === "outbound").length})
              </button>
              <button
                type="button"
                className={`button ${directionFilter === "inbound" ? styles.toggleActive : "secondary"}`}
                onClick={() => setDirectionFilter("inbound")}
                aria-pressed={directionFilter === "inbound"}
              >
                Inbound ({fixture.segments.filter(s => s.direction === "inbound").length})
              </button>
            </div>
          </div>
          <p className="text-xs text-surface-on-variant mb-3">Choose a segment to match its map highlight and details. Speeds are synthetic inputs, not corroborated incidents.</p>
          <ul data-segment-list>
            {visibleSegments.map((segment) => {
              const originalIndex = fixture.segments.findIndex(s => s.id === segment.id);
              const samples = latestSegmentSamples(fixture, segment.id);
              const status = segmentStatuses[segment.id] ?? deriveSegmentStatus({
                direction: segment.direction,
                hasAlert: false,
                delaySeconds: null,
                hasRecentReport: false,
                freshness: "unknown",
              });
              return <li key={segment.id}>
                <a href={`/traffic?segment=${encodeURIComponent(segment.id)}`} data-segment-id={segment.id}
                  aria-current={selected?.id === segment.id ? "true" : undefined}
                  onClick={event => {
                    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault(); selectSegment(segment.id);
                  }}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardArrow} aria-hidden="true">{status.directionArrow}</span>
                      <strong className={styles.cardName}>{originalIndex + 1}. {segment.name}</strong>
                    </div>
                    <span
                      className={styles.cardChip}
                      style={{
                        color: status.color,
                        backgroundColor: status.bgColor,
                        borderColor: status.borderColor,
                      }}
                    >
                      {status.chipLabel}
                    </span>
                  </div>

                  <div className={styles.cardMetrics}>
                    <span className={styles.cardDelay} style={{ color: status.delayMinutes && status.delayMinutes > 0 ? status.color : "inherit" }}>
                      Delay: {status.delayText}
                    </span>
                    <span className={styles.cardAge}>
                      <span
                        className={`${styles.ageDot} ${
                          status.ageDot === "green" ? styles.dotGreen : status.ageDot === "amber" ? styles.dotAmber : styles.dotGrey
                        }`}
                        aria-hidden="true"
                      />
                      <span>{status.ageLabel}</span>
                    </span>
                  </div>

                  <details
                    className={styles.cardDetails}
                    onClick={e => e.stopPropagation()}
                  >
                    <summary onClick={e => e.stopPropagation()}>Technical details</summary>
                    <div className={styles.cardDetailsContent}>
                      <span>{segment.direction} · SIMULATED</span>
                      <span>{sampleLabel(samples.observedAt)}</span>
                      <span data-segment-report-count={segment.id}>{snapshot.reports.filter(report => report.segment_id === segment.id).length} unconfirmed demo reports, including stale reports</span>
                      <span data-segment-episodes={segment.id}>{episodeSummary(episodeCounts[segment.id])}</span>
                      <span data-segment-assessment={segment.id} data-assessment-state={assessments[segment.id].state}>{assessments[segment.id].label}</span>
                      <span data-segment-slowdown={segment.id} data-slowdown-state={slowdowns[segment.id].state}>
                        {slowdowns[segment.id].label}<br /><span>{slowdowns[segment.id].windowLabel}</span>
                      </span>
                      <span data-segment-lifecycle={segment.id}>{lifecycleLabels[segment.id]}</span>
                      <span data-segment-delay={segment.id} data-delay-state={traversalViews[segment.id].state}>{traversalViews[segment.id].label}</span>
                      <span data-route-alert-segment={segment.id} data-route-alert-state={alertViews[segment.id].state}>{alertViews[segment.id].label}</span>
                    </div>
                  </details>
                </a>
              </li>;
            })}
          </ul>
        </section>
      </div>

      <section id="segment-details" data-segment-id={selected?.id ?? ""} className={`panel ${styles.detailsPanel}`} aria-labelledby="segment-details-title" aria-live="polite">
            {selected && latest ? <>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <span className="simulated-pill">SIMULATED · {selected.direction.toUpperCase()}</span>
                <Link href="/about" className="text-xs text-primary underline">Methodology rules →</Link>
              </div>
              <h2 id="segment-details-title">{selected.name}</h2>
              <VerificationLadder
                segmentName={selected.name}
                hasReport={selectedReports.length > 0}
                isMultipleSources={assessments[selected.id]?.state === "multiple"}
                isSlowdownSupported={slowdowns[selected.id]?.state === "supported"}
              />
              <p><strong>{sampleLabel(latest.observedAt)}</strong></p>
              <dl className={styles.facts}>
                <div><dt>Segment ID</dt><dd><code>{selected.id}</code></dd></div>
                <div><dt>Route membership</dt><dd>{fixture.route_segments.filter(row => row.segment_id === selected.id).map(row => fixture.routes.find(route => route.id === row.route_id)?.name).join(", ") || "Separate opposite-direction segment"}</dd></div>
                <div><dt>Assumed length</dt><dd>{selected.length_m} metres</dd></div>
                <div><dt>Assumed baseline</dt><dd>{selected.baseline_seconds} seconds</dd></div>
                <div><dt>Latest observation</dt><dd>{latest.observedAt ? <time dateTime={latest.observedAt}>{formatTrafficTime(latest.observedAt)}</time> : "Unavailable"}</dd></div>
              </dl>
              <p>{selected.baseline_label}</p>
              <section className={styles.reports} aria-labelledby="route-alert-title">
                <h3 id="route-alert-title">Fixed alternative comparison</h3>
                <RouteComparisonBar
                  routeComparison={routeComparison}
                  alert={routeAlerts.find(a => a.segment_id === selected.id)}
                  readAt={snapshot.read_at}
                  elapsedMs={elapsedMs}
                  onInspectAlternative={selectSegment}
                />
                <p data-route-alert-details={selected.id} data-route-alert-state={alertViews[selected.id].state}>
                  <strong>{alertViews[selected.id].label}</strong>
                </p>
                {alertViews[selected.id].state === "alert" && routeComparison.alternative_segment_ids[0] && <button
                  type="button" className="button secondary" data-inspect-alternative
                  onClick={() => selectSegment(routeComparison.alternative_segment_ids[0])}>Inspect fixed alternative</button>}
              </section>
              <h3>Latest synthetic samples</h3>
              <p>{latest.samples.length} synthetic sources at this timestamp.</p>
              {latest.samples.length ? <ul className={styles.samples}>
                {latest.samples.map(row => <li key={row.source_id}><span>{fixture.sources.find(source => source.id === row.source_id)?.label}</span><strong>{row.speed_kph} km/h</strong></li>)}
              </ul> : <p>No samples are available for this segment. Speed, delay and congestion are not inferred.</p>}
              <h3>Synthetic slowdown evidence</h3>
              <div data-slowdown-assessment={selected.id} data-slowdown-state={slowdowns[selected.id].state}>
                <p><strong>{slowdowns[selected.id].label}</strong></p>
                <p>{slowdowns[selected.id].windowLabel}</p>
              </div>
              <p>Baseline speed: {(selected.length_m / selected.baseline_seconds * 3.6).toLocaleString("en-GB", { maximumFractionDigits: 2 })} km/h (assumed).</p>
              <p>Persisted incidents below use retained evidence from one simulation run; higher speeds alone and simulator reset do not establish recovery or clearance.</p>
              <section className={styles.reports} aria-labelledby="lifecycle-title" data-lifecycle-history={selected.id}>
                <h3 id="lifecycle-title">Persisted incident history</h3>
                <p data-lifecycle-summary={selected.id}><strong>{lifecycleLabels[selected.id]}</strong></p>
                {selectedIncidents.map(incident => {
                  const causeBreakdown = getIncidentCauseBreakdown(incident, snapshot.reports);
                  return (
                    <details key={incident.id} data-lifecycle-incident={incident.id} data-lifecycle-state={incidentViews[incident.id].state}>
                      <summary>Incident {incident.id.slice(0, 8)} · {causeBreakdown.icon} {incidentViews[incident.id].label}</summary>
                      <p>Incident ID: <code>{incident.id}</code></p>
                      <p><strong>Reported cause:</strong> {causeBreakdown.summary}</p>
                      <p>First supported window began: <time dateTime={incident.started_at}>{formatTrafficTime(incident.started_at)}</time>.</p>
                      <p>Latest supported window ended: <time dateTime={incident.last_supported_at}>{formatTrafficTime(incident.last_supported_at)}</time> · {incident.supporting_source_count} synthetic sources.</p>
                      {incident.cleared_at && <p>Historical clearance recorded: <time dateTime={incident.cleared_at}>{formatTrafficTime(incident.cleared_at)}</time> · {incident.recovered_source_count} continuous synthetic sources. This does not establish current road safety.</p>}
                      {incident.prior_incident_id && <p>Reopened after incident: <code>{incident.prior_incident_id}</code>.</p>}
                      <p>Cause: unknown. {causeBreakdown.detail}. {incident.report_episode_ids.length ? "Temporally associated report episodes (not confirmed causes):" : "No retained report episode is temporally associated."}</p>
                      {incident.report_episode_ids.map(id => <p key={id}><code>{id}</code></p>)}
                    </details>
                  );
                })}
                {!selectedIncidents.length && <p>No persisted slowdown incident is available for this direction. Missing history does not mean clearance.</p>}
              </section>
              <section className={styles.reports} aria-labelledby="traversal-title" data-completed-traversal={selected.id} data-delay-state={traversalViews[selected.id].state}>
                <h3 id="traversal-title">Completed synthetic traversal</h3>
                <p><strong>{traversalViews[selected.id].label}</strong></p>
                {selectedTraversal?.entered_at && selectedTraversal.exited_at && <p>Completed entry-to-exit window: <time dateTime={selectedTraversal.entered_at}>{formatTrafficTime(selectedTraversal.entered_at)}</time> to <time dateTime={selectedTraversal.exited_at}>{formatTrafficTime(selectedTraversal.exited_at)}</time>.</p>}
                {selectedTraversal?.baseline_label && <p>Frozen assumed baseline: {selectedTraversal.baseline_seconds} seconds · {selectedTraversal.baseline_label}.</p>}
              </section>
              <h3>Report-group evidence</h3>
              <p data-report-assessment={selected.id} data-assessment-state={assessments[selected.id].state}><strong>{assessments[selected.id].label}</strong></p>
              <section aria-labelledby="episode-history-title" className={styles.reports}>
                <h3 id="episode-history-title">Report episode history</h3>
                <p data-episode-summary={selected.id}>{episodeSummary(episodeCounts[selected.id])}</p>
                {selectedEpisodes.length ? selectedEpisodes.map(episode => <details key={episode.id} data-incident-episode={episode.id}>
                  <summary>Episode {episode.id.slice(0, 8)} · {episode.report_count} retained reports · SIMULATED</summary>
                  <p>Episode ID: <code>{episode.id}</code></p>
                  <p>Created: <time dateTime={episode.created_at}>{formatTrafficTime(episode.created_at)}</time></p>
                  <p>Retained observation window: <time dateTime={episode.first_observed_at}>{formatTrafficTime(episode.first_observed_at)}</time> to <time dateTime={episode.last_observed_at}>{formatTrafficTime(episode.last_observed_at)}</time>.</p>
                  <p>Latest retained report: {freshness(episode.last_observed_at) === "recent" ? "recent, unconfirmed" : freshness(episode.last_observed_at) === "stale" ? "stale, not cleared" : freshness(episode.last_observed_at) === "future" ? "future-dated, unsupported" : "freshness needs refresh"}.</p>
                </details>) : <p>No report episodes are retained for this direction.</p>}
              </section>
              <div id="segment-reports" className={styles.reports} data-report-segment={selected.id}>
                <h3>Unconfirmed demo reports</h3>
                <p>{selectedReports.length} reports for this direction.</p>
                {selectedReports.length > 10 && <p>Showing the ten most recently received reports.</p>}
                {selectedReports.length ? <ul>
                  {selectedReports.slice(0, 10).map(report => <li key={report.id} data-public-report={report.id} data-episode-id={report.episode_id}>
                    <strong><span aria-hidden="true">{reportCategoryIcons[report.category] ?? ""} </span>{reportCategories[report.category]} — reported, unconfirmed</strong>
                    <span>SIMULATED · Manually selected location · L1 Reported</span>
                    <span>Report episode: <code>{report.episode_id}</code></span>
                    <span>{freshness(report.observed_at) === "unknown" ? "Report freshness needs refresh" : freshness(report.observed_at) === "recent" ? "Recent report" : freshness(report.observed_at) === "future" ? "Future-dated report" : "Stale report"}</span>
                    <span>Observed: <time dateTime={report.observed_at}>{formatTrafficTime(report.observed_at)}</time></span>
                    <span>Received: <time dateTime={report.received_at}>{formatTrafficTime(report.received_at)}</time></span>
                  </li>)}
                </ul> : <p>No demo reports are stored for this segment.</p>}
                {snapshot.reporting_enabled ? <Link className="button" href={`/reports/new?segment=${encodeURIComponent(selected.id)}`}>Report a simulated problem</Link>
                  : <p>Demo reporting is disabled. Browsing remains available.</p>}
              </div>
            </> : <>
              <h2 id="segment-details-title">Segment not found</h2>
              <p>The requested segment is not in this snapshot, or the URL contains multiple segment selections. Choose a segment from the list.</p>
            </>}
          </section>
    </div>
  );
}
