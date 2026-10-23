import { assessmentRemainingMs } from "../evidence/assessment.ts";

export type IncidentView = { state: "supported" | "unconfirmed" | "stale" | "cleared" | "historical"; label: string };
type IncidentInput = { state: "supported" | "unconfirmed" | "stale" | "cleared"; is_current: boolean;
  valid_until: string | null; prior_incident_id: string | null };
export function incidentView(row: IncidentInput, readAt: string, elapsedMs: number | null): IncidentView {
  if (row.state === "cleared") return { state: "cleared", label: "Historical clearance · supported simulated recovery, not current road safety" };
  if (!row.is_current) return { state: "historical", label: "Historical incident · another evidence run is selected; not cleared" };
  if (elapsedMs === null || row.valid_until === null || assessmentRemainingMs(row.valid_until, readAt, elapsedMs) <= 0) {
    return { state: "stale", label: "Stale incident evidence · refresh needed, not cleared" };
  }
  if (row.state === "supported") {
    return { state: "supported", label: `${row.prior_incident_id ? "Reopened incident" : "Incident"} · simulated slowdown supported` };
  }
  return row.state === "stale" ? { state: "stale", label: "Stale incident evidence · not cleared" }
    : { state: "unconfirmed", label: "Incident support withdrawn · recovery unconfirmed, not cleared" };
}

export type TraversalView = { state: "available" | "missing" | "stale" | "future" | "invalid" | "incompatible";
  label: string; delaySeconds: number | null };
type TraversalInput = { status: TraversalView["state"]; delay_seconds: number | null; valid_until: string | null };
const unavailable = {
  missing: "Delay unavailable · no completed traversal in the selected evidence run",
  stale: "Delay unavailable · completed traversal is stale; refresh needed",
  future: "Delay unavailable · traversal is future-dated",
  invalid: "Delay unavailable · traversal or baseline is invalid",
  incompatible: "Delay unavailable · selected evidence does not match this direction and baseline",
};
export function traversalView(row: TraversalInput, readAt: string, elapsedMs: number | null): TraversalView {
  if (row.status !== "available") return { state: row.status, label: unavailable[row.status], delaySeconds: null };
  if (elapsedMs === null || row.valid_until === null || assessmentRemainingMs(row.valid_until, readAt, elapsedMs) <= 0) {
    return { state: "stale", label: unavailable.stale, delaySeconds: null };
  }
  if (row.delay_seconds === null || !Number.isFinite(row.delay_seconds) || row.delay_seconds < 0) {
    return { state: "invalid", label: unavailable.invalid, delaySeconds: null };
  }
  return { state: "available", label: `${row.delay_seconds.toLocaleString("en-GB", { maximumFractionDigits: 3 })} seconds excess traversal time · SIMULATED`, delaySeconds: row.delay_seconds };
}
