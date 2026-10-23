// Single unified status mapping table for traffic segments per Plan 2 Phase 2.

export type SegmentStatusKind =
  | "alert"
  | "slowdown_l4"
  | "multiple_l3"
  | "reported_l1"
  | "clear"
  | "no_data";

export type SegmentStatus = {
  kind: SegmentStatusKind;
  chipLabel: "Alert" | "Slowdown L4" | "Multiple L3" | "Reported L1" | "Clear" | "No data";
  color: string;
  bgColor: string;
  borderColor: string;
  delayText: string;
  delayMinutes: number | null;
  ageDot: "green" | "amber" | "grey";
  ageLabel: "Fresh" | "Stale" | "No data";
  directionArrow: "→" | "←";
};

export const STATUS_CONFIG: Record<SegmentStatusKind, {
  label: SegmentStatus["chipLabel"];
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  alert: {
    label: "Alert",
    color: "#b91c1c",
    bgColor: "#fef2f2",
    borderColor: "#fca5a5",
  },
  slowdown_l4: {
    label: "Slowdown L4",
    color: "#c2410c",
    bgColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  multiple_l3: {
    label: "Multiple L3",
    color: "#b45309",
    bgColor: "#fffbeb",
    borderColor: "#fcd34d",
  },
  reported_l1: {
    label: "Reported L1",
    color: "#854d0e",
    bgColor: "#fefce8",
    borderColor: "#fef08a",
  },
  clear: {
    label: "Clear",
    color: "#047857",
    bgColor: "#ecfdf5",
    borderColor: "#6ee7b7",
  },
  no_data: {
    label: "No data",
    color: "#475569",
    bgColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
};

export function deriveSegmentStatus(params: {
  direction: string;
  hasAlert: boolean;
  slowdownState?: string;
  assessmentState?: string;
  hasRecentReport: boolean;
  delaySeconds: number | null;
  freshness: "recent" | "stale" | "future" | "missing" | "unknown";
}): SegmentStatus {
  const directionArrow = params.direction === "inbound" ? "←" : "→";

  let ageDot: "green" | "amber" | "grey" = "grey";
  let ageLabel: "Fresh" | "Stale" | "No data" = "No data";
  if (params.freshness === "recent") {
    ageDot = "green";
    ageLabel = "Fresh";
  } else if (params.freshness === "stale" || params.freshness === "future") {
    ageDot = "amber";
    ageLabel = "Stale";
  }

  let delayText = "—";
  let delayMinutes: number | null = null;
  if (params.delaySeconds !== null && Number.isFinite(params.delaySeconds)) {
    delayMinutes = Math.round(params.delaySeconds / 60);
    delayText = delayMinutes > 0 ? `+${delayMinutes}m` : `${delayMinutes}m`;
  }

  let kind: SegmentStatusKind = "clear";
  if (params.hasAlert) {
    kind = "alert";
  } else if (params.slowdownState === "supported") {
    kind = "slowdown_l4";
  } else if (params.assessmentState === "multiple") {
    kind = "multiple_l3";
  } else if (params.hasRecentReport) {
    kind = "reported_l1";
  } else if (params.freshness === "missing" || params.freshness === "unknown") {
    kind = "no_data";
  } else {
    kind = "clear";
  }

  const config = STATUS_CONFIG[kind];
  return {
    kind,
    chipLabel: config.label,
    color: config.color,
    bgColor: config.bgColor,
    borderColor: config.borderColor,
    delayText,
    delayMinutes,
    ageDot,
    ageLabel,
    directionArrow,
  };
}
