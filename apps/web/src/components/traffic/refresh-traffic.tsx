"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshTraffic({ onRefresh }: { onRefresh?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button type="button" className="button secondary" data-refresh-traffic disabled={pending}
        onClick={() => { onRefresh?.(); startTransition(() => router.refresh()); }}>
        {pending ? "Refreshing traffic data…" : "Refresh traffic data"}
      </button>
      {pending && <p role="status">Refreshing… Any displayed data is the previous snapshot until the request completes.</p>}
    </div>
  );
}
