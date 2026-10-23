import { assessmentRemainingMs } from "../evidence/assessment.ts";
import type { RouteAlert } from "./rules.ts";

const reasons: Record<string, string> = {
  unrelated_selection: "Selected segment is not on the affected primary route and direction",
  unsupported_incident: "No current supported incident bound to this comparison",
  no_alternative: "The fixed alternative route is unavailable",
  no_routes: "The fixed routes are unavailable",
  missing: "Completed route traversals are missing",
  stale: "Completed route traversals are stale; refresh needed",
  future: "Route inputs are future-dated; refresh needed",
  invalid: "Route comparison inputs are invalid",
  incompatible: "Route inputs have incompatible direction or baseline",
  mixed_runs: "Route segments do not share one current evidence run",
  alternative_hazard: "The alternative has a recent reported, unconfirmed hazard",
  alternative_slowdown: "The alternative has a current supported simulated slowdown",
  below_threshold: "Simulated estimated time difference is below five minutes",
};
export function routeAlertView(alert: RouteAlert, readAt: string, elapsedMs: number | null): {
  state: "alert" | "abstain" | "expired"; label: string;
} {
  if (alert.kind !== "alert") return { state: "abstain", label: `No route alert · ${reasons[alert.reason ?? "invalid"] ?? reasons.invalid}` };
  if (elapsedMs === null || !Number.isFinite(elapsedMs) || elapsedMs < 0 || alert.valid_until === null
    || assessmentRemainingMs(alert.valid_until, readAt, elapsedMs) <= 0) {
    return { state: "expired", label: "Route alert expired · refresh needed; previous comparison is historical" };
  }
  if (alert.provenance !== "simulated" || alert.reason !== null || !alert.incident_id || alert.savings_us === null
    || !Number.isSafeInteger(alert.savings_us) || alert.savings_us < 300_000_000) {
    return { state: "abstain", label: `No route alert · ${reasons.invalid}` };
  }
  const seconds = (alert.savings_us / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 6 });
  return { state: "alert", label: `Simulated estimated time difference · ${seconds} seconds less on the fixed alternative · independent completed segment traversals, not an actual end-to-end trip; not guaranteed savings, road safety or navigation` };
}
