"use client";

import Link from "next/link";

export default function TrafficError({ retry }: { retry: () => void }) {
  return (
    <section className="panel" role="alert">
      <h1>Traffic data is unavailable</h1>
      <p>The public traffic page could not be loaded. Signing in is not required.</p>
      <div className="actions">
        <button type="button" className="button" onClick={retry}>Retry traffic page</button>
        <Link href="/demo">Guest introduction</Link>
      </div>
    </section>
  );
}
