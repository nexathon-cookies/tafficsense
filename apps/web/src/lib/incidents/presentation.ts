import type { LiveIncident } from "./server";

export function liveIncidentLevelLabel(incident: Pick<LiveIncident, "level" | "report_count">): string {
  if (incident.level === "L6") return "Reviewed by an authority user";
  if (incident.level === "L5") return `${incident.report_count} ${incident.report_count === 1 ? "report" : "reports"} · photo evidence checked by AI vision`;
  if (incident.level === "L3") return `${incident.report_count} people reported this`;
  if (incident.level === "L2") return "Location support recorded for this report";
  return `${incident.report_count} ${incident.report_count === 1 ? "person has" : "people have"} reported this`;
}

export function formatLiveIncidentTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
