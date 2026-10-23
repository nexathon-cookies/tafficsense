/**
 * L5 Vision AI Incident Verification Module
 *
 * Sends an uploaded incident photo to the Gemini Vision API for classification.
 * Reports service unavailability when the API key is absent or the network
 * fails. It never promotes a report based on a synthetic visual assessment.
 *
 * Privacy contract: EXIF metadata is never extracted or stored. The image bytes
 * are sent only to the Gemini API and are immediately discarded; no image data
 * is persisted by this application.
 */

import "server-only";

export const L5_ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type L5MimeType = typeof L5_ACCEPTED_MIME_TYPES[number];

/** Categories that the AI classifier can return, matching report categories. */
export type L5DetectedCategory =
  | "accident"
  | "road_repair"
  | "heavy_volume"
  | "flood"
  | "unknown";

export type L5Severity = "moderate" | "severe" | "critical";

export type L5VerificationResult = {
  isGenuineIncident: boolean;
  detectedCategory: L5DetectedCategory;
  categoryMatchesReport: boolean;
  /** Qualitative confidence tier instead of a raw percentage — avoids false precision. */
  confidenceTier: "high" | "moderate" | "low";
  severity: L5Severity;
  visualSummary: string;
  verificationTier: "L5";
  /** The result is always produced by the live Gemini API. */
  source: "gemini";
};

/** Input accepted by the verification endpoint. */
export type L5VerificationInput = {
  /** Base64-encoded image bytes, max 4 MB decoded. */
  imageBase64: string;
  mimeType: L5MimeType;
  /** Category the user selected in the report form. */
  userSelectedCategory: L5DetectedCategory;
  segmentId: string;
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const MAX_BASE64_BYTES = Math.ceil((4 * 1024 * 1024) / 3) * 4; // 4 MB decoded → base64 chars

function validateInput(input: L5VerificationInput): void {
  if (!L5_ACCEPTED_MIME_TYPES.includes(input.mimeType)) {
    throw new Error(`Unsupported MIME type: ${input.mimeType}`);
  }
  if (typeof input.imageBase64 !== "string" || input.imageBase64.length > MAX_BASE64_BYTES) {
    throw new Error("Image exceeds 4 MB limit or is not a valid base64 string.");
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(input.imageBase64)) {
    throw new Error("imageBase64 is not valid base64.");
  }
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const VISION_PROMPT = `You are a traffic incident classifier for a civic mobility platform.
Analyse the provided road image and return ONLY valid JSON matching this exact schema:
{
  "isGenuineIncident": <boolean — true if any road disruption is visible>,
  "detectedCategory": <"accident"|"road_repair"|"heavy_volume"|"flood"|"unknown">,
  "categoryMatchesReport": <boolean>,
  "confidenceTier": <"high"|"moderate"|"low">,
  "severity": <"moderate"|"severe"|"critical">,
  "visualSummary": "<one sentence, objective civic description, max 120 chars>"
}
Rules:
- Do NOT include any text outside the JSON object.
- If the image shows no road at all, set isGenuineIncident to false and detectedCategory to "unknown".
- Never fabricate measurements or claim legal certainty.
- The reported category to compare against is: REPORTED_CATEGORY`;

type GeminiRawResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type RawAIResult = {
  isGenuineIncident?: unknown;
  detectedCategory?: unknown;
  categoryMatchesReport?: unknown;
  confidenceTier?: unknown;
  severity?: unknown;
  visualSummary?: unknown;
};

function parseGeminiResponse(
  raw: GeminiRawResponse,
  userSelectedCategory: L5DetectedCategory,
): L5VerificationResult {
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Extract JSON from the response, tolerating markdown code fences.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini response contained no JSON object.");

  const parsed: RawAIResult = JSON.parse(jsonMatch[0]);

  const validCategories: L5DetectedCategory[] = [
    "accident",
    "road_repair",
    "heavy_volume",
    "flood",
    "unknown",
  ];
  const validSeverities: L5Severity[] = ["moderate", "severe", "critical"];
  const validConfidence = ["high", "moderate", "low"];

  const detectedCategory = validCategories.includes(parsed.detectedCategory as L5DetectedCategory)
    ? (parsed.detectedCategory as L5DetectedCategory)
    : "unknown";

  const severity = validSeverities.includes(parsed.severity as L5Severity)
    ? (parsed.severity as L5Severity)
    : "moderate";

  const confidenceTier = validConfidence.includes(parsed.confidenceTier as string)
    ? (parsed.confidenceTier as "high" | "moderate" | "low")
    : "low";

  const visualSummary =
    typeof parsed.visualSummary === "string" && parsed.visualSummary.length > 0
      ? parsed.visualSummary.slice(0, 160)
      : "Visual assessment inconclusive.";

  return {
    isGenuineIncident: parsed.isGenuineIncident === true,
    detectedCategory,
    categoryMatchesReport: detectedCategory === userSelectedCategory,
    confidenceTier,
    severity,
    visualSummary,
    verificationTier: "L5",
    source: "gemini",
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Verifies an incident photo using Gemini Vision API with a 4-second timeout.
 * Throws if the live verifier is not configured or unavailable.
 */
export async function verifyIncidentPhoto(
  input: L5VerificationInput,
): Promise<L5VerificationResult> {
  validateInput(input);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Photo verification is unavailable because the vision service is not configured.");
  }

  const prompt = VISION_PROMPT.replace("REPORTED_CATEGORY", input.userSelectedCategory);

  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: input.mimeType,
              data: input.imageBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Photo verification service returned an error.");
    }

    const raw: GeminiRawResponse = await response.json();
    return parseGeminiResponse(raw, input.userSelectedCategory);
  } catch {
    // Network failure, timeout, or invalid response must not imply verification.
    throw new Error("Photo verification service is unavailable. Please try again later.");
  } finally {
    clearTimeout(timeoutId);
  }
}
