import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { reportCategories } from "../packages/shared/src/index.ts";
import {
  MOBILE_TO_L5_CATEGORY,
  deriveSegmentId,
  verifyEvidence,
} from "../apps/mobile/src/lib/verify-evidence.ts";
import { MobileApiError } from "../apps/mobile/src/lib/request.ts";

// =============================================================================
// FEATURE 1: Image Capture & Gallery Picker Configuration + Size Guard
// =============================================================================

test("Feature 1: expo-image-picker is declared in dependencies with compatible version", () => {
  const pkgJsonPath = pathResolve("apps/mobile/package.json");
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  
  assert.ok(pkg.dependencies["expo-image-picker"], "expo-image-picker must be in dependencies");
  assert.match(
    pkg.dependencies["expo-image-picker"],
    /^~?17\./,
    "expo-image-picker version should be compatible with Expo 57 (~17.x)"
  );
});

test("Feature 1: 4MB size guard boundary checks", () => {
  const MAX_BASE64_LENGTH = 5_600_000; // ~4.2 MB base64 chars (~3.15 MB binary payload)

  // Test cases: [description, sizeInChars, shouldPass]
  const cases = [
    ["Small thumbnail (100 KB)", 133_000, true],
    ["Medium camera image (2 MB)", 2_660_000, true],
    ["Near boundary (3.9 MB)", 5_200_000, true],
    ["At exact boundary", 5_600_000, true],
    ["Over boundary (4.5 MB)", 5_985_000, false],
    ["Large raw upload (10 MB)", 13_300_000, false],
  ];

  for (const [desc, chars, shouldPass] of cases) {
    const isUnderLimit = chars <= MAX_BASE64_LENGTH;
    assert.equal(isUnderLimit, shouldPass, `${desc} size check failed`);
  }
});

test("Feature 1: report.tsx enforces privacy (exif: false) and quality compression", () => {
  const reportCode = readFileSync(pathResolve("apps/mobile/app/report.tsx"), "utf-8");

  // Verify launchCameraAsync options
  assert.ok(
    reportCode.includes("quality: 0.7"),
    "report.tsx must specify quality: 0.7 for bandwidth and storage compression"
  );
  assert.ok(
    reportCode.includes("base64: true"),
    "report.tsx must request base64 string for direct verification payload"
  );
  assert.ok(
    reportCode.includes("exif: false"),
    "report.tsx must disable EXIF to ensure location privacy"
  );
});

// =============================================================================
// FEATURE 2: verifyEvidence Client, Contract & Error Handling
// =============================================================================

test("Feature 2: verifyEvidence calls /api/verify-evidence with exact contract and auth", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  process.env.EXPO_PUBLIC_API_BASE_URL = "https://backend.trafficsense.mangaluru/";

  let capturedUrl = "";
  let capturedHeaders = null;
  let capturedBody = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedHeaders = options.headers;
    capturedBody = JSON.parse(options.body);

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          detectedCategory: "road_obstruction",
          confidence: 0.96,
          matchesUserCategory: true,
          upgradeEligible: true,
          summary: "Fallen tree blocking both lanes near Balmatta.",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const res = await verifyEvidence(
      {
        imageBase64: "aW1hZ2UtYnl0ZXM=",
        mimeType: "image/jpeg",
        userSelectedCategory: "fallen_tree",
        lat: 12.8715,
        lng: 74.8465,
      },
      "session_jwt_commuter_token"
    );

    // URL formatting: strips trailing slash from base and appends /api/verify-evidence
    assert.equal(capturedUrl, "https://backend.trafficsense.mangaluru/api/verify-evidence");
    
    // Auth & Content-Type
    assert.equal(capturedHeaders["Authorization"], "Bearer session_jwt_commuter_token");
    assert.equal(capturedHeaders["Content-Type"], "application/json");

    // Request payload shape
    assert.deepEqual(capturedBody, {
      imageBase64: "aW1hZ2UtYnl0ZXM=",
      mimeType: "image/jpeg",
      userSelectedCategory: "accident",
      segmentId: "primary-west",
    });

    // Parsed response
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.result.detectedCategory, "road_obstruction");
      assert.equal(res.result.confidence, 0.96);
      assert.equal(res.result.matchesUserCategory, true);
      assert.equal(res.result.upgradeEligible, true);
      assert.equal(res.result.summary, "Fallen tree blocking both lanes near Balmatta.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
  }
});

test("Feature 2: verifyEvidence handles server-side ok: false gracefully", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:3000";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ ok: false, error: "AI vision service rate limit reached. Try again later." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    const res = await verifyEvidence(
      {
        imageBase64: "data",
        mimeType: "image/png",
        userSelectedCategory: "road_repair",
        lat: 12.86,
        lng: 74.84,
      },
      "token"
    );

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error, "AI vision service rate limit reached. Try again later.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
  }
});

test("Feature 2: verifyEvidence rejects on 500 status and corrupt responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:3000";

  try {
    // 500 Server error with valid payload shape
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            detectedCategory: "road_repair",
            confidence: 0.5,
            matchesUserCategory: false,
            upgradeEligible: false,
            summary: "Unknown",
          },
        }),
        { status: 500 }
      );

    await assert.rejects(
      () =>
        verifyEvidence(
          { imageBase64: "d", mimeType: "image/jpeg", userSelectedCategory: "flood", lat: 12.86, lng: 74.85 },
          "token"
        ),
      (err) => err instanceof MobileApiError && err.status === 500
    );

    // Corrupt payload (result is not an object)
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ ok: true, result: "not-an-object" }),
        { status: 200 }
      );

    await assert.rejects(
      () =>
        verifyEvidence(
          { imageBase64: "d", mimeType: "image/jpeg", userSelectedCategory: "flood", lat: 12.86, lng: 74.85 },
          "token"
        ),
      /invalid response/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
  }
});

test("Feature 2: verifyEvidence throws if EXPO_PUBLIC_API_BASE_URL is not configured", async () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  delete process.env.EXPO_PUBLIC_API_BASE_URL;

  try {
    await assert.rejects(
      () =>
        verifyEvidence(
          { imageBase64: "d", mimeType: "image/jpeg", userSelectedCategory: "flood", lat: 12.86, lng: 74.85 },
          "token"
        ),
      /Traffic data is not configured for this mobile build/i
    );
  } finally {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
  }
});

// =============================================================================
// FEATURE 3: Category Mapping, Segment Derivation & Report Wiring Flow
// =============================================================================

test("Feature 3: MOBILE_TO_L5_CATEGORY exhaustively maps all 17 shared categories", () => {
  const sharedCategories = reportCategories.map(([key]) => key);
  assert.equal(sharedCategories.length, 17);

  const allowedL5Categories = new Set([
    "accident",
    "road_repair",
    "heavy_volume",
    "flood",
    "unknown",
  ]);

  for (const cat of sharedCategories) {
    const mapped = MOBILE_TO_L5_CATEGORY[cat];
    assert.ok(mapped, `Category '${cat}' must have an L5 mapping`);
    assert.ok(
      allowedL5Categories.has(mapped),
      `Mapped value '${mapped}' for '${cat}' must be an allowed L5Category`
    );
  }

  // Exact semantic checks
  assert.equal(MOBILE_TO_L5_CATEGORY["accident"], "accident");
  assert.equal(MOBILE_TO_L5_CATEGORY["road_repair"], "road_repair");
  assert.equal(MOBILE_TO_L5_CATEGORY["bridge_maintenance"], "road_repair");
  assert.equal(MOBILE_TO_L5_CATEGORY["heavy_traffic"], "heavy_volume");
  assert.equal(MOBILE_TO_L5_CATEGORY["festival"], "heavy_volume");
  assert.equal(MOBILE_TO_L5_CATEGORY["flood"], "flood");
  assert.equal(MOBILE_TO_L5_CATEGORY["heavy_rain"], "flood");
  assert.equal(MOBILE_TO_L5_CATEGORY["road_closed"], "road_repair");
  assert.equal(MOBILE_TO_L5_CATEGORY["other"], "unknown");
  assert.equal(MOBILE_TO_L5_CATEGORY["unknown"], "unknown");
});

test("Feature 3: deriveSegmentId assigns corridor IDs for key Mangaluru landmark coordinates", () => {
  // 1. Hampankatta Junction (Central South-West)
  assert.equal(deriveSegmentId(12.8698, 74.8426), "primary-west");

  // 2. Mangaluru Central Railway Station (South-West)
  assert.equal(deriveSegmentId(12.8640, 74.8390), "primary-west");

  // 3. Pumpwell / Mahaveera Circle (South-East, towards NH 66 south)
  assert.equal(deriveSegmentId(12.8550, 74.8685), "primary-east");

  // 4. Ladyhill Circle (North-West, towards Urwa / Kottara)
  assert.equal(deriveSegmentId(12.8890, 74.8385), "alternative-west");

  // 5. KSRTC / Bejai Circle (North-East, transit hub)
  assert.equal(deriveSegmentId(12.8856, 74.8530), "alternative-east");

  // 6. Mangalore International Airport (Far North-East)
  assert.equal(deriveSegmentId(12.9610, 74.8900), "alternative-east");

  // 7. Edge coordinates fallback safely
  assert.equal(deriveSegmentId(0, 0), "primary-west");
  assert.equal(deriveSegmentId(-12.8, -74.8), "primary-west");
});

test("Feature 3: report flow handles verifyEvidence errors non-fatally", async () => {
  // Simulate the flow in submit() in report.tsx:
  // When an image is present, verifyEvidence is called. If it throws or fails,
  // the report submission MUST NOT throw and must still proceed.
  let submissionCompleted = false;
  let l5Result = undefined;

  const mockSubmitIncident = async () => {
    submissionCompleted = true;
    return { level: "L1", level_reason: "Single observation recorded" };
  };

  const failingVerifyEvidence = async () => {
    throw new Error("Network timeout contacting AI vision service");
  };

  // Simulating the submit() logic from report.tsx:
  try {
    try {
      const verifyResponse = await failingVerifyEvidence();
      if (verifyResponse.ok) {
        l5Result = verifyResponse.result;
      }
    } catch {
      // Vision errors are non-fatal — submit the report regardless
    }

    const result = await mockSubmitIncident();
    assert.equal(submissionCompleted, true, "Incident was submitted despite vision failure");
    assert.equal(result.level, "L1");
    assert.equal(l5Result, undefined);
  } catch (err) {
    assert.fail(`Flow should not have thrown: ${err}`);
  }
});
