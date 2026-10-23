"use client";

import { useState, useTransition } from "react";
import type { CommuterJourney } from "@/lib/journeys/rules";
import {
  handleStartJourney,
  handleEndJourney,
  handleShareJourney,
  handleStopSharing,
} from "@/app/workspace/actions";

export function JourneyManager({
  journeys,
  organisations,
  initialCorridor,
}: {
  journeys: CommuterJourney[];
  organisations: Array<{ id: string; name: string }>;
  initialCorridor?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [corridorName, setCorridorName] = useState(initialCorridor || "Pumpwell – Hampankatta Central Corridor");

  const activeJourneys = journeys.filter((j) => j.status === "active");
  const pastJourneys = journeys.filter((j) => j.status === "ended");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low border border-surface-container">
        <div>
          <h2 className="text-lg font-bold">Commute & Journey Sharing</h2>
          <p className="text-sm text-surface-on-variant">
            Start and stop a private journey, then explicitly share its corridor and status with an employer. Delay is not measured yet.
          </p>
        </div>
        <input
          type="text"
          value={corridorName}
          onChange={(e) => setCorridorName(e.target.value)}
          maxLength={120}
          aria-label="Corridor name"
          className="text-sm px-3 py-2 rounded-lg border border-surface-container-high bg-surface-container w-full sm:w-64"
        />
        <button
          type="button"
          disabled={isPending || corridorName.trim().length === 0}
          onClick={() => {
            startTransition(async () => {
              await handleStartJourney(corridorName.trim());
            });
          }}
          className="button whitespace-nowrap bg-primary text-primary-on px-4 py-2 rounded-lg font-medium shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Starting..." : "+ Start New Journey"}
        </button>
      </div>

      <div>
        <h3 className="text-md font-bold mb-3">Active Journeys ({activeJourneys.length})</h3>
        {activeJourneys.length === 0 ? (
          <p className="text-sm text-surface-on-variant italic p-4 rounded-lg bg-surface-container-lowest border border-dashed border-surface-container">
            No active journeys in progress. Click &quot;Start New Journey&quot; to begin.
          </p>
        ) : (
          <div className="space-y-4">
            {activeJourneys.map((j) => (
              <div
                key={j.id}
                className="p-5 rounded-xl border border-primary/30 bg-surface-container-lowest shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-container pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">
                        ACTIVE JOURNEY
                      </span>
                      <span className="text-xs font-mono text-surface-on-variant">
                        ID: {j.id.slice(0, 8)}...
                      </span>
                    </div>
                    <p className="font-semibold text-surface-on mt-1">{j.corridor_name}</p>
                  </div>
                  <form action={handleEndJourney}>
                    <input type="hidden" name="journeyId" value={j.id} />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="text-xs px-3 py-1.5 rounded bg-error text-error-on font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      End Journey
                    </button>
                  </form>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-surface-on-variant block">Delay measurement</span>
                    <span className="font-semibold text-surface-on">Not measured</span>
                  </div>
                  <div>
                    <span className="text-xs text-surface-on-variant block">Journey evidence</span>
                    <span className="font-semibold text-surface-on">Not collected</span>
                  </div>
                  <div>
                    <span className="text-xs text-surface-on-variant block">Started at</span>
                    <span className="font-mono text-xs">
                      {new Date(j.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {/* Consent-based employer sharing */}
                <div className="pt-3 border-t border-surface-container space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-surface-on-variant">
                      Employer Sharing Consent
                    </h4>
                    <span className="text-xs text-surface-on-variant">
                      {j.shares?.filter((s) => s.status === "active").length || 0} active share(s)
                    </span>
                  </div>

                  {/* Active shares list */}
                  {j.shares && j.shares.filter((s) => s.status === "active").length > 0 && (
                    <div className="space-y-2">
                      {j.shares
                        .filter((s) => s.status === "active")
                        .map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between p-2.5 rounded bg-surface-container text-xs"
                          >
                            <div>
                              <span className="font-bold text-surface-on">{s.org_name}</span>
                              <span className="text-surface-on-variant block">
                                Shared {new Date(s.shared_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <form action={handleStopSharing}>
                              <input type="hidden" name="journeyId" value={j.id} />
                              <input type="hidden" name="orgId" value={s.org_id} />
                              <button
                                type="submit"
                                disabled={isPending}
                                className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-error/20 text-error font-semibold transition"
                              >
                                Stop Sharing
                              </button>
                            </form>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* New share form */}
                  {organisations.length > 0 && (
                    <form
                      action={handleShareJourney}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
                    >
                      <input type="hidden" name="journeyId" value={j.id} />
                      <select
                        name="orgId"
                        required
                        className="text-xs p-2 rounded bg-surface-container border border-surface-container-high text-surface-on flex-1"
                      >
                        <option value="">Select organisation to share journey status...</option>
                        {organisations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={isPending}
                        className="text-xs px-3 py-2 rounded bg-secondary text-secondary-on font-semibold whitespace-nowrap hover:opacity-90 disabled:opacity-50"
                      >
                        Consent & Share
                      </button>
                    </form>
                  )}
                  <p className="text-[11px] text-surface-on-variant">
                    Privacy Guarantee: Only corridor and current journey status are shared. Delay is not measured. Exact coordinates, GPS, route history, and device identity are NEVER disclosed.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pastJourneys.length > 0 && (
        <div className="pt-4 border-t border-surface-container">
          <h3 className="text-md font-bold mb-3 text-surface-on-variant">Past Journeys ({pastJourneys.length})</h3>
          <div className="space-y-2">
            {pastJourneys.map((j) => (
              <div
                key={j.id}
                className="p-3 rounded-lg bg-surface-container-low border border-surface-container text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 opacity-80"
              >
                <div>
                  <span className="font-semibold text-surface-on">{j.corridor_name}</span>
                  <span className="text-surface-on-variant block">
                    Started {new Date(j.started_at).toLocaleTimeString()} · Ended {j.ended_at ? new Date(j.ended_at).toLocaleTimeString() : "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-surface-container-high text-surface-on-variant font-mono">
                    ENDED
                  </span>
                  <span className="font-medium text-surface-on">Delay not measured</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
