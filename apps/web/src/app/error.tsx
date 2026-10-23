"use client";

import Link from "next/link";
import { SignOut } from "@/components/sign-out";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <section className="panel narrow">
      <div className="panel-heading">
        <p className="eyebrow m-0">Service unavailable</p>
        <span className="simulated-pill">SYSTEM FAULT</span>
      </div>
      <h1>Account access could not be loaded</h1>
      <p>The authentication service or account data is unavailable. No private data is shown. Check the local service, then try again.</p>
      <div className="actions">
        <button className="button" onClick={retry}>Try again</button>
        <Link href="/">Return home</Link>
      </div>
      <div className="section-space">
        <SignOut />
      </div>
    </section>
  );
}
