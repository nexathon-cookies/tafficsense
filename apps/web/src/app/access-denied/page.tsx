import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <section className="panel narrow">
      <div className="panel-heading">
        <p className="eyebrow m-0">Access restricted</p>
        <span className="simulated-pill">RESTRICTED</span>
      </div>
      <h1>This page is not available to your account</h1>
      <p>Access is determined by the role assigned on the server. Return to your account to see the access available to you.</p>
      <div className="pt-2">
        <Link className="button" href="/workspace">Return to your account</Link>
      </div>
    </section>
  );
}
