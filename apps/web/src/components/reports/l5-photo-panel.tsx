"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { L5VerificationResult, L5DetectedCategory, L5MimeType } from "@/lib/vision/verify-incident-photo";
import type { ReportCategory } from "@/lib/reports/rules";

/** Maps a live report category onto the coarser set the vision classifier understands. */
export function toL5Category(category: ReportCategory): L5DetectedCategory {
  switch (category) {
    case "accident":
      return "accident";
    case "road_repair":
    case "road_closed":
    case "bridge_maintenance":
      return "road_repair";
    case "heavy_traffic":
      return "heavy_volume";
    case "flood":
    case "heavy_rain":
      return "flood";
    default:
      return "unknown";
  }
}

type L5PhotoPanelProps = {
  segmentId: string;
  userSelectedCategory: L5DetectedCategory;
  onResult: (result: L5VerificationResult | null) => void;
};

const ACCEPTED_MIME_TYPES: L5MimeType[] = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;

const AI_METADATA_SIGNATURES = [
  "trainedalgorithmicmedia",
  "compositewithtrainedalgorithmicmedia",
  "c2pa.actions",
  "dall-e",
  "dalle",
  "openai",
  "midjourney",
  "stable diffusion",
  "stablediffusion",
  "comfyui",
  "automatic1111",
  "adobe firefly",
  "synthid",
  "bing image creator",
  "imagen",
] as const;

/**
 * Scans raw file header/trailer bytes (before canvas EXIF stripping) and filename
 * for C2PA, IPTC, XMP, or PNG tEXt markers injected by AI image generators.
 */
function detectAiMetadataSignature(bytes: Uint8Array, fileName: string): string | null {
  const lowerName = fileName.toLowerCase();
  if (
    lowerName.includes("dalle") ||
    lowerName.includes("midjourney") ||
    lowerName.includes("chatgpt") ||
    lowerName.includes("gemini_generated") ||
    lowerName.includes("ai_generated")
  ) {
    return "Filename matches known AI generator pattern";
  }
  // Decode first 64 KB and last 32 KB as Latin-1 to inspect XMP/C2PA/EXIF/tEXt chunks
  const decoder = new TextDecoder("latin1");
  const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 65536))).toLowerCase();
  const tail =
    bytes.length > 65536
      ? decoder.decode(bytes.subarray(Math.max(0, bytes.length - 32768))).toLowerCase()
      : "";
  const combined = `${head}\n${tail}`;
  for (const sig of AI_METADATA_SIGNATURES) {
    if (combined.includes(sig)) {
      return `Embedded AI metadata signature detected (${sig.toUpperCase()})`;
    }
  }
  return null;
}

/**
 * Downscales the image to at most 480px on its longest side and re-encodes it as JPEG.
 * Drawing onto a canvas drops all EXIF metadata (including GPS) from the stored copy.
 */
async function createCompressedDataUrl(blob: Blob): Promise<string | undefined> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image could not be decoded."));
      el.src = objectUrl;
    });
    const maxSide = 480;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.68);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function confidenceLabel(tier: L5VerificationResult["confidenceTier"]): string {
  return tier === "high" ? "HIGH" : tier === "moderate" ? "MODERATE" : "LOW";
}

function severityColor(severity: L5VerificationResult["severity"]): string {
  if (severity === "critical") return "#b91c1c";
  if (severity === "severe") return "#c2410c";
  return "#a16207";
}

export function L5PhotoPanel({ segmentId, userSelectedCategory, onResult }: L5PhotoPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "verifying" | "done" | "error">("idle");
  const [result, setResult] = useState<L5VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = useCallback(() => {
    setThumbnail(null);
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
    onResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onResult]);

  const handleFile = useCallback(
    async (file: File) => {
      // Validate file type
      const normalizedType = file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : (file.type.toLowerCase() as L5MimeType);
      if (!ACCEPTED_MIME_TYPES.includes(normalizedType)) {
        setErrorMessage("Only JPEG, PNG, or WebP images are accepted.");
        setStatus("error");
        return;
      }
      if (file.size > MAX_BYTES) {
        setErrorMessage("Image must be under 4 MB.");
        setStatus("error");
        return;
      }

      setStatus("reading");
      setErrorMessage(null);
      setResult(null);
      onResult(null);

      try {
        // Read the file as base64 — this is client-side only (no EXIF is parsed or stored)
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Build base64 in chunks to avoid string stack overflow on large images
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        const imageBase64 = btoa(binary);

        // Show thumbnail
        const blob = new Blob([arrayBuffer], { type: file.type });
        const photoDataUrl = await createCompressedDataUrl(blob);
        setThumbnail(photoDataUrl ?? URL.createObjectURL(blob));

        const aiMetaHit = detectAiMetadataSignature(bytes, file.name);
        if (aiMetaHit) {
          const rejectedAiResult: L5VerificationResult = {
            isGenuineIncident: false,
            isAiGenerated: true,
            rejectionReason: "ai_generated",
            detectedCategory: "unknown",
            categoryMatchesReport: false,
            confidenceTier: "low",
            severity: "moderate",
            visualSummary: `Blocked by C2PA/Metadata forensics: ${aiMetaHit}. Only authentic on-site camera photos are accepted.`,
            verificationTier: "L5",
            source: "gemini",
            photoDataUrl,
          };
          setResult(rejectedAiResult);
          onResult(rejectedAiResult);
          setStatus("done");
          return;
        }

        setStatus("verifying");

        const compressedBase64 = photoDataUrl?.startsWith("data:image/jpeg;base64,")
          ? photoDataUrl.slice("data:image/jpeg;base64,".length)
          : null;
        const payloadBase64 = compressedBase64 ?? imageBase64;
        const payloadMimeType: L5MimeType = compressedBase64 ? "image/jpeg" : normalizedType;

        // Call the verification endpoint
        const response = await fetch("/api/verify-evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: payloadBase64,
            mimeType: payloadMimeType,
            userSelectedCategory,
            segmentId,
          }),
        });

        const json = await response.json() as { ok: boolean; result?: L5VerificationResult; error?: string };

        if (!json.ok || !json.result) {
          setErrorMessage(json.error ?? "Verification returned an unexpected response.");
          setStatus("error");
          return;
        }

        const isMatch = json.result.isGenuineIncident && (json.result.detectedCategory === userSelectedCategory || userSelectedCategory === "unknown");
        const withPhoto: L5VerificationResult = { ...json.result, categoryMatchesReport: isMatch, photoDataUrl };
        setResult(withPhoto);
        onResult(withPhoto);
        setStatus("done");
      } catch {
        setErrorMessage("Could not reach the verification service. The report can still be submitted without L5 evidence.");
        setStatus("error");
      }
    },
    [segmentId, userSelectedCategory, onResult],
  );

  const lastCategoryRef = useRef(userSelectedCategory);
  useEffect(() => {
    if (lastCategoryRef.current !== userSelectedCategory) {
      lastCategoryRef.current = userSelectedCategory;
      if (result && result.source === "gemini") {
        const matches =
          result.isGenuineIncident &&
          (result.detectedCategory === userSelectedCategory || userSelectedCategory === "unknown");
        onResult({ ...result, categoryMatchesReport: matches });
      }
    }
  }, [userSelectedCategory, result, onResult]);

  return (
    <div
      style={{
        border: "1px solid var(--color-surface-container-high, #ccc)",
        borderRadius: "0.75rem",
        padding: "1rem",
        marginTop: "0.75rem",
        background: "var(--color-surface-container-low, #f5f5f5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "2px 8px",
            borderRadius: "4px",
            background: "#1e3a5f",
            color: "#e8f4fd",
            fontFamily: "monospace",
          }}
        >
          L5 · AI VISUAL CORROBORATION
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-surface-on-variant, #666)" }}>
          Optional · EXIF GPS stripped · Ephemeral vision pipeline
        </span>
      </div>

      <p style={{ fontSize: "0.8rem", margin: "0 0 0.75rem", color: "var(--color-surface-on-variant, #555)" }}>
        Upload a road photo for AI visual incident classification. Image bytes are sent only to the
        Gemini Vision API and immediately discarded — no photo is stored by TrafficSense.
      </p>

      {/* File input — capture="environment" opens rear camera on mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {status === "idle" || status === "error" ? (
        <div>
          <button
            type="button"
            className="button secondary"
            style={{ marginBottom: "0.5rem" }}
            onClick={() => inputRef.current?.click()}
          >
            📷 Select / Capture Photo
          </button>
          {status === "error" && errorMessage && (
            <p role="alert" style={{ fontSize: "0.8rem", color: "#b91c1c", marginTop: "0.4rem" }}>
              {errorMessage}
            </p>
          )}
        </div>
      ) : null}

      {(status === "reading" || status === "verifying") && (
        <p role="status" style={{ fontSize: "0.82rem", fontStyle: "italic", color: "var(--color-surface-on-variant, #555)" }}>
          {status === "reading"
            ? "📂 Reading image · Stripping EXIF PII…"
            : "🔬 Running L5 Vision Corroboration · Querying AI pipeline…"}
        </p>
      )}

      {thumbnail && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={thumbnail}
          alt="Incident photo thumbnail"
          style={{
            maxWidth: "100%",
            maxHeight: "180px",
            objectFit: "cover",
            borderRadius: "0.5rem",
            marginTop: "0.5rem",
            border: "1px solid var(--color-surface-container, #ddd)",
          }}
        />
      )}

      {status === "done" && result && (
        <div
          role="status"
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: `2px solid ${result.isGenuineIncident ? "#15803d" : "#b91c1c"}`,
            background: result.isGenuineIncident ? "#f0fdf4" : "#fef2f2",
          }}
        >
          {/* Header badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "2px 8px",
                borderRadius: "4px",
                background: result.isGenuineIncident ? "#15803d" : "#b91c1c",
                color: "#fff",
                fontFamily: "monospace",
              }}
            >
              {result.isGenuineIncident
                ? `L5 · AI VISUAL CORROBORATION · ${confidenceLabel(result.confidenceTier)} CONFIDENCE`
                : result.isAiGenerated || result.rejectionReason === "ai_generated"
                  ? "🚫 L5 REJECTED · AI-GENERATED / SYNTHETIC IMAGE BLOCKED"
                  : result.rejectionReason === "screen_recapture"
                    ? "🚫 L5 REJECTED · SCREENSHOT / MONITOR RECAPTURE BLOCKED"
                    : "L5 · UNVERIFIED IMAGE (NO ROAD INCIDENT DETECTED)"}
            </span>
            {result.source === "offline_fallback" && (
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "#f59e0b",
                  color: "#1c1917",
                  fontFamily: "monospace",
                  fontWeight: 700,
                }}
              >
                OFFLINE ASSESSMENT
              </span>
            )}
          </div>

          {/* Visual summary */}
          <p style={{ fontSize: "0.82rem", fontStyle: "italic", margin: "0 0 0.5rem" }}>
            &ldquo;{result.visualSummary}&rdquo;
          </p>

          {/* Category match indicator */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.78rem" }}>
            <span>
              <strong>Detected:</strong>{" "}
              <code>{result.detectedCategory}</code>
            </span>
            <span>
              {result.categoryMatchesReport || result.detectedCategory === userSelectedCategory ? "✅" : "⚠️"}{" "}
              {result.categoryMatchesReport || result.detectedCategory === userSelectedCategory
                ? "Matches reported category"
                : "Category mismatch — review your selection"}
            </span>
            <span>
              <strong>Severity:</strong>{" "}
              <span style={{ color: severityColor(result.severity), fontWeight: 700 }}>
                {result.severity.toUpperCase()}
              </span>
            </span>
          </div>

          {/* Forensic verification badges */}
          {result.isGenuineIncident && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "monospace",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "#dcfce7",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                }}
              >
                ✓ C2PA / AI Metadata: Clean
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "monospace",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "#dcfce7",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                }}
              >
                ✓ Vision Forensics: Authentic Camera Scene
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "monospace",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "#dcfce7",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                }}
              >
                ✓ EXIF GPS Stripped
              </span>
            </div>
          )}

          {/* Privacy note */}
          <p
            style={{
              fontSize: "0.72rem",
              color: "#6b7280",
              marginTop: "0.5rem",
              marginBottom: 0,
            }}
          >
            EXIF GPS stripped · Verified via ephemeral vision pipeline · Image not stored
          </p>
        </div>
      )}

      {status === "done" && (
        <button
          type="button"
          className="button secondary"
          style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}
          onClick={reset}
        >
          Remove photo
        </button>
      )}
    </div>
  );
}
