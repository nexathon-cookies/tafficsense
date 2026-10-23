import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { getActiveLiveIncidents } from "@/lib/incidents/server";
import { reportCategories, reportCategoryIcons } from "@/lib/reports/rules";

export default async function AdminPage() {
  const { supabase } = await requireRole("admin");
  const incidents = await getActiveLiveIncidents(supabase);
  const pendingVerification = incidents.filter((i) => i.level !== "L6");

  return (
    <section className="panel space-y-6">
      <div className="panel-heading">
        <p className="eyebrow m-0">Admin Platform Oversight</p>
        <span className="simulated-pill">DEMO ADMIN</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">System Administration &amp; Verification Overview</h1>
        <p className="text-sm text-surface-on-variant mt-1">
          Platform-level oversight of community reports, system roles, and civic verification queues.
        </p>
      </div>

      {/* Role Split Architecture Card */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs space-y-2">
        <p className="font-semibold text-surface-on">TrafficSense Role Architecture</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-2.5 rounded bg-surface-container border border-surface-container-high">
            <p className="font-bold text-surface-on">Commuter &amp; Employee</p>
            <p className="text-[11px] text-surface-on-variant mt-0.5">
              Everyday users reporting road hazards, planning routes, and tracking commutes. Employees belong to an organisation and share journey status.
            </p>
          </div>
          <div className="p-2.5 rounded bg-surface-container border border-surface-container-high">
            <p className="font-bold text-surface-on">Employer</p>
            <p className="text-[11px] text-surface-on-variant mt-0.5">
              Organisations viewing non-GPS corridor summary status explicitly shared by consenting employee members.
            </p>
          </div>
          <div className="p-2.5 rounded bg-surface-container border border-surface-container-high">
            <p className="font-bold text-surface-on">Traffic Authority</p>
            <p className="text-[11px] text-surface-on-variant mt-0.5">
              Civic authorities responsible for reviewing, corroborating, confirming (L6), resolving, or rejecting citizen reports.
            </p>
          </div>
          <div className="p-2.5 rounded bg-surface-container border border-surface-container-high">
            <p className="font-bold text-surface-on">Platform Admin</p>
            <p className="text-[11px] text-surface-on-variant mt-0.5">
              Supervises infrastructure, verifies server roles, and monitors active incident verification queues.
            </p>
          </div>
        </div>
      </div>

      {/* Incident Verification Overview */}
      <div className="p-5 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container pb-3">
          <div>
            <h2 className="text-base font-bold text-surface-on">Active Report Verification Queue</h2>
            <p className="text-xs text-surface-on-variant">
              Who verifies reports: <strong className="text-primary font-semibold">Civic Traffic Authority</strong> is authorized to evaluate and verify community reports into L6 confirmed decisions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {pendingVerification.length} Pending Authority Review
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              {incidents.length - pendingVerification.length} Authority Confirmed (L6)
            </span>
          </div>
        </div>

        {incidents.length === 0 ? (
          <p className="text-xs text-surface-on-variant italic p-4 rounded-lg bg-surface-container-low border border-dashed border-surface-container text-center">
            No active incident reports in the system.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-surface-container text-surface-on-variant font-semibold">
                  <th className="pb-2">Incident</th>
                  <th className="pb-2">Current Tier</th>
                  <th className="pb-2">Reports</th>
                  <th className="pb-2">Coordinates</th>
                  <th className="pb-2">Authority Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {incidents.map((incident) => {
                  const category = reportCategories[incident.category] ?? incident.category;
                  const isConfirmed = incident.level === "L6";
                  return (
                    <tr key={incident.id} className="text-surface-on">
                      <td className="py-2.5 font-medium flex items-center gap-1.5">
                        <span>{reportCategoryIcons[incident.category] ?? "⚠️"}</span>
                        <span>{category}</span>
                      </td>
                      <td className="py-2.5">
                        <span className="font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-[11px]">
                          {incident.level} · {incident.provenance}
                        </span>
                      </td>
                      <td className="py-2.5">{incident.report_count}</td>
                      <td className="py-2.5 font-mono text-[11px] text-surface-on-variant">
                        {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
                      </td>
                      <td className="py-2.5">
                        {isConfirmed ? (
                          <span className="inline-flex items-center text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            ✓ Authority Confirmed (L6)
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-semibold text-amber-700 dark:text-amber-300">
                            ⏳ Awaiting Authority Review
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between text-xs text-surface-on-variant border-t border-surface-container">
          <span>Verification decisions are executed exclusively by the Traffic Authority role.</span>
          <Link href="/authority" className="button secondary text-xs px-3 py-1">
            Open Authority Civic Portal →
          </Link>
        </div>
      </div>

      <div className="pt-4 border-t border-surface-container-high flex items-center justify-between">
        <Link className="button" href="/workspace">
          ← Back to your account
        </Link>
        <span className="text-xs text-surface-on-variant font-mono">TrafficSense Mangaluru</span>
      </div>
    </section>
  );
}
