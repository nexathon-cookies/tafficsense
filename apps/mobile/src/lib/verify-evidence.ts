import type { ReportCategory } from "@trafficsense/shared";
import { MobileApiError, requestJson } from "./request";

const getApiBaseUrl = () => process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// L5 category mapping: mobile ReportCategory → backend L5DetectedCategory
// Valid backend categories: "accident" | "road_repair" | "heavy_volume" | "flood" | "unknown"
// ---------------------------------------------------------------------------
export type L5Category =
  | "accident"
  | "road_repair"
  | "heavy_volume"
  | "flood"
  | "unknown";

export const MOBILE_TO_L5_CATEGORY: Record<ReportCategory, L5Category> = {
  accident: "accident",
  road_repair: "road_repair",
  festival: "heavy_volume",
  strike: "unknown",
  vip_movement: "unknown",
  landslide: "accident",
  heavy_rain: "flood",
  flood: "flood",
  signal_failure: "heavy_volume",
  breakdown: "accident",
  road_closed: "road_repair",
  bridge_maintenance: "road_repair",
  police_restriction: "unknown",
  fallen_tree: "accident",
  heavy_traffic: "heavy_volume",
  other: "unknown",
  unknown: "unknown",
};

// ---------------------------------------------------------------------------
// segmentId derivation: nearest corridor from lat/lng
// The backend requires a non-empty ReportSegment string. We pick the closest
// of the 5 known Mangaluru corridor IDs using bounding-box heuristics.
// ---------------------------------------------------------------------------
export type MangaluruSegmentId =
  | "primary-west"
  | "primary-east"
  | "alternative-west"
  | "alternative-east"
  | "primary-west-inbound";

export function deriveSegmentId(lat: number, lng: number): MangaluruSegmentId {
  // Mangaluru coastal corridor heuristic (approximate bounding boxes)
  // South-west quadrant: Hampankatta, Central, MG Road
  if (lng < 74.855 && lat < 12.875) return "primary-west";
  // South-east quadrant: Pumpwell, Kankanady, Airport Road
  if (lng >= 74.855 && lat < 12.875) return "primary-east";
  // North-west: Ladyhill, Bendur, Falnir
  if (lng < 74.845 && lat >= 12.875) return "alternative-west";
  // North-east: KSRTC, Bejai, Kadri
  if (lng >= 74.845 && lat >= 12.875) return "alternative-east";
  // Default fallback
  return "primary-west";
}

// ---------------------------------------------------------------------------
// Verify-evidence response types
// ---------------------------------------------------------------------------
export type L5VerifyResult = {
  detectedCategory: string;
  confidence: number;
  confidenceTier?: "high" | "moderate" | "low";
  matchesUserCategory: boolean;
  upgradeEligible: boolean;
  summary: string;
  severity?: string;
  isGenuineIncident?: boolean;
};

export type VerifyEvidenceResponse =
  | { ok: true; result: L5VerifyResult }
  | { ok: false; error: string };

function parseVerifyEvidenceResponse(value: unknown): VerifyEvidenceResponse {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ok" in value)
  ) {
    throw new Error("Vision service returned an invalid response.");
  }
  const v = value as Record<string, unknown>;
  if (v.ok === false) {
    if (typeof v.error !== "string") {
      throw new Error("Vision service returned an invalid response.");
    }
    return { ok: false, error: v.error };
  }
  if (v.ok !== true || typeof v.result !== "object" || v.result === null) {
    throw new Error("Vision service returned an invalid response.");
  }
  const r = v.result as Record<string, unknown>;

  const detectedCategory = typeof r.detectedCategory === "string" ? r.detectedCategory : "unknown";
  const visualSummary =
    typeof r.visualSummary === "string"
      ? r.visualSummary
      : typeof r.summary === "string"
        ? r.summary
        : "Visual assessment recorded.";

  const matches =
    typeof r.categoryMatchesReport === "boolean"
      ? r.categoryMatchesReport
      : typeof r.matchesUserCategory === "boolean"
        ? r.matchesUserCategory
        : true;

  const confidenceTier =
    typeof r.confidenceTier === "string" && ["high", "moderate", "low"].includes(r.confidenceTier)
      ? (r.confidenceTier as "high" | "moderate" | "low")
      : undefined;

  const confidence =
    typeof r.confidence === "number"
      ? r.confidence
      : confidenceTier === "high"
        ? 0.95
        : confidenceTier === "moderate"
          ? 0.8
          : 0.6;

  const isGenuine = typeof r.isGenuineIncident === "boolean" ? r.isGenuineIncident : true;
  const upgradeEligible =
    typeof r.upgradeEligible === "boolean"
      ? r.upgradeEligible
      : (isGenuine && matches);

  const severity = typeof r.severity === "string" ? r.severity : undefined;

  return {
    ok: true,
    result: {
      detectedCategory,
      confidence,
      confidenceTier,
      matchesUserCategory: matches,
      upgradeEligible,
      summary: visualSummary,
      severity,
      isGenuineIncident: isGenuine,
    },
  };
}

// ---------------------------------------------------------------------------
// verifyEvidence: POST /api/verify-evidence
// ---------------------------------------------------------------------------
export async function verifyEvidence(
  input: {
    imageBase64: string;
    mimeType: string;
    userSelectedCategory: ReportCategory;
    lat: number;
    lng: number;
  },
  accessToken: string,
): Promise<VerifyEvidenceResponse> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Traffic data is not configured for this mobile build.");
  }

  const segmentId = deriveSegmentId(input.lat, input.lng);
  const l5Category = MOBILE_TO_L5_CATEGORY[input.userSelectedCategory];

  const { response, payload: rawPayload } = await requestJson<unknown>(
    `${apiBaseUrl}/api/verify-evidence`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        userSelectedCategory: l5Category,
        segmentId,
      }),
    },
    "Vision service returned an invalid response.",
  );

  const parsed = parseVerifyEvidenceResponse(rawPayload);
  if (!response.ok && parsed.ok) {
    throw new MobileApiError("Vision service is unavailable.", response.status);
  }
  return parsed;
}
