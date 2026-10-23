import type { Metadata } from "next";
import { RoutePlanner } from "@/components/routing/route-planner";

export const metadata: Metadata = {
  title: "City Route Planner · TrafficSense Mangaluru",
  description:
    "Plan real driving routes between any points in Mangaluru with alternative paths and server-verified incident detours. Free-flow estimates.",
};

export default function PlannerPage() {
  return (
    <div data-fullscreen="true" className="relative w-full h-[calc(100vh-65px)] min-h-[500px] overflow-hidden flex flex-col">
      <RoutePlanner />
    </div>
  );
}
