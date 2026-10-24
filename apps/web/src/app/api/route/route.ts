import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { queryRoute, reportAssessmentRouteIncidents, type VerifiedIncident } from "@/lib/routing/engine";
import { readTrafficSnapshot } from "@/lib/traffic/server";
import { getActiveLiveIncidents } from "@/lib/incidents/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { start, destination } = body;

    if (
      !Array.isArray(start) ||
      start.length !== 2 ||
      typeof start[0] !== "number" ||
      typeof start[1] !== "number" ||
      !Array.isArray(destination) ||
      destination.length !== 2 ||
      typeof destination[0] !== "number" ||
      typeof destination[1] !== "number"
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid start or destination coordinates. Expected [lng, lat]." },
        { status: 400 }
      );
    }

    // Collect verified incidents to test for route avoidance
    const incidents: VerifiedIncident[] = [];

    // 1. Fetch live reported incidents from Supabase
    try {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        const client = createClient(url, key, { auth: { persistSession: false } });
        const liveIncidents = await getActiveLiveIncidents(client);
        for (const inc of liveIncidents) {
          incidents.push({
            id: inc.id,
            category: inc.category,
            level: inc.level,
            point: [inc.lng, inc.lat],
            label: `${inc.category.replace(/_/g, " ")} (${inc.level})`,
          });
        }
      }
    } catch {
      // Continue if Supabase client not reachable
    }
    try {
      const snapshotResult = await readTrafficSnapshot();
      if (snapshotResult.status === "ready") {
        incidents.push(...reportAssessmentRouteIncidents(snapshotResult.snapshot));
        for (const inc of snapshotResult.incidents) {
          if (inc.is_current && (inc.state === "supported" || inc.state === "unconfirmed")) {
            const seg = snapshotResult.snapshot.fixture?.segments.find(
              (s) => s.id === inc.segment_id && s.direction === inc.direction
            );
            if (seg && seg.geometry && seg.geometry.coordinates && seg.geometry.coordinates.length > 0) {
              const coords = seg.geometry.coordinates;
              const midCoord = coords[Math.floor(coords.length / 2)];
              incidents.push({
                id: inc.id,
                category: "traffic_slowdown",
                level: inc.supporting_source_count >= 3 ? "L3" : "L1",
                point: [midCoord[0], midCoord[1]],
                label: `${seg.name} (${inc.state})`,
              });
            }
          }
        }
      }
    } catch {
      // Snapshot reader is optional for routing — continue if snapshot unavailable
    }

    const routeResult = await queryRoute(
      [start[0], start[1]],
      [destination[0], destination[1]],
      incidents,
      fetch,
      true
    );

    const status = routeResult.ok ? 200 : routeResult.error?.startsWith("Routing unavailable") ? 503 : 400;
    return NextResponse.json(routeResult, { status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startStr = searchParams.get("start");
  const destStr = searchParams.get("destination") || searchParams.get("end");

  if (!startStr || !destStr) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required query parameters: 'start' and 'destination' (format: lng,lat).",
      },
      { status: 400 }
    );
  }

  const startParts = startStr.split(",").map(Number);
  const destParts = destStr.split(",").map(Number);

  if (
    startParts.length !== 2 ||
    isNaN(startParts[0]) ||
    isNaN(startParts[1]) ||
    destParts.length !== 2 ||
    isNaN(destParts[0]) ||
    isNaN(destParts[1])
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid coordinate format. Expected lng,lat (e.g. 74.8426,12.8698).",
      },
      { status: 400 }
    );
  }

  return POST(
    new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: startParts, destination: destParts }),
    }) as NextRequest
  );
}
