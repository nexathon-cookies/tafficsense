import type { Metadata } from "next";
import Link from "next/link";
import { readTrafficSnapshot } from "@/lib/traffic/server";
import { TrafficExplorer } from "@/components/traffic/traffic-explorer";
import { RefreshTraffic } from "@/components/traffic/refresh-traffic";

export const metadata: Metadata = {
  title: "Live Traffic & Incidents · TrafficSense Mangaluru",
  description: "Explore live community-reported traffic incidents and verified road problems in Mangaluru on an interactive full-screen map.",
};

export default async function TrafficPage() {
  const result = await readTrafficSnapshot();
  return (
    <div data-fullscreen="true" className="relative w-full h-[calc(100vh-65px)] min-h-[500px] overflow-hidden flex flex-col">
      {result.status === "ready" ? (
        <TrafficExplorer
          snapshot={result.snapshot}
          slowdownAssessments={result.slowdown_assessments}
          incidents={result.incidents}
          traversals={result.traversals}
          routeComparison={result.route_comparison}
          routeAlerts={result.route_alerts}
        />
      ) : (
        <div className="p-6 max-w-xl mx-auto my-auto space-y-4 text-center">
          <div className="panel" role="status">
            <h2>{result.status === "unconfigured" ? "Traffic data is not configured" : "Traffic data is unavailable"}</h2>
            <p>
              {result.status === "invalid"
                ? "The stored demonstration could not be validated. No partial traffic data is displayed."
                : result.status === "denied"
                ? "Public data access was denied. This is a configuration problem; signing in is not required."
                : "The public demonstration cannot be read right now. You can retry or continue browsing the guest introduction."}
            </p>
            <RefreshTraffic />
          </div>
          <div className="actions flex items-center justify-center gap-3">
            <Link href="/demo">Guest introduction</Link>
            <Link href="/">Return home</Link>
            <Link href="/login">Sign in — optional</Link>
          </div>
        </div>
      )}
    </div>
  );
}
