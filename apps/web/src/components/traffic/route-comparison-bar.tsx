"use client";

import type { RouteComparison } from "@/lib/route-alerts/snapshot";
import type { RouteAlert } from "@/lib/route-alerts/rules";
import { routeAlertView } from "@/lib/route-alerts/presentation";
import styles from "./route-comparison-bar.module.css";

type RouteComparisonBarProps = {
  routeComparison: RouteComparison;
  alert: RouteAlert | undefined;
  readAt: string;
  elapsedMs: number | null;
  onInspectAlternative?: (segmentId: string) => void;
};

export function RouteComparisonBar({
  routeComparison,
  alert,
  readAt,
  elapsedMs,
  onInspectAlternative,
}: RouteComparisonBarProps) {
  const alertInfo = alert ? routeAlertView(alert, readAt, elapsedMs) : null;

  const primaryUs = routeComparison.primary_duration_us;
  const altUs = routeComparison.alternative_duration_us;
  const savingsUs = routeComparison.savings_us;

  const hasMeasuredDurations = primaryUs != null && altUs != null;
  const primaryMinutes = hasMeasuredDurations ? Math.round(primaryUs / 60_000_000) : null;
  const altMinutes = hasMeasuredDurations ? Math.round(altUs / 60_000_000) : null;
  const savingsMinutes = savingsUs != null ? Math.round(savingsUs / 60_000_000) : null;

  const maxDuration = hasMeasuredDurations ? Math.max(primaryMinutes!, altMinutes!, 15) : 1;
  const primaryPct = hasMeasuredDurations ? Math.min(100, Math.round((primaryMinutes! / maxDuration) * 100)) : 0;
  const altPct = hasMeasuredDurations ? Math.min(100, Math.round((altMinutes! / maxDuration) * 100)) : 0;

  const isAlert = alertInfo?.state === "alert";
  const hasAlternativeSegment = !!routeComparison.alternative_segment_ids[0];

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h4 className={styles.title}>Route Comparison (Primary vs Alternative)</h4>
        {isAlert ? (
          <span className={styles.alertBadge}>⚡ ALERT{ savingsMinutes != null ? `: SAVE ~${savingsMinutes} MIN` : "" }</span>
        ) : (
          <span className={styles.abstainBadge}>NO ALERT</span>
        )}
      </div>

      {hasMeasuredDurations ? <div className={styles.barsContainer}>
        {/* Primary Route Bar */}
        <div className={styles.barRow}>
          <div className={styles.barLabelGroup}>
            <span className={styles.barName}>Primary Corridor</span>
            <span className={styles.barTime}>{primaryMinutes} min</span>
          </div>
          <div className={styles.barTrack}>
            <div
              className={`${styles.barFill} ${isAlert ? styles.barPrimaryDelayed : styles.barPrimaryNormal}`}
              style={{ width: `${primaryPct}%` }}
            />
          </div>
        </div>

        {/* Alternative Route Bar */}
        <div className={styles.barRow}>
          <div className={styles.barLabelGroup}>
            <span className={styles.barName}>Fixed Alternative</span>
            <span className={styles.barTime}>{altMinutes} min</span>
          </div>
          <div className={styles.barTrack}>
            <div
              className={`${styles.barFill} ${styles.barAlternative}`}
              style={{ width: `${altPct}%` }}
            />
          </div>
        </div>
      </div> : <p className={styles.reasonText}>Travel durations are <strong>Not measured</strong> because completed route traversals are unavailable.</p>}

      <div className={styles.summaryLine}>
        <p className={styles.reasonText}>
          <strong>Status:</strong> {alertInfo?.label.split("·")[0]?.trim() || "Evaluation active"}
          {alertInfo?.label.includes("·") && (
            <span className={styles.reasonSub}> — {alertInfo.label.split("·")[1]?.trim()}</span>
          )}
        </p>
        {isAlert && hasAlternativeSegment && onInspectAlternative && (
          <button
            type="button"
            className="button secondary text-xs"
            onClick={() => onInspectAlternative(routeComparison.alternative_segment_ids[0])}
          >
            Inspect Fixed Alternative →
          </button>
        )}
      </div>
    </div>
  );
}
