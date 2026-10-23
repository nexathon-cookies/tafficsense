import "server-only";
import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import type { TrafficSnapshot } from "./snapshot";
import type { PublicIncident, PublicTraversal } from "./phase4.ts";
import { parsePhase5Snapshot, type RouteComparison } from "../route-alerts/snapshot.ts";
import { deriveRouteAlerts, type RouteAlert } from "../route-alerts/rules.ts";
import { assessSlowdown, type SlowdownAssessment } from "../evidence/slowdown.ts";

export type TrafficSnapshotResult =
  | { status: "ready"; snapshot: TrafficSnapshot; slowdown_assessments: SlowdownAssessment[]; incidents: PublicIncident[]; traversals: PublicTraversal[];
    route_comparison: RouteComparison; route_alerts: RouteAlert[] }
  | { status: "unconfigured" | "unavailable" | "invalid" | "denied" };

const trafficFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  cache: "no-store",
  signal: init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
    : AbortSignal.timeout(8000),
});

export async function readTrafficSnapshot(): Promise<TrafficSnapshotResult> {
  await connection();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { status: "unconfigured" };
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: trafficFetch },
    });
    const { data, error, status } = await client.rpc("read_traffic_phase5");
    if (error) {
      return { status: error.code === "42501" || status === 401 || status === 403 ? "denied" : "unavailable" };
    }
    try {
      const parsed = parsePhase5Snapshot(data);
      const { traffic: snapshot, incidents, traversals } = parsed.phase4;
      return {
        status: "ready", snapshot, slowdown_assessments: assessSlowdown(snapshot), incidents, traversals,
        route_comparison: parsed.route_comparison, route_alerts: deriveRouteAlerts(parsed),
      };
    } catch {
      return { status: "invalid" };
    }
  } catch {
    return { status: "unavailable" };
  }
}
