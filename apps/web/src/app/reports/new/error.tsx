"use client";

import Link from "next/link";

export default function ReportError({ retry }: { retry: () => void }) {
  return <section><h1>Reporting is unavailable</h1><p>We could not load the reporting screen. This does not confirm that an earlier submission failed; keep its draft and check its saved status after retrying.</p>
    <div className="actions"><button type="button" className="button" onClick={retry}>Retry reporting page</button><Link href="/traffic">Browse traffic</Link></div>
  </section>;
}
