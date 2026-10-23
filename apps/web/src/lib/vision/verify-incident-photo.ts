/**
 * L5 Vision AI Incident Verification Module
 *
 * Sends an uploaded incident photo to the Gemini Vision API for classification.
 * Falls back to a deterministic heuristic when the API key is absent or the
 * network times out, so the live demo never crashes on stage.
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
  /** Whether this result came from the live Gemini API or the offline fallback. */
  source: "gemini" | "offline_fallback";
  /** Client-generated, EXIF-stripped JPEG thumbnail (data URL) attached after verification. */
  photoDataUrl?: string;
  /** True if the image was flagged as AI-generated, synthetic, or a screen recapture. */
  isAiGenerated?: boolean;
  /** Specific forensic reason when an image is rejected. */
  rejectionReason?: "none" | "ai_generated" | "screen_recapture" | "not_a_road_incident";
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
// Deterministic offline fallback
// ---------------------------------------------------------------------------

/**
 * Returns a plausible structured result without any network call.
 * Uses the user's reported category as the primary signal and produces
 * consistent labels that look credible on stage even without an API key.
 */
function offlineFallback(input: L5VerificationInput, reason?: string): L5VerificationResult {
  return {
    isGenuineIncident: false,
    detectedCategory: "unknown",
    categoryMatchesReport: false,
    confidenceTier: "low",
    severity: "moderate",
    visualSummary:
      reason ??
      `AI vision check unavailable (set GEMINI_API_KEY in apps/web/.env.local). Report for ${input.userSelectedCategory} will submit as L1/L2 without L5 promotion.`,
    verificationTier: "L5",
    source: "offline_fallback",
  };
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
] as const;

const VISION_PROMPT = `You are a strict forensic traffic incident image verifier for an Indian civic road-safety platform.
Examine the uploaded image carefully and return ONLY valid JSON matching this exact schema:
{
  "isGenuineIncident": <boolean>,
  "isAiGenerated": <boolean>,
  "rejectionReason": <"none"|"ai_generated"|"screen_recapture"|"not_a_road_incident">,
  "detectedCategory": <"accident"|"road_repair"|"heavy_volume"|"flood"|"unknown">,
  "categoryMatchesReport": <boolean>,
  "confidenceTier": <"high"|"moderate"|"low">,
  "severity": <"moderate"|"severe"|"critical">,
  "visualSummary": "<one objective sentence describing what is visible or why it was rejected, max 120 chars>"
}
Strict forensic & verification rules:
1. AI-GENERATED / SYNTHETIC DETECTION ("isAiGenerated": true, "rejectionReason": "ai_generated"):
   - Carefully inspect for signs of AI generation (Midjourney, DALL-E, Stable Diffusion, Flux, Imagen/Gemini, etc.): gibberish/warped text on license plates or shop signs, deformed vehicle wheels/frames, unnatural cinematic/plastic lighting or painterly textures, impossible reflections/physics, or AI watermarks.
   - If the image appears AI-generated, CGI, 3D-rendered, or digitally fabricated, you MUST set "isAiGenerated": true, "isGenuineIncident": false, "rejectionReason": "ai_generated", "detectedCategory": "unknown", and "confidenceTier": "low".
2. SCREEN RECAPTURE / SCREENSHOT DETECTION ("rejectionReason": "screen_recapture"):
   - If the image is a photo of a computer monitor/phone screen (moiré pixel grid, screen bezel, browser UI) or a meme/screenshot with overlays, set "isGenuineIncident": false, "rejectionReason": "screen_recapture", and "confidenceTier": "low".
3. REAL ROAD INCIDENT CHECK:
   - Set "isGenuineIncident": true and "rejectionReason": "none" ONLY if the image is an authentic, real-world camera photograph of an outdoor road/street scene with an active traffic disruption ("accident", "road_repair", "heavy_volume", or "flood").
   - Otherwise set "isGenuineIncident": false, "rejectionReason": "not_a_road_incident", "detectedCategory": "unknown", and "confidenceTier": "low".
4. The user's reported category is: REPORTED_CATEGORY. Set "categoryMatchesReport": true if the visible disruption matches or is closely related to REPORTED_CATEGORY.
5. Do NOT include markdown fences or any text outside the JSON object.`;

type GeminiRawResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type RawAIResult = {
  isGenuineIncident?: unknown;
  isAiGenerated?: unknown;
  rejectionReason?: unknown;
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

  const isAiGenerated = parsed.isAiGenerated === true || parsed.rejectionReason === "ai_generated";
  const validRejectionReasons = ["none", "ai_generated", "screen_recapture", "not_a_road_incident"] as const;
  const rejectionReason = isAiGenerated
    ? "ai_generated"
    : validRejectionReasons.includes(parsed.rejectionReason as typeof validRejectionReasons[number])
      ? (parsed.rejectionReason as typeof validRejectionReasons[number])
      : parsed.isGenuineIncident === true
        ? "none"
        : "not_a_road_incident";

  // Never allow an AI-generated or screen-recaptured image to be marked genuine
  const isGenuine =
    parsed.isGenuineIncident === true &&
    !isAiGenerated &&
    rejectionReason === "none";

  const detectedCategory = !isGenuine
    ? "unknown"
    : validCategories.includes(parsed.detectedCategory as L5DetectedCategory)
      ? (parsed.detectedCategory as L5DetectedCategory)
      : "unknown";

  const severity = validSeverities.includes(parsed.severity as L5Severity)
    ? (parsed.severity as L5Severity)
    : "moderate";

  const confidenceTier = !isGenuine
    ? "low"
    : validConfidence.includes(parsed.confidenceTier as string)
      ? (parsed.confidenceTier as "high" | "moderate" | "low")
      : "low";

  const visualSummary =
    typeof parsed.visualSummary === "string" && parsed.visualSummary.length > 0
      ? parsed.visualSummary.slice(0, 160)
      : isAiGenerated
        ? "Synthetic image or AI generation artifacts detected."
        : rejectionReason === "screen_recapture"
          ? "Photograph of screen or display recapture detected."
          : "Visual assessment inconclusive.";

  const categoryMatches =
    isGenuine &&
    (parsed.categoryMatchesReport === true ||
      detectedCategory === userSelectedCategory ||
      userSelectedCategory === "unknown");

  return {
    isGenuineIncident: isGenuine,
    detectedCategory,
    categoryMatchesReport: categoryMatches,
    confidenceTier,
    severity,
    visualSummary,
    verificationTier: "L5",
    source: "gemini",
    isAiGenerated,
    rejectionReason,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Verifies an incident photo using Gemini Vision API with fallback to flash.
 * Returns an unverified result without throwing if API key is missing or calls fail.
 */
export async function verifyIncidentPhoto(
  input: L5VerificationInput,
): Promise<L5VerificationResult> {
  validateInput(input);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return offlineFallback(input);
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
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    for (const model of GEMINI_MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          continue;
        }

        const raw: GeminiRawResponse = await response.json();
        return parseGeminiResponse(raw, input.userSelectedCategory);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          break;
        }
        continue;
      }
    }

    return offlineFallback(
      input,
      "Gemini API request failed or quota exceeded; submitting without L5 AI promotion.",
    );
  } catch {
    return offlineFallback(input);
  } finally {
    clearTimeout(timeoutId);
  }
}
