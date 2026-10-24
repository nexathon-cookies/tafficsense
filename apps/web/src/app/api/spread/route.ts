import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getActiveLiveIncidents } from "@/lib/incidents/server";
import { checkSpread } from "@/lib/routing/spread";
import { MANGALURU_PRESETS } from "@/lib/routing/presets";
import type { VerifiedIncident } from "@/lib/routing/engine";
import { authConfig, authCookieOptions, authFetch } from "@/lib/auth/config";
import { createAuthClient } from "@/lib/auth/server";

async function getSupabase(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const config = authConfig();
    if (!config) throw new Error("Authentication is not configured.");
    return createServerClient(config.url, config.key, {
      cookieOptions: authCookieOptions,
      global: {
        headers: { Authorization: authorization },
        fetch: authFetch,
      },
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    });
  }
  return createAuthClient(false);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const incidentId = searchParams.get("incident");
    const originParam = searchParams.get("origin") ?? "Pumpwell (Mahaveera) Circle";

    if (!incidentId) {
      return NextResponse.json(
        { ok: false, error: "Missing required query parameter: incident" },
        { status: 400 }
      );
    }

    // Resolve origin preset
    const originPreset = MANGALURU_PRESETS.find(
      (p) =>
        p.name.toLowerCase() === originParam.toLowerCase() ||
        p.name.toLowerCase().includes(originParam.toLowerCase())
    );

    if (!originPreset) {
      return NextResponse.json(
        { ok: false, error: `Unknown origin preset: ${originParam}` },
        { status: 400 }
      );
    }

    // Destinations are the other presets
    const destinations = MANGALURU_PRESETS.filter((p) => p.name !== originPreset.name);

    // Fetch live reported incidents from Supabase (no simulated data read)
    const supabase = await getSupabase(req);
    const liveIncidents = await getActiveLiveIncidents(supabase);

    const liveMatch = liveIncidents.find((inc) => inc.id === incidentId);
    if (!liveMatch) {
      return NextResponse.json(
        { ok: false, error: `Incident not found: ${incidentId}` },
        { status: 404 }
      );
    }

    if (liveMatch.level !== "L3" && liveMatch.level !== "L5" && liveMatch.level !== "L6") {
      return NextResponse.json(
        {
          ok: false,
          error: `Spread check only supports verified L3 or L6 incidents. Current level: ${liveMatch.level}`,
        },
        { status: 400 }
      );
    }

    const verifiedIncident: VerifiedIncident = {
      id: liveMatch.id,
      category: liveMatch.category,
      level: liveMatch.level,
      point: [liveMatch.lng, liveMatch.lat],
      label: `${liveMatch.category.replace(/_/g, " ")} (${liveMatch.level})`,
    };

    const spreadResult = await checkSpread(originPreset, destinations, verifiedIncident);

    return NextResponse.json({ ok: true, ...spreadResult });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to calculate spread";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
