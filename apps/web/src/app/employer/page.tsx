import Link from "next/link";
import { requireRole } from "@/lib/auth/server";

export default async function EmployerPage() {
  const { supabase } = await requireRole("employer");
  const { data, error } = await supabase.from("organisations").select("id,name").order("name");
  if (error) throw new Error("Organisation access is unavailable.");
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="eyebrow m-0">Employer access</p>
        <span className="simulated-pill">EMPLOYER DESK</span>
      </div>
      <h1>Your organisations</h1>
      <p>Only organisations linked to your account appear here. Employees appear in an organisation only after they explicitly share an active commute status; membership never grants location access.</p>
      {data.length ? (
        <ul className="organisation-list">
          {data.map((org) => (
            <li key={org.id}>
              <Link href={`/employer/${org.id}`}>
                <div className="organisation-summary">
                  <span>{org.name}</span>
                  <span className="text-xs font-mono text-primary font-bold">VIEW MEMBERSHIP →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice">No organisation memberships are assigned to this account.</p>
      )}
      <div className="pt-4 border-t border-surface-container-high">
        <Link href="/workspace">← Back to your account</Link>
      </div>
    </section>
  );
}
