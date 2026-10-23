import Link from "next/link";
import { requireViewer } from "@/lib/auth/server";
import { SignOut } from "@/components/sign-out";
import { JourneyManager } from "@/components/journeys/journey-manager";
import { getCommuterJourneys, getAvailableOrganisations } from "@/lib/journeys/server";

export default async function WorkspacePage({ searchParams }: { searchParams?: Promise<{ corridor?: string | string[] }> }) {
  const viewer = await requireViewer();
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialCorridor = typeof resolvedParams?.corridor === "string" ? resolvedParams.corridor.slice(0, 120) : undefined;

  const journeys = viewer.role === "commuter" ? await getCommuterJourneys(viewer.supabase) : [];
  const organisations = viewer.role === "commuter" ? await getAvailableOrganisations(viewer.supabase) : [];

  return (
    <section className="panel space-y-6">
      <div className="panel-heading">
        <p className="eyebrow m-0">Your account</p>
        <span className="simulated-pill">ROLE: {viewer.role.toUpperCase()}</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Account workspace</h1>
        <p className="account-email text-sm text-surface-on-variant mt-1">
          Signed in as <strong>{viewer.email}</strong>
        </p>
      </div>

      <dl className="facts grid grid-cols-2 gap-4 p-4 rounded-xl bg-surface-container-low border border-surface-container">
        <div>
          <dt className="text-xs text-surface-on-variant uppercase font-semibold">Assigned role</dt>
          <dd className="text-sm font-bold capitalize mt-0.5">{viewer.role}</dd>
        </div>
        <div>
          <dt className="text-xs text-surface-on-variant uppercase font-semibold">Location privacy</dt>
          <dd className="text-sm font-bold text-success mt-0.5">You control who sees your status</dd>
        </div>
      </dl>

      {process.env.DEMO_MODE === "true" && (
        <p className="notice text-xs p-3 rounded-lg bg-surface-container border border-surface-container-high">
          SIMULATED demo accounts. Authentication and access checks use the local Supabase service.
        </p>
      )}

      {viewer.role === "commuter" && (
        <div className="pt-2">
          <JourneyManager journeys={journeys} organisations={organisations} initialCorridor={initialCorridor} />
        </div>
      )}

      <div className="pt-4 border-t border-surface-container space-y-3">
        <h2 className="text-md font-bold">Go to</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="button" href="/planner">
            City Route Planner
          </Link>
          <Link className="button" href="/traffic">
            Public Traffic Map & Details
          </Link>
          <Link className="button" href="/report">
            Submit Incident Report
          </Link>
          {viewer.role === "employer" && (
            <Link className="button" href="/employer">
              View your organisations
            </Link>
          )}
          {viewer.role === "authority" && (
            <Link className="button" href="/authority">
              Open authority access
            </Link>
          )}
          {viewer.role === "admin" && (
            <Link className="button" href="/admin">
              Open admin access
            </Link>
          )}
        </div>
      </div>

      <div className="section-space pt-4 border-t border-surface-container">
        <SignOut />
      </div>
    </section>
  );
}
