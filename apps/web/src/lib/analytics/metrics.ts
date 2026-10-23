import { HISTORICAL_INCIDENTS, type HistoricalIncident } from "./history.ts";

export type HotspotRanking = {
  junction_id: string;
  junction_name: string;
  segment_id: string;
  incident_count: number;
  total_delay_hours: number;
  average_delay_minutes: number;
  max_delay_minutes: number;
  primary_cause: string;
  primary_window: string;
};

export type CauseBreakdown = {
  cause: string;
  label: string;
  count: number;
  percentage: number;
};

export type AnalyticsSummary = {
  selected_month: string;
  total_incidents: number;
  total_delay_hours: number;
  average_delay_minutes: number;
  top_hotspot: string;
  primary_cause: string;
  hotspots: HotspotRanking[];
  cause_mix: CauseBreakdown[];
  incidents: HistoricalIncident[];
};

/**
 * Phase 6: Per-cause total delay hours summary, sorted descending by total_delay_hours.
 * Provides input for the per-reason table (PDF §8).
 */
export type CauseDelaySummary = {
  cause: string;
  label: string;
  count: number;
  total_delay_hours: number;
};

/**
 * Phase 6: Recurrence heatmap.
 * Returns a Record<dayOfWeek (0=Sun…6=Sat), Record<"HH:MM", count>>.
 * Hour slots cover 07:00–21:00 in 30-minute steps — wide enough to contain all peak windows.
 * All incident timestamps stored in UTC; displayed in Asia/Kolkata (+05:30 = +330 min).
 */
export type RecurrenceHeatmap = Record<number, Record<string, number>>;

const CAUSE_LABELS: Record<HistoricalIncident["cause"], string> = {
  accident: "Traffic Collisions",
  road_repair: "Road Maintenance / Works",
  heavy_volume: "Peak Traffic Congestion",
  flood: "Monsoon Waterlogging",
  unknown: "Cause not yet reported",
};

/** 30-minute slots spanning 07:00–20:30 (IST) — covers all three peak windows. */
const HOUR_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 7; h <= 20; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
})();

function filterByMonth(
  selectedMonth: string,
  source: HistoricalIncident[] = HISTORICAL_INCIDENTS
): HistoricalIncident[] {
  return selectedMonth === "all"
    ? source
    : source.filter((inc) => inc.month === selectedMonth);
}

export function computeAnalytics(
  selectedMonth = "all",
  sourceIncidents?: HistoricalIncident[]
): AnalyticsSummary {
  const filtered = filterByMonth(selectedMonth, sourceIncidents);

  const totalIncidents = filtered.length;
  const totalDelayMinutes = filtered.reduce((acc, inc) => acc + inc.commuter_delay_minutes, 0);
  const totalDelayHours = Math.round((totalDelayMinutes / 60) * 10) / 10;
  const averageDelayMinutes = totalIncidents > 0 ? Math.round(totalDelayMinutes / totalIncidents) : 0;

  // Group by junction for hotspots
  const byJunction = new Map<string, HistoricalIncident[]>();
  for (const inc of filtered) {
    const list = byJunction.get(inc.junction_id) ?? [];
    list.push(inc);
    byJunction.set(inc.junction_id, list);
  }

  const hotspots: HotspotRanking[] = Array.from(byJunction.entries()).map(([jid, incs]) => {
    const sumDelay = incs.reduce((acc, i) => acc + i.commuter_delay_minutes, 0);
    const maxDelay = Math.max(...incs.map((i) => i.commuter_delay_minutes));
    const avgDelay = Math.round(sumDelay / incs.length);

    // Primary cause in this junction
    const causeCounts = new Map<string, number>();
    for (const i of incs) causeCounts.set(i.cause, (causeCounts.get(i.cause) ?? 0) + 1);
    const primaryCause = Array.from(causeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    // Primary peak window
    const windowCounts = new Map<string, number>();
    for (const i of incs) windowCounts.set(i.peak_window, (windowCounts.get(i.peak_window) ?? 0) + 1);
    const primaryWindow = Array.from(windowCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "off_peak";

    return {
      junction_id: jid,
      junction_name: incs[0].junction_name,
      segment_id: incs[0].segment_id,
      incident_count: incs.length,
      total_delay_hours: Math.round((sumDelay / 60) * 10) / 10,
      average_delay_minutes: avgDelay,
      max_delay_minutes: maxDelay,
      primary_cause: CAUSE_LABELS[primaryCause as HistoricalIncident["cause"]] ?? primaryCause,
      primary_window: primaryWindow,
    };
  }).sort((a, b) => b.total_delay_hours - a.total_delay_hours);

  // Cause breakdown
  const causeCounts = new Map<string, number>();
  for (const inc of filtered) {
    causeCounts.set(inc.cause, (causeCounts.get(inc.cause) ?? 0) + 1);
  }

  const cause_mix: CauseBreakdown[] = Array.from(causeCounts.entries()).map(([c, count]) => ({
    cause: c,
    label: CAUSE_LABELS[c as HistoricalIncident["cause"]] ?? c,
    count,
    percentage: totalIncidents > 0 ? Math.round((count / totalIncidents) * 100) : 0,
  })).sort((a, b) => b.count - a.count);

  const top_hotspot = hotspots[0]?.junction_name ?? "None";
  const primary_cause = cause_mix[0]?.label ?? "None";

  return {
    selected_month: selectedMonth,
    total_incidents: totalIncidents,
    total_delay_hours: totalDelayHours,
    average_delay_minutes: averageDelayMinutes,
    top_hotspot,
    primary_cause,
    hotspots,
    cause_mix,
    incidents: filtered.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)),
  };
}

/**
 * Phase 6: Recurrence heatmap.
 * Returns {dayOfWeek: {"HH:MM": count}} for all IST day/slot combinations present in incidents.
 * All 7 day keys (0–6) are always returned with every slot initialised to 0.
 */
export function computeRecurrenceHeatmap(
  selectedMonth = "all",
  sourceIncidents?: HistoricalIncident[]
): RecurrenceHeatmap {
  // Initialise an empty heatmap
  const heatmap: RecurrenceHeatmap = {};
  for (let d = 0; d <= 6; d++) {
    heatmap[d] = {};
    for (const slot of HOUR_SLOTS) {
      heatmap[d][slot] = 0;
    }
  }

  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30

  for (const inc of filterByMonth(selectedMonth, sourceIncidents)) {
    const utcMs = Date.parse(inc.occurred_at);
    const istMs = utcMs + IST_OFFSET_MS;
    const istDate = new Date(istMs);
    const day = istDate.getUTCDay(); // 0=Sun…6=Sat, correct for IST date
    const h = istDate.getUTCHours();
    const m = istDate.getUTCMinutes();
    // Round down to nearest 30-minute slot
    const slotMinute = m < 30 ? 0 : 30;
    const slot = `${String(h).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`;
    // If slot is within our predefined range, count it; otherwise put in nearest boundary
    if (Object.prototype.hasOwnProperty.call(heatmap[day], slot)) {
      heatmap[day][slot]++;
    } else {
      // Out of 07:00–20:30 range — assign to closest boundary slot
      const boundarySlot = h < 7 ? "07:00" : "20:30";
      if (Object.prototype.hasOwnProperty.call(heatmap[day], boundarySlot)) {
        (heatmap[day][boundarySlot] as number)++;
      }
    }
  }

  return heatmap;
}

/**
 * Phase 6: Plain-language recurrence statement for a specific junction.
 * Format: "Congested on N of the last M weekdays between HH:MM and HH:MM."
 * N and M are computed from historical data. The peak window shown is the most common window
 * for that junction. Sample size is appended.
 *
 * If junctionId is "all" or not found, uses all junctions combined.
 */
export function computeRecurrenceStatement(
  selectedMonth = "all",
  junctionId = "all",
  sourceIncidents?: HistoricalIncident[]
): string {
  const filtered = filterByMonth(selectedMonth, sourceIncidents).filter((inc) =>
    junctionId === "all" || inc.junction_id === junctionId,
  );

  if (filtered.length === 0) {
    return "No incidents recorded for this junction in the selected period.";
  }

  // Count distinct weekdays (Mon–Fri, dayOfWeek 1–5) that have at least one incident
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const incidentWeekdays = new Set<string>();
  const totalWeekdaysInPeriod = new Set<string>();

  // Build the set of all weekdays spanned by the analysis period
  // Use the range from earliest to latest incident
  const timestamps = filtered.map((inc) => Date.parse(inc.occurred_at));
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  // Iterate all days from minTs to maxTs
  let cursor = minTs;
  while (cursor <= maxTs) {
    const istMs = cursor + IST_OFFSET_MS;
    const d = new Date(istMs);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) { // Monday–Friday
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      totalWeekdaysInPeriod.add(key);
    }
    cursor += 86400000; // +1 day
  }

  for (const inc of filtered) {
    const istMs = Date.parse(inc.occurred_at) + IST_OFFSET_MS;
    const d = new Date(istMs);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      incidentWeekdays.add(key);
    }
  }

  const N = incidentWeekdays.size;
  // Keep the statement mathematically consistent even when timezone conversion
  // places an incident on a boundary day outside the generated cursor range.
  const M = Math.max(totalWeekdaysInPeriod.size, N, 1);

  // Determine most common peak window for this junction
  const windowCounts = new Map<string, number>();
  for (const inc of filtered) {
    windowCounts.set(inc.peak_window, (windowCounts.get(inc.peak_window) ?? 0) + 1);
  }
  const primaryWindow = Array.from(windowCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "off_peak";

  // Map window key to human-readable range
  const windowLabels: Record<string, string> = {
    "08:00-10:00": "08:00 and 10:00",
    "12:00-14:00": "12:00 and 14:00",
    "17:00-19:00": "17:00 and 19:00",
    "off_peak": "off-peak hours",
  };
  const windowLabel = windowLabels[primaryWindow] ?? primaryWindow;

  const sampleNote = `(${filtered.length} incident${filtered.length !== 1 ? "s" : ""} in ${selectedMonth === "all" ? "all available data" : selectedMonth})`;

  return `Congested on ${N} of the last ${M} weekdays between ${windowLabel}. ${sampleNote}`;
}

/**
 * Phase 6: Per-cause total delay summary (PDF §8 per-reason table).
 * Returns array sorted descending by total_delay_hours.
 */
export function computeCauseDelaySummary(
  selectedMonth = "all",
  sourceIncidents?: HistoricalIncident[]
): CauseDelaySummary[] {
  const filtered = filterByMonth(selectedMonth, sourceIncidents);
  const map = new Map<string, { count: number; totalDelayMinutes: number }>();

  for (const inc of filtered) {
    const entry = map.get(inc.cause) ?? { count: 0, totalDelayMinutes: 0 };
    entry.count++;
    entry.totalDelayMinutes += inc.commuter_delay_minutes;
    map.set(inc.cause, entry);
  }

  return Array.from(map.entries())
    .map(([cause, { count, totalDelayMinutes }]) => ({
      cause,
      label: CAUSE_LABELS[cause as HistoricalIncident["cause"]] ?? cause,
      count,
      total_delay_hours: Math.round((totalDelayMinutes / 60) * 10) / 10,
    }))
    .sort((a, b) => b.total_delay_hours - a.total_delay_hours);
}
