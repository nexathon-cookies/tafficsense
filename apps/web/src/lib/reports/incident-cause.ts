import { reportCategories, reportCategoryIcons, type ReportCategory } from "./rules.ts";

export type IncidentCauseBreakdown = {
  leadingCategory: ReportCategory | "unknown";
  leadingLabel: string;
  icon: string;
  agreementCount: number;
  totalAssociatedReports: number;
  summary: string;
  detail: string;
};

/**
 * Calculates the reported cause breakdown and agreement count for a persisted incident
 * from its temporally associated report episodes and public reports.
 *
 * Replaces fixed confidence percentages with truthful agreement metrics:
 * e.g. "Reported as Accident by 3 of 4 reports (unconfirmed)".
 */
export function getIncidentCauseBreakdown(
  incident: { report_episode_ids: string[] },
  reports: Array<{ episode_id: string; category: string }>
): IncidentCauseBreakdown {
  const associated = reports.filter((r) =>
    incident.report_episode_ids.includes(r.episode_id)
  );
  const total = associated.length;

  if (total === 0) {
    return {
      leadingCategory: "unknown",
      leadingLabel: reportCategories.unknown,
      icon: reportCategoryIcons.unknown,
      agreementCount: 0,
      totalAssociatedReports: 0,
      summary: "Unknown — reported, unconfirmed",
      detail: "No associated citizen reports",
    };
  }

  // Count frequencies
  const counts = new Map<string, number>();
  for (const r of associated) {
    const cat = r.category in reportCategories ? r.category : "unknown";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  // Find category with highest frequency
  // If tied, prioritize specific category over unknown
  let topCat: string = "unknown";
  let topCount = 0;

  for (const [cat, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      topCat = cat;
    } else if (count === topCount && topCat === "unknown" && cat !== "unknown") {
      topCat = cat;
    }
  }

  const validCategory = (
    topCat in reportCategories ? topCat : "unknown"
  ) as ReportCategory;
  const label = reportCategories[validCategory] ?? "Unknown";
  const icon = reportCategoryIcons[validCategory] ?? "unknown";

  const summary =
    validCategory === "unknown"
      ? `Unknown — reported, unconfirmed (${total} ${total === 1 ? "report" : "reports"})`
      : `Reported as ${label} by ${topCount} of ${total} ${
          total === 1 ? "report" : "reports"
        } (unconfirmed)`;

  const detail = `${topCount} of ${total} reports agree on ${label}`;

  return {
    leadingCategory: validCategory,
    leadingLabel: label,
    icon,
    agreementCount: topCount,
    totalAssociatedReports: total,
    summary,
    detail,
  };
}
