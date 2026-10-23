import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthForm } from "./auth-form";
import { authConfig } from "@/lib/auth/config";
import { getViewer } from "@/lib/auth/server";

export async function AuthScreen({ mode, revocationUnconfirmed = false }: { mode: "login" | "register"; revocationUnconfirmed?: boolean }) {
  await connection();
  const registration = mode === "register";
  if (!authConfig()) return (
    <section className="panel narrow">
      <p className="eyebrow">Setup required</p>
      <h1>Authentication is not configured</h1>
      <p>Configure the local Supabase connection using the development instructions, then restart the app. Sign-in is unavailable until setup is complete.</p>
      <div className="actions">
        <Link className="button secondary" href="/demo">Continue as guest</Link>
        <Link href="/">Return home</Link>
      </div>
    </section>
  );
  if (await getViewer()) redirect("/workspace");
  return (
    <section className="panel narrow">
      <div className="panel-heading">
        <p className="eyebrow m-0">Account access</p>
        <span className="simulated-pill">DEMO AUTH</span>
      </div>
      <h1>{registration ? "Create your account" : "Welcome back"}</h1>
      <p>{registration ? "Start with commuter access. Employer and authority permissions are assigned separately on the server." : "Sign in to view the access assigned to your account."}</p>
      {process.env.DEMO_MODE === "true" && <p className="notice">Local demo: use synthetic details only. Email confirmation is disabled for local testing. No location or journey data is collected.</p>}
      {!registration && revocationUnconfirmed && <p className="notice" role="status">This browser is signed out. Server-side session revocation was not confirmed; previously copied tokens may still be usable.</p>}
      <div className="mb-4">
        <Link className="button secondary w-full" href="/demo">Continue as guest</Link>
      </div>
      <AuthForm mode={mode} />
      <p className="form-footer">{registration ? "Already have an account? " : "New here? "}<Link href={registration ? "/login" : "/register"}>{registration ? "Sign in" : "Create a commuter account"}</Link></p>
    </section>
  );
}
