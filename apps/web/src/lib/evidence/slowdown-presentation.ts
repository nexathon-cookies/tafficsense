import type { SlowdownAssessment } from "./slowdown.ts";
import { assessmentRemainingMs } from "./assessment.ts";
import { formatTrafficTime } from "../traffic/presentation.ts";

export type SlowdownView = { state: SlowdownAssessment["status"] | "expired"; label: string; windowLabel: string };
const labels: Record<SlowdownAssessment["status"], string> = {
  supported: "L4 Slowdown supported", not_supported: "Slowdown threshold not met",
  insufficient: "Insufficient complete synthetic sources", stale: "Stale slowdown window",
  future: "Future-dated samples are unsupported", missing: "No synthetic samples", unavailable: "Slowdown assessment unavailable",
};
export function slowdownView(row: SlowdownAssessment, readAt: string, elapsedMs: number | null): SlowdownView {
  const windowLabel = row.window_start && row.window_end
    ? `Sampled window: ${formatTrafficTime(row.window_start)} to ${formatTrafficTime(row.window_end)}` : "Sampled window unavailable";
  if (elapsedMs === null || !Number.isFinite(elapsedMs) || elapsedMs < 0
    || (row.valid_until !== null && assessmentRemainingMs(row.valid_until, readAt, elapsedMs) <= 0)) {
    return { state: "expired", label: "Slowdown assessment needs refresh — previous evidence is historical, not current.",
      windowLabel: `Previous ${windowLabel.replace(/^Sampled/, "sampled")}` };
  }
  return { state: row.status,
    label: `${labels[row.status]} · ${row.complete_source_count} complete synthetic sources · ${row.slow_source_count} slowdown-supporting sources (as of data read)`, windowLabel };
}
