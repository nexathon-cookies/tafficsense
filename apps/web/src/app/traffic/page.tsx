import type { Metadata } from "next";
import Link from "next/link";
import { readTrafficSnapshot } from "@/lib/traffic/server";
import { TrafficExplorer } from "@/components/traffic/traffic-explorer";
import { RefreshTraffic } from "@/components/traffic/refresh-traffic";

export const metadata: Metadata = {
  title: "Synthetic traffic corridor · TrafficSense Mangaluru",
  description: "Explore labelled synthetic road segments and observations, with an optional background map. Not live traffic or navigation guidance.",
};

export default async function TrafficPage() {
  const result = await readTrafficSnapshot();
  return (
    <section>
      <p className="simulated-pill">SIMULATED · Public traffic data</p>
      <h1>Synthetic traffic corridor</h1>
      <p className="intro">Explore the Mangaluru demonstration without signing in. No device location is requested and no journey is started.</p>
      {result.status === "ready" ? <TrafficExplorer snapshot={result.snapshot} slowdownAssessments={result.slowdown_assessments} incidents={result.incidents} traversals={result.traversals} routeComparison={result.route_comparison} routeAlerts={result.route_alerts} /> : (
        <div className="panel" role="status">
          <h2>{result.status === "unconfigured" ? "Traffic data is not configured" : "Traffic data is unavailable"}</h2>
          <p>{result.status === "invalid" ? "The stored demonstration could not be validated. No partial traffic data is displayed."
            : result.status === "denied" ? "Public data access was denied. This is a configuration problem; signing in is not required."
            : "The public demonstration cannot be read right now. You can retry or continue browsing the guest introduction."}</p>
          <RefreshTraffic />
        </div>
      )}
      <div className="actions section-space">
        <Link href="/demo">Guest introduction</Link>
        <Link href="/">Return home</Link>
        <Link href="/login">Sign in — optional</Link>
      </div>
    </section>
  );
}
