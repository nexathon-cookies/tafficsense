import { NextResponse, type NextRequest } from "next/server";
import {
  verifyIncidentPhoto,
  L5_ACCEPTED_MIME_TYPES,
  type L5MimeType,
  type L5DetectedCategory,
} from "@/lib/vision/verify-incident-photo";

const VALID_CATEGORIES: L5DetectedCategory[] = [
  "accident",
  "road_repair",
  "heavy_volume",
  "flood",
  "unknown",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { imageBase64, mimeType, userSelectedCategory, segmentId } = body as Record<
      string,
      unknown
    >;

    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return NextResponse.json({ ok: false, error: "imageBase64 is required." }, { status: 400 });
    }
    if (!L5_ACCEPTED_MIME_TYPES.includes(mimeType as L5MimeType)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported image type. Use JPEG, PNG, or WebP." },
        { status: 400 },
      );
    }
    if (!VALID_CATEGORIES.includes(userSelectedCategory as L5DetectedCategory)) {
      return NextResponse.json(
        { ok: false, error: "Invalid userSelectedCategory." },
        { status: 400 },
      );
    }
    if (typeof segmentId !== "string" || segmentId.length === 0) {
      return NextResponse.json({ ok: false, error: "segmentId is required." }, { status: 400 });
    }

    const result = await verifyIncidentPhoto({
      imageBase64,
      mimeType: mimeType as L5MimeType,
      userSelectedCategory: userSelectedCategory as L5DetectedCategory,
      segmentId,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
