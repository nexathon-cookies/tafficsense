import Link from "next/link";

export default function NotFound() {
  return (
    <section className="panel narrow">
      <div className="panel-heading">
        <p className="eyebrow m-0">404</p>
        <span className="simulated-pill">NOT FOUND</span>
      </div>
      <h1>Page not found</h1>
      <p>This page does not exist or is not available to your account.</p>
      <div className="pt-2">
        <Link className="button secondary" href="/workspace">Return to your account</Link>
      </div>
    </section>
  );
}
