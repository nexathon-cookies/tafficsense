import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getEmployerSharedJourneys } from "@/lib/journeys/server";

export default async function OrganisationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { supabase } = await requireRole("employer");
  const { orgId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) notFound();

  const { data: org, error } = await supabase.from("organisations").select("id,name").eq("id", orgId).maybeSingle();
  if (error) throw new Error("Organisation access is unavailable.");
  if (!org) notFound();

  const sharedJourneys = await getEmployerSharedJourneys(supabase, orgId);

  return (
    <section className="panel space-y-6">
      <div className="panel-heading">
        <p className="eyebrow m-0">Organisation Dashboard</p>
        <span className="simulated-pill">SIMULATED</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <p className="text-sm text-surface-on-variant mt-1">
          Active commuter journeys shared with this organisation under employee consent.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container text-xs space-y-1">
        <p className="font-semibold text-surface-on">Privacy &amp; Data Safeguards</p>
        <p className="text-surface-on-variant">
          Employees must explicitly consent to share each journey. Only corridor and current status summaries are disclosed; delay is not measured in this build. Exact GPS coordinates, home addresses, device identities, and historical trip routes are never recorded or provided.
        </p>
        <p className="text-surface-on-variant">
          If an employee stops sharing or completes their commute, subsequent refreshes immediately remove the entry.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Consented Employee Journeys ({sharedJourneys.length})</h2>
          <span className="text-xs text-surface-on-variant">Refresh page to sync latest updates</span>
        </div>

        {sharedJourneys.length === 0 ? (
          <div className="p-6 rounded-xl bg-surface-container-lowest border border-dashed border-surface-container text-center space-y-1">
            <p className="text-sm font-semibold text-surface-on">No active shared journeys</p>
            <p className="text-xs text-surface-on-variant">
              No employees have currently shared active commute delays with this organisation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sharedJourneys.map((j) => (
              <div
                key={j.journey_id}
                className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">
                      CONSENTED SHARE
                    </span>
                    <span className="text-xs font-mono text-surface-on-variant">
                      Ref: {j.journey_id.slice(0, 8)}...
                    </span>
                  </div>
                    <span className="text-xs font-mono text-surface-on-variant">
                      Sharing started {new Date(j.shared_at).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-surface-on-variant block">Corridor</span>
                    <span className="font-semibold text-surface-on">{j.corridor_name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-surface-on-variant block">Delay measurement</span>
                    <span className="font-semibold text-surface-on">{j.status.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-xs text-surface-on-variant block">Journey evidence</span>
                    <span className="font-semibold text-surface-on">Not collected</span>
                  </div>
                </div>

                <div className="text-[11px] text-surface-on-variant border-t border-surface-container-high pt-2 flex items-center justify-between">
                  <span>Coordinates and route history are not shared</span>
                  <span>Consent is active</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-surface-container-high">
        <Link className="button" href="/employer">
          ← Back to your organisations
        </Link>
      </div>
    </section>
  );
}
