import { reportDirections, reportTimestamp, type ReportSegment } from "../reports/rules.ts";

export type ReportAssessment = {
  segment_id: ReportSegment; direction: "inbound" | "outbound";
  report_count: number; recent_report_count: number; eligible_report_count: number; eligible_source_count: number;
  multiple_sources: boolean; valid_until: string | null; provenance: "simulated";
};
export type AssessmentView = { state: "multiple" | "insufficient" | "expired"; label: string };
export type AssessmentOrigin = { monotonic: number; wall: number };

function invalid(): never { throw new Error("Invalid report assessment."); }
function count(input: unknown): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0 || input > 2000) return invalid();
  return input;
}
export function parseReportAssessment(input: unknown, readAt: string): ReportAssessment {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const row = input as Record<string, unknown>;
  const fields = ["segment_id", "direction", "report_count", "recent_report_count", "eligible_report_count",
    "eligible_source_count", "multiple_sources", "valid_until", "provenance"];
  if (Object.keys(row).length !== fields.length || fields.some(key => !Object.hasOwn(row, key))) return invalid();
  if (typeof row.segment_id !== "string" || !Object.hasOwn(reportDirections, row.segment_id)) return invalid();
  const segment_id = row.segment_id as ReportSegment;
  const direction = reportDirections[segment_id];
  if (row.direction !== direction || row.provenance !== "simulated") return invalid();
  const report_count = count(row.report_count), recent_report_count = count(row.recent_report_count);
  const eligible_report_count = count(row.eligible_report_count), eligible_source_count = count(row.eligible_source_count);
  if (recent_report_count > report_count || eligible_report_count > recent_report_count || eligible_source_count > eligible_report_count
    || (eligible_source_count === 0) !== (eligible_report_count === 0)
    || row.multiple_sources !== (eligible_source_count >= 3)) return invalid();
  const valid_until = row.valid_until === null ? null : reportTimestamp(row.valid_until);
  if ((recent_report_count > 0 && valid_until === null) || (report_count === 0 && valid_until !== null)) return invalid();
  if (valid_until !== null && (Date.parse(valid_until) < Date.parse(readAt)
    || (recent_report_count > 0 && Date.parse(valid_until) > Date.parse(readAt) + 20 * 60000))) return invalid();
  return { segment_id, direction, report_count, recent_report_count, eligible_report_count, eligible_source_count,
    multiple_sources: row.multiple_sources as boolean, valid_until, provenance: "simulated" };
}

export function assessmentElapsed(origin: AssessmentOrigin | null, now: AssessmentOrigin): number | null {
  if (!origin || ![origin.monotonic, origin.wall, now.monotonic, now.wall].every(Number.isFinite)
    || now.monotonic < origin.monotonic) return null;
  // Wall time covers suspended devices whose monotonic clock stops; forward skew only expires early.
  return Math.max(now.monotonic - origin.monotonic, now.wall - origin.wall);
}

export type AssessmentTiming = { elapsedMs: number; failed: boolean };
export function advanceAssessmentTiming(previous: AssessmentTiming, origin: AssessmentOrigin | null, now: AssessmentOrigin): AssessmentTiming {
  const elapsed = assessmentElapsed(origin, now);
  return { elapsedMs: Math.max(previous.elapsedMs, elapsed ?? 0), failed: previous.failed || elapsed === null };
}

export function assessmentRemainingMs(deadline: string, readAt: string, elapsedMs: number): number {
  const remainder = (value: string) => Number((/\.(\d{1,6})(?:Z|[+-])/.exec(value)?.[1] ?? "").padEnd(6, "0").slice(3));
  const remaining = (Date.parse(deadline) - Date.parse(readAt)) * 1000 + remainder(deadline) - remainder(readAt) - Math.ceil(elapsedMs * 1000);
  return Number.isFinite(remaining) ? remaining / 1000 : -Infinity;
}

export function assessmentView(row: ReportAssessment, readAt: string, elapsedMs: number | null): AssessmentView {
  if (elapsedMs === null || !Number.isFinite(elapsedMs) || elapsedMs < 0
    || (row.valid_until !== null && assessmentRemainingMs(row.valid_until, readAt, elapsedMs) <= 0)) {
    return { state: "expired", label: "Assessment needs refresh — previous counts are historical, not current evidence." };
  }
  const counts = `${row.recent_report_count} recent · ${row.eligible_report_count} eligible reports · ${row.eligible_source_count} eligible sources (as of data read)`;
  return { state: row.multiple_sources ? "multiple" : "insufficient",
    label: `${counts} · ${row.multiple_sources ? "L3 Multiple sources" : "Multiple-source threshold not met"}` };
}
