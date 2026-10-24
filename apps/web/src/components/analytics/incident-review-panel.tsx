"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportCategories, reportCategoryIcons } from "@/lib/reports/rules";
import type { AuthorityIncidentHistoryItem, AuthorityNotificationItem, LiveIncident } from "@/lib/incidents/server";
import type { SpreadResult } from "@/lib/routing/spread";

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

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Tone 1: 880 Hz (A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Tone 2: 1174.66 Hz (D6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, now + 0.12);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch {
    // AudioContext blocked or not supported
  }
}

export function IncidentReviewPanel() {
  const [incidents, setIncidents] = useState<LiveIncident[]>([]);
  const [history, setHistory] = useState<AuthorityIncidentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIncidentId, setPendingIncidentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Real-time Authority Push Notifications
  const [notifications, setNotifications] = useState<AuthorityNotificationItem[]>([]);
  const [latestAlert, setLatestAlert] = useState<AuthorityNotificationItem | null>(null);
  const [hasWebNotificationPerm, setHasWebNotificationPerm] = useState<boolean>(() => {
    return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
  });
  const [highlightedIncidentId, setHighlightedIncidentId] = useState<string | null>(null);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const isFirstPoll = useRef(true);

  // Spread check state
  const [spreadIncidentId, setSpreadIncidentId] = useState<string | null>(null);
  const [spreadResult, setSpreadResult] = useState<SpreadResult | null>(null);
  const [spreadLoading, setSpreadLoading] = useState(false);
  const [spreadError, setSpreadError] = useState<string | null>(null);

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

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setHasWebNotificationPerm(perm === "granted");
      if (perm === "granted") {
        new Notification("🚨 TrafficSense Control Room Alerts", {
          body: "Push notifications active for commuter incident sightings with photo evidence.",
          icon: "/favicon.ico",
        });
      }
    }
  }, []);

  // Heartbeat Poller for Authority Push Notifications
  useEffect(() => {
    let mounted = true;

    async function pollNotifications() {
      try {
        const res = await fetch("/api/authority/notifications?limit=25", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !data.ok || !Array.isArray(data.notifications)) return;

        const incoming: AuthorityNotificationItem[] = data.notifications;
        setNotifications(incoming);

        // Find truly new notifications not seen in this session
        const newItems = incoming.filter((n) => !seenNotificationIds.current.has(n.id));
        for (const item of incoming) {
          seenNotificationIds.current.add(item.id);
        }

        if (!isFirstPoll.current && newItems.length > 0) {
          const newest = newItems[0];
          setLatestAlert(newest);
          setHighlightedIncidentId(newest.incident_id);
          playNotificationChime();

          // Native OS Notification
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const photoBadge = newest.has_photo ? " [📸 Photo Verified]" : "";
            const cat = reportCategories[newest.category as keyof typeof reportCategories] ?? newest.category;
            new Notification(`🚨 Road Hazard Spotted: ${cat}`, {
              body: `${newest.landmark}${photoBadge} • Level ${newest.level}`,
              icon: "/favicon.ico",
            });
          }

          // Automatically reload incident list so it appears in the review queue in real-time
          void fetchIncidents().then((reloaded) => {
            if (mounted) setIncidents(reloaded);
          });
        }
        isFirstPoll.current = false;
      } catch {
        // Heartbeat poll retry silently
      }
    }

    void pollNotifications();
    const interval = setInterval(() => void pollNotifications(), 3500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchIncidents]);

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

  async function handleCheckSpread(incident: LiveIncident) {
    if (spreadIncidentId === incident.id && spreadResult) {
      // Toggle off if already showing
      setSpreadIncidentId(null);
      setSpreadResult(null);
      setSpreadError(null);
      return;
    }

    setSpreadIncidentId(incident.id);
    setSpreadLoading(true);
    setSpreadError(null);
    setSpreadResult(null);

    try {
      const originName = "Pumpwell (Mahaveera) Circle";
      const res = await fetch(`/api/spread?incident=${encodeURIComponent(incident.id)}&origin=${encodeURIComponent(originName)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not check route spread.");
      }
      setSpreadResult(data);
    } catch (err) {
      setSpreadError(err instanceof Error ? err.message : "Failed to check spread.");
    } finally {
      setSpreadLoading(false);
    }
  }

  return (
    <section className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-4" aria-labelledby="incident-review-title">
      {/* Real-time Incident Spotted Alert Banner */}
      {latestAlert && (
        <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/50 dark:bg-amber-950/30 dark:border-amber-500/60 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse" role="alert">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">🚨</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  New Incident Spotted
                </span>
                {latestAlert.has_photo && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                    📸 Photo Evidence Corroborated
                  </span>
                )}
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-surface-on-variant">
                  {latestAlert.level}
                </span>
              </div>
              <p className="text-sm font-semibold text-surface-on mt-0.5">
                {reportCategories[latestAlert.category as keyof typeof reportCategories] ?? latestAlert.category} • {latestAlert.landmark}
              </p>
              {latestAlert.photo_summary && (
                <p className="text-xs text-surface-on-variant mt-0.5 italic">
                  &ldquo;{latestAlert.photo_summary}&rdquo;
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              className="button text-xs px-3 py-1.5 whitespace-nowrap"
              onClick={() => {
                setHighlightedIncidentId(latestAlert.incident_id);
                const el = document.getElementById(`incident-${latestAlert.incident_id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Inspect &amp; Review →
            </button>
            <button
              type="button"
              className="button secondary text-xs px-2.5 py-1.5"
              onClick={() => setLatestAlert(null)}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="incident-review-title" className="text-base font-bold text-surface-on">Active Incident Review</h2>
            {notifications.filter((n) => !n.is_read).length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                {notifications.filter((n) => !n.is_read).length} new
              </span>
            )}
          </div>
          <p className="text-xs text-surface-on-variant">Confirming records an L6 authority decision; resolving removes the incident from public active views. Reported cause and congestion evidence remain separate.</p>
        </div>
        <div className="flex items-center gap-2">
          {!hasWebNotificationPerm && (
            <button
              type="button"
              className="button secondary text-xs px-3 py-1.5 border border-primary/40 text-primary"
              onClick={() => void requestNotificationPermission()}
              title="Allow browser notifications for real-time alerts"
            >
              🔔 Enable Push Alerts
            </button>
          )}
          {hasWebNotificationPerm && (
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1 font-medium bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
              🔔 Alerts Active
            </span>
          )}
          <button type="button" className="button secondary text-xs px-3 py-1.5" onClick={() => void loadIncidents()} disabled={isLoading || pendingIncidentId !== null}>
            {isLoading ? "Refreshing…" : "Refresh incidents"}
          </button>
        </div>
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
            const isVerified = incident.level === "L3" || incident.level === "L5" || incident.level === "L6";
            const isCheckingSpread = spreadLoading && spreadIncidentId === incident.id;
            const isSpreadOpen = spreadIncidentId === incident.id;
            const isHighlighted = highlightedIncidentId === incident.id;

            return (
              <li
                key={incident.id}
                id={`incident-${incident.id}`}
                className={`rounded-lg border p-3 space-y-2 transition-all ${
                  isHighlighted
                    ? "border-amber-500 bg-amber-50/20 dark:bg-amber-950/20 shadow-md ring-2 ring-amber-400"
                    : "border-surface-container bg-surface-container-low"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-surface-on">{reportCategoryIcons[incident.category] ?? "⚠️"} {category}</p>
                    {incident.level === "L5" && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        📸 Photo Corroborated
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono rounded bg-surface-container-high px-2 py-0.5 text-surface-on-variant">{incident.level} · {incident.provenance}</span>
                </div>
                <p className="text-xs text-surface-on-variant">{incident.level_reason} · {incident.report_count} report{incident.report_count === 1 ? "" : "s"} · first reported {formatIncidentTime(incident.first_reported_at)} IST</p>
                <div className="flex flex-wrap gap-2">
                  {incident.level !== "L6" && <button type="button" className="button text-xs px-3 py-1.5" disabled={isPending} onClick={() => void updateIncident(incident, "confirm")}>{isPending ? "Saving…" : "Confirm (L6)"}</button>}
                  <button type="button" className="button secondary text-xs px-3 py-1.5" disabled={isPending} onClick={() => void updateIncident(incident, "resolve")}>{isPending ? "Saving…" : "Resolve incident"}</button>
                  <button type="button" className="button secondary text-xs px-3 py-1.5" disabled={isPending} onClick={() => void updateIncident(incident, "reject")}>{isPending ? "Saving…" : "Reject report"}</button>
                  {isVerified && (
                    <button
                      type="button"
                      className="button secondary text-xs px-3 py-1.5"
                      disabled={isPending || isCheckingSpread}
                      onClick={() => void handleCheckSpread(incident)}
                    >
                      {isCheckingSpread
                        ? "Checking routes…"
                        : isSpreadOpen && spreadResult
                        ? "Hide spread"
                        : "Check spread from Pumpwell"}
                    </button>
                  )}
                </div>

                {isSpreadOpen && (
                  <div className="mt-3 p-3.5 rounded-lg border border-surface-container bg-surface-container-lowest space-y-2.5 text-xs">
                    {spreadLoading ? (
                      <p className="text-surface-on-variant animate-pulse">Checking routes from Pumpwell via OSRM…</p>
                    ) : spreadError ? (
                      <p className="text-error font-medium">{spreadError}</p>
                    ) : spreadResult ? (
                      <>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-surface-on">
                            Affects {spreadResult.affected} of {spreadResult.checked} routes from {spreadResult.origin}.
                          </p>
                          {spreadResult.checked < spreadResult.total && (
                            <p className="text-amber-700 dark:text-amber-400 font-medium">
                              {spreadResult.total - spreadResult.checked} routes could not be checked right now.
                            </p>
                          )}
                          <p className="text-[11px] text-surface-on-variant">
                            This route passes within 200 metres of the verified report. Free-flow estimate.
                          </p>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-surface-container text-surface-on-variant">
                                <th className="py-1.5 pr-2 font-medium">Destination</th>
                                <th className="py-1.5 px-2 font-medium">Affected</th>
                                <th className="py-1.5 px-2 font-medium">Avoid Option</th>
                                <th className="py-1.5 pl-2 font-medium text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container/60">
                              {spreadResult.rows.map((row) => (
                                <tr key={row.destination} className="hover:bg-surface-container-low/50">
                                  <td className="py-1.5 pr-2 font-medium text-surface-on">{row.destination}</td>
                                  <td className="py-1.5 px-2">
                                    {!row.checked ? (
                                      <span className="text-surface-on-variant italic">Unchecked</span>
                                    ) : row.affected ? (
                                      <span className="font-semibold text-amber-700 dark:text-amber-400">Yes</span>
                                    ) : (
                                      <span className="text-surface-on-variant">No</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-surface-on-variant">
                                    {!row.checked
                                      ? "—"
                                      : !row.affected
                                      ? "Not affected"
                                      : row.avoiding_extra_s !== null
                                      ? row.avoiding_extra_s === 0
                                        ? "0 min extra"
                                        : `+${Math.round(row.avoiding_extra_s / 60)} min`
                                      : "No alternative"}
                                  </td>
                                  <td className="py-1.5 pl-2 text-right">
                                    <Link
                                      href={`/planner?from=${encodeURIComponent(spreadResult.origin)}&to=${encodeURIComponent(row.destination)}`}
                                      className="inline-block text-[11px] font-medium text-primary hover:underline whitespace-nowrap"
                                    >
                                      Plan pair →
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
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
