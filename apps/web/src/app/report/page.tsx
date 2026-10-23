import type { Metadata } from "next";
import Link from "next/link";
import { WebReportScreen } from "@/components/reports/web-report-screen";
import { getViewer } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Report Traffic Incident · TrafficSense Mangaluru",
  description: "Report road hazards, accidents, flooding, and traffic obstacles. Dispatched to the Civic Traffic Authority dashboard for verification.",
};

export default async function ReportPage() {
  const viewer = await getViewer();
  return (
    <section className="panel space-y-6">
      <div className="panel-heading">
        <p className="eyebrow m-0">Citizen Hazard Reporting</p>
        <span className="simulated-pill">COMMUNITY EVIDENCE</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Report a Road Problem</h1>
        <p className="text-sm text-surface-on-variant mt-1">
          Submit observed road hazards and obstacles in Mangaluru. All reports are immediately queued for verification by the Civic Traffic Authority.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs space-y-1">
        <p className="font-semibold text-surface-on">Report &amp; Verification Workflow</p>
        <p className="text-surface-on-variant">
          Your report is recorded under your authenticated session and positioned on the OpenStreetMap road network. The Civic Traffic Authority reviews incoming incidents in their civic portal to verify and assign official L6 confirmation.
        </p>
      </div>

      <WebReportScreen viewer={viewer ? { email: viewer.email ?? "", role: viewer.role } : null} />

      <div className="pt-4 border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <Link className="text-primary hover:underline" href="/traffic">
            ← Live traffic map
          </Link>
          <Link className="text-primary hover:underline font-semibold" href="/planner">
            Route planner →
          </Link>
          <Link className="text-surface-on-variant hover:underline" href="/authority">
            Authority civic review
          </Link>
        </div>
        <span className="text-surface-on-variant font-mono">
          TrafficSense Mangaluru · OpenStreetMap SDK
        </span>
      </div>
    </section>
  );
}
