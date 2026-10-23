// Phase 7: Deterministic synthetic incident history for Mangaluru junctions
// All data is labeled simulated. Outputs suggest civic investigation, not infrastructure decisions.

export type HistoricalIncident = {
  id: string;
  junction_id: string;
  junction_name: string;
  segment_id: string;
  direction: "outbound" | "inbound";
  occurred_at: string; // ISO UTC
  duration_minutes: number;
  commuter_delay_minutes: number;
  cause: "accident" | "road_repair" | "flood" | "heavy_volume" | "unknown";
  month: string; // YYYY-MM
  peak_window: "08:00-10:00" | "12:00-14:00" | "17:00-19:00" | "off_peak";
  provenance: "simulated" | "reported";
};

export const MANGALURU_JUNCTIONS = [
  { id: "hampankatta", name: "Hampankatta Junction", segment_id: "primary-west" },
  { id: "ksrtc-bejai", name: "KSRTC / Bejai Circle", segment_id: "primary-east" },
  { id: "jyothi-ambedkar", name: "Ambedkar (Jyothi) Circle", segment_id: "alternative-west" },
  { id: "ladyhill", name: "Ladyhill Junction", segment_id: "alternative-east" },
  { id: "pumpwell", name: "Pumpwell (Mahaveera) Circle", segment_id: "primary-west-inbound" },
] as const;

// Deterministic synthetic incident generator across July, August, September, October 2026
function createHistory(): HistoricalIncident[] {
  const causes: HistoricalIncident["cause"][] = ["accident", "road_repair", "heavy_volume", "flood", "unknown"];
  const windows: HistoricalIncident["peak_window"][] = ["08:00-10:00", "17:00-19:00", "08:00-10:00", "17:00-19:00", "12:00-14:00"];

  const list: HistoricalIncident[] = [];
  let counter = 100;

  const months = ["2026-07", "2026-08", "2026-09", "2026-10"];

  for (const month of months) {
    const days = [3, 8, 12, 17, 21, 26, 29];
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const junction = MANGALURU_JUNCTIONS[i % MANGALURU_JUNCTIONS.length];
      const cause = causes[(i + (month === "2026-08" ? 3 : 0)) % causes.length];
      const window = windows[i % windows.length];
      const hour = window === "08:00-10:00" ? "08:30" : window === "17:00-19:00" ? "17:45" : "13:15";

      const delayMinutes = 15 + ((counter * 7) % 35);
      const durationMinutes = delayMinutes + 25 + ((counter * 3) % 40);

      list.push({
        id: `hist-${counter++}`,
        junction_id: junction.id,
        junction_name: junction.name,
        segment_id: junction.segment_id,
        direction: i % 2 === 0 ? "outbound" : "inbound",
        occurred_at: `${month}-${String(day).padStart(2, "0")}T${hour}:00.000Z`,
        duration_minutes: durationMinutes,
        commuter_delay_minutes: delayMinutes,
        cause,
        month,
        peak_window: window,
        provenance: "simulated",
      });
    }
  }

  return list;
}

export const HISTORICAL_INCIDENTS = createHistory();
