// Specification of L1–L6 verification levels aligned with Traffic JAM brief §4.

export type VerificationLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export type LadderTier = {
  level: VerificationLevel;
  name: string;
  source: string;
  status: "implemented" | "planned";
  achieved: boolean;
  description: string;
};

export const LADDER_SPEC: Record<VerificationLevel, {
  name: string;
  source: string;
  status: "implemented" | "planned";
  description: string;
}> = {
  L1: {
    name: "Reported",
    source: "Citizen Report",
    status: "implemented",
    description: "Initial user report with manually selected category and segment. Unconfirmed cause.",
  },
  L2: {
    name: "Location Support",
    source: "Reporter Device Location",
    status: "implemented",
    description: "A recent device location supports where the report was made. It does not prove congestion or the reported cause.",
  },
  L3: {
    name: "Multiple Sources",
    source: "Corroboration",
    status: "implemented",
    description: "At least three distinct signed-in reporting accounts within the rolling 15-minute window. Distinct accounts do not prove independent witnesses.",
  },
  L4: {
    name: "Speed Slowdown",
    source: "Telemetry (Simulated)",
    status: "implemented",
    description: "≥3 synchronized sources across 5 minutes with speed <40% of baseline.",
  },
  L5: {
    name: "Photo Evidence",
    source: "Media Upload",
    status: "planned",
    description: "Cryptographically verified, metadata-scrubbed photo/video proof.",
  },
  L6: {
    name: "Authority Action",
    source: "Authority Review",
    status: "implemented",
    description: "An authorised authority user has recorded a confirmation. This is an application action, not proof of on-site attendance.",
  },
};

export function evaluateSegmentLadder(params: {
  hasReport: boolean;
  hasLocationSupport?: boolean;
  isMultipleSources: boolean;
  isSlowdownSupported: boolean;
  isAuthorityConfirmed?: boolean;
}): {
  currentLevel: VerificationLevel | null;
  currentLabel: string;
  tiers: LadderTier[];
} {
  const l1Achieved = params.hasReport;
  const l2Achieved = params.hasLocationSupport ?? false;
  const l3Achieved = params.isMultipleSources;
  const l4Achieved = params.isSlowdownSupported;
  const l5Achieved = false; // Planned extension
  const l6Achieved = params.isAuthorityConfirmed ?? false;

  const tiers: LadderTier[] = [
    { ...LADDER_SPEC.L6, level: "L6", achieved: l6Achieved },
    { ...LADDER_SPEC.L5, level: "L5", achieved: l5Achieved },
    { ...LADDER_SPEC.L4, level: "L4", achieved: l4Achieved },
    { ...LADDER_SPEC.L3, level: "L3", achieved: l3Achieved },
    { ...LADDER_SPEC.L2, level: "L2", achieved: l2Achieved },
    { ...LADDER_SPEC.L1, level: "L1", achieved: l1Achieved },
  ];

  let currentLevel: VerificationLevel | null = null;
  let currentLabel = "Normal baseline flow";

  if (l6Achieved) {
    currentLevel = "L6";
    currentLabel = "L6 Authority Confirmed";
  } else if (l4Achieved) {
    currentLevel = "L4";
    currentLabel = "L4 Speed Slowdown Supported";
  } else if (l3Achieved) {
    currentLevel = "L3";
    currentLabel = "L3 Multiple Sources Confirmed";
  } else if (l1Achieved) {
    currentLevel = "L1";
    currentLabel = "L1 Reported, Unconfirmed";
  }

  return { currentLevel, currentLabel, tiers };
}
