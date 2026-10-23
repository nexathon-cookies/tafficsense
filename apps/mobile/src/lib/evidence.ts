import type { LiveIncident } from "@trafficsense/shared";

// Plain-language evidence labels. These describe the report evidence only, never a confirmed cause.
export const EVIDENCE_LABELS: Record<LiveIncident["level"], string> = {
  L1: "Reported, not yet corroborated",
  L2: "Location-supported report",
  L3: "Multiple independent reports",
  L4: "Traffic slowdown corroborates disruption",
  L5: "Authority-reviewed disruption",
  L6: "High-confidence verified disruption",
};

export function evidenceLabel(level: LiveIncident["level"]): string {
  return EVIDENCE_LABELS[level] ?? "Evidence level unavailable";
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Live community reports refresh while their screen is open; the server still decides what is current.
export const LIVE_REFRESH_MS = 30_000;
