import type { Metadata } from "next";
import Link from "next/link";
import { RoutePlanner } from "@/components/routing/route-planner";

export const metadata: Metadata = {
  title: "City Route Planner · TrafficSense Mangaluru",
  description:
    "Plan real driving routes between any points in Mangaluru with alternative paths and server-verified incident detours. Free-flow estimates.",
};

export default function PlannerPage() {
  return (
    <section className="space-y-6">
      <div className="panel-heading">
        <p className="eyebrow m-0">Dynamic Route Intelligence</p>
        <span className="simulated-pill">FREE-FLOW ESTIMATE</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Mangaluru Route Planner</h1>
        <p className="text-sm text-surface-on-variant mt-1">
          Select any origin and destination to calculate real driving paths, compare alternatives, and automatically detour around verified incidents.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs space-y-1">
        <p className="font-semibold text-surface-on">Routing Methodology &amp; Provenance</p>
        <p className="text-surface-on-variant">
          Routes and free-flow travel durations are calculated using OpenStreetMap road network geometry. When verified incidents (L3+) occur on a path, the system evaluates alternative corridors and suggests avoiding detours. Live speeds are not measured on unobserved roads.
        </p>
      </div>

      <RoutePlanner />

      <div className="pt-4 border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <Link className="text-primary hover:underline" href="/traffic">
            ← Fixed corridor demonstration
          </Link>
          <Link className="text-primary hover:underline font-semibold" href="/workspace">
            Commuter journeys &amp; employer shares →
          </Link>
          <Link className="text-surface-on-variant hover:underline" href="/demo">
            Guest overview
          </Link>
        </div>
        <span className="text-surface-on-variant font-mono">
          Mangaluru Smart Mobility · Hackathon Build
        </span>
      </div>
    </section>
  );
}
