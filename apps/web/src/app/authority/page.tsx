import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { AuthorityDashboard } from "@/components/analytics/authority-dashboard";
import { IncidentReviewPanel } from "@/components/analytics/incident-review-panel";

export default async function AuthorityPage() {
  await requireRole("authority");

  return (
    <section className="panel space-y-6">
      <div className="panel-heading">
        <p className="eyebrow m-0">Authority Civic Portal</p>
        <span className="simulated-pill">CIVIC AUTHORITY</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Traffic Analytics &amp; Hotspots</h1>
        <p className="text-sm text-surface-on-variant mt-1">
          Historical incident summaries and congestion hotspot rankings across Mangaluru arterial corridors.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs space-y-1">
        <p className="font-semibold text-surface-on">Methodology &amp; Purpose</p>
        <p className="text-surface-on-variant">
          Delay metrics reflect aggregated commuter excess travel time across synthetic observation windows. Outputs suggest areas for investigation and traffic light timing reviews; they do not represent confirmed accident causes or capital project mandates.
        </p>
      </div>

      <AuthorityDashboard />

      <IncidentReviewPanel />

      <div className="pt-4 border-t border-surface-container-high flex items-center justify-between">
        <Link className="button" href="/workspace">
          ← Back to your account
        </Link>
        <span className="text-xs text-surface-on-variant font-mono">Mangaluru Smart Mobility Demo</span>
      </div>
    </section>
  );
}
