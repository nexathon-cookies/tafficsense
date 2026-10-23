"use client";

import { useCallback, useEffect, useState } from "react";
import { reportCategories, reportCategoryIcons } from "@/lib/reports/rules";
import type { AuthorityIncidentHistoryItem, LiveIncident } from "@/lib/incidents/server";

function formatIncidentTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function IncidentReviewPanel() {
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [history, setHistory] = useState<AuthorityIncidentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchIncidents = useCallback(async (): Promise<LiveIncident[]> => {
    const response = await fetch("/api/incidents", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.incidents)) {
      throw new Error("Unable to load active incidents.");
    }
    return data.incidents;
  }, []);

  const fetchHistory = useCallback(async (): Promise<AuthorityIncidentHistoryItem[]> => {
    const response = await fetch("/api/incidents?scope=authority-history", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.history)) throw new Error("Unable to load incident history.");
    return data.history;
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchIncidents(), fetchHistory()])
      .then(([loaded, loadedHistory]) => {
        if (active) {
          setIncidents(loaded);
          setHistory(loadedHistory);
        }
      })
      .catch(() => {
        if (active) setMessage("Active incidents could not be loaded. Refresh to retry.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchHistory, fetchIncidents]);

  async function loadIncidents() {
    setIsLoading(true);
    setMessage(null);
    try {
      const [loaded, loadedHistory] = await Promise.all([fetchIncidents(), fetchHistory()]);
      setIncidents(loaded);
      setHistory(loadedHistory);
    } catch {
      setMessage("Active incidents could not be loaded. Refresh to retry.");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateIncident(incident: LiveIncident, action: "confirm" | "resolve" | "reject") {
    const actionLabel = action === "confirm" ? "confirm" : action === "resolve" ? "resolve" : "reject";
    if (!window.confirm(`Are you sure you want to ${actionLabel} this ${reportCategories[incident.category]} incident?`)) return;

    setPendingIncidentId(incident.id);
    setMessage(null);
    try {
      const response = await fetch("/api/incidents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incident.id, action }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Update failed.");
      setMessage(action === "confirm" ? "Incident marked as authority-confirmed (L6)." : action === "resolve" ? "Incident resolved and removed from active review." : "Incident rejected and removed from public active views.");
      await loadIncidents();
      window.dispatchEvent(new Event("trafficsense:incidents-changed"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this incident.");
    } finally {
      setPendingIncidentId(null);
    }
  }

  return (
    <section className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3" aria-labelledby="incident-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="incident-review-title" className="text-base font-bold text-surface-on">Active Incident Review</h2>
          <p className="text-xs text-surface-on-variant">Confirming records an L6 authority decision; resolving removes the incident from public active views. Reported cause and congestion evidence remain separate.</p>
        </div>
        <button type="button" className="button secondary text-xs px-3 py-1.5" onClick={() => void loadIncidents()} disabled={isLoading || pendingIncidentId !== null}>
          {isLoading ? "Refreshing…" : "Refresh incidents"}
        </button>
      </div>

      <p aria-live="polite" className={message ? "text-xs rounded-lg bg-surface-container-low p-3 text-surface-on" : "sr-only"}>{message}</p>

      {isLoading ? (
        <p role="status" className="text-sm text-surface-on-variant">Loading active incidents…</p>
      ) : incidents.length === 0 ? (
        <p className="text-sm text-surface-on-variant rounded-lg border border-dashed border-surface-container p-4">No active incidents need authority review.</p>
      ) : (
        <ul className="space-y-3" aria-label="Active incidents awaiting review">
          {incidents.map((incident) => {
            const isPending = pendingIncidentId === incident.id;
            const category = reportCategories[incident.category] ?? incident.category;
            return (
              <li key={incident.id} className="rounded-lg border border-surface-container bg-surface-container-low p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-surface-on">{reportCategoryIcons[incident.category] ?? "⚠️"} {category}</p>
                  <span className="text-[10px] font-mono rounded bg-surface-container-high px-2 py-0.5 text-surface-on-variant">{incident.level} · {incident.provenance}</span>
                </div>
                <p className="text-xs text-surface-on-variant">{incident.level_reason} · {incident.report_count} report{incident.report_count === 1 ? "" : "s"} · first reported {formatIncidentTime(incident.first_reported_at)} IST</p>
                <div className="flex flex-wrap gap-2">
                  {incident.level !== "L6" && <button type="button" className="button text-xs px-3 py-1.5" disabled={isPending} onClick={() => void updateIncident(incident, "confirm")}>{isPending ? "Saving…" : "Confirm (L6)"}</button>}
                  <button type="button" className="button secondary text-xs px-3 py-1.5" disabled={isPending} onClick={() => void updateIncident(incident, "resolve")}>{isPending ? "Saving…" : "Resolve incident"}</button>
                  <button type="button" className="button secondary text-xs px-3 py-1.5" disabled={isPending} onClick={() => void updateIncident(incident, "reject")}>{isPending ? "Saving…" : "Reject report"}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-surface-container pt-3 space-y-2" aria-labelledby="incident-timeline-title">
        <h3 id="incident-timeline-title" className="text-sm font-semibold text-surface-on">Recent authority timeline</h3>
        {history.length === 0 ? <p className="text-xs text-surface-on-variant">No authority actions have been recorded yet.</p> : (
          <ol className="space-y-2" aria-label="Recent authority incident actions">
            {history.map((item) => (
              <li key={item.id} className="border-l-2 border-primary/40 pl-3 text-xs text-surface-on-variant">
                <span className="font-semibold text-surface-on">{item.action.replace("_incident", "").replace(/^./, (letter) => letter.toUpperCase())}</span>{" "}
                {reportCategories[item.category] ?? item.category} · {formatIncidentTime(item.created_at)} IST
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
