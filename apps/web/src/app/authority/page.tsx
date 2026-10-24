import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { AuthorityDashboard } from "@/components/analytics/authority-dashboard";

export default async function AuthorityPage() {
  await requireRole("authority");

  return (
    <div data-fullscreen="true" className="w-full flex-1 flex flex-col px-4 sm:px-8 py-6 space-y-6 max-w-[1920px] mx-auto">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-container pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
              Civic Operations &amp; Intelligence
            </span>
            <span className="simulated-pill">CIVIC AUTHORITY</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-surface-on tracking-tight">
            Mangaluru Corridor Hotspot Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-surface-on-variant mt-1">
            Real-time decision support, arterial corridor congestion rankings, and citizen incident verification console.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link className="button secondary text-xs px-3.5 py-2" href="/workspace">
            ← My Account
          </Link>
          <Link className="button text-xs px-3.5 py-2" href="/traffic">
            Live Traffic Map ↗
          </Link>
        </div>
      </div>

      {/* Main Executive Dashboard (KPIs, OpenStreetMap Hotspot Map, Rankings, Review Queue, Heatmap, and Audit Log) */}
      <AuthorityDashboard />

      {/* Methodology notice at bottom */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs space-y-1">
        <p className="font-semibold text-surface-on">Methodology &amp; Purpose</p>
        <p className="text-surface-on-variant">
          Delay metrics reflect aggregated commuter excess travel time across synthetic observation windows. Outputs suggest areas for investigation and traffic light timing reviews; they do not represent confirmed accident causes or capital project mandates.
        </p>
      </div>

      <div className="pt-2 flex items-center justify-between text-xs text-surface-on-variant border-t border-surface-container">
        <Link className="text-primary hover:underline" href="/workspace">
          ← Return to account workspace
        </Link>
        <span className="font-mono">Mangaluru Smart Mobility Civic Console</span>
      </div>
    </div>
  );
}
