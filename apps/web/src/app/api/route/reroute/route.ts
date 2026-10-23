import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateDetourRoute, type RerouteBlockedIncident } from "@/lib/routing/reroute";
import { reportAssessmentRouteIncidents, type VerifiedIncident } from "@/lib/routing/engine";
import { readTrafficSnapshot } from "@/lib/traffic/server";
import { getActiveLiveIncidents } from "@/lib/incidents/server";
import { isWithinMangaluruBounds } from "@/lib/routing/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      currentLocation,
      destination,
      blockedIncidentId,
      blockedIncident: directBlockedIncident,
      exclusionRadiusM = 200,
    } = body;

    if (
      !Array.isArray(currentLocation) ||
      currentLocation.length !== 2 ||
      typeof currentLocation[0] !== "number" ||
      typeof currentLocation[1] !== "number" ||
      !Array.isArray(destination) ||
      destination.length !== 2 ||
      typeof destination[0] !== "number" ||
      typeof destination[1] !== "number"
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid currentLocation or destination coordinates. Expected [lng, lat]." },
        { status: 400 }
      );
    }

    const startCoord: [number, number] = [currentLocation[0], currentLocation[1]];
    const destCoord: [number, number] = [destination[0], destination[1]];

    if (!isWithinMangaluruBounds(startCoord) || !isWithinMangaluruBounds(destCoord)) {
      return NextResponse.json(
        { ok: false, error: "Coordinates are outside the supported Mangaluru service area." },
        { status: 400 }
      );
    }

    // Collect all active verified incidents from Supabase & snapshot
    const activeIncidents: VerifiedIncident[] = [];
    try {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        const client = createClient(url, key, { auth: { persistSession: false } });
        const liveIncidents = await getActiveLiveIncidents(client);
        for (const inc of liveIncidents) {
          activeIncidents.push({
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
        activeIncidents.push(...reportAssessmentRouteIncidents(snapshotResult.snapshot));
        for (const inc of snapshotResult.incidents) {
          if (inc.is_current && (inc.state === "supported" || inc.state === "unconfirmed")) {
            const seg = snapshotResult.snapshot.fixture?.segments.find(
              (s) => s.id === inc.segment_id && s.direction === inc.direction
            );
            if (seg && seg.geometry && seg.geometry.coordinates && seg.geometry.coordinates.length > 0) {
              const coords = seg.geometry.coordinates;
              const midCoord = coords[Math.floor(coords.length / 2)];
              activeIncidents.push({
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
      // Snapshot is optional
    }

    // Determine target incident to avoid
    let targetBlocked: RerouteBlockedIncident | null = null;
    if (directBlockedIncident && Array.isArray(directBlockedIncident.point)) {
      targetBlocked = directBlockedIncident;
    } else if (blockedIncidentId) {
      const found = activeIncidents.find((i) => i.id === blockedIncidentId);
      if (found) {
        targetBlocked = {
          id: found.id,
          point: found.point,
          category: found.category,
          level: found.level,
          label: found.label,
        };
      }
    }

    if (!targetBlocked) {
      return NextResponse.json(
        { ok: false, error: "Blocked incident to avoid was not found or has expired." },
        { status: 400 }
      );
    }

    const otherIncidents = activeIncidents.filter((i) => i.id !== targetBlocked.id);

    const result = await calculateDetourRoute({
      currentLocation: startCoord,
      destination: destCoord,
      blockedIncident: targetBlocked,
      otherIncidents,
      exclusionRadiusM: typeof exclusionRadiusM === "number" ? exclusionRadiusM : 250,
    });

    const status = result.ok ? 200 : result.error.includes("unavailable") ? 503 : 400;
    return NextResponse.json(result, { status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
