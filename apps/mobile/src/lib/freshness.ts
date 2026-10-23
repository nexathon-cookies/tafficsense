// Freshness rules for public incidents. The server owns evidence decisions; the app only
// describes how old the latest confirmation is. Older than the stale window is labelled stale.
export const STALE_AFTER_MS = 20 * 60 * 1000;

export type Freshness = { stale: boolean; label: string };

export function describeFreshness(lastConfirmedAt: string, now: number = Date.now()): Freshness {
  const confirmed = Date.parse(lastConfirmedAt);
  if (!Number.isFinite(confirmed)) {
    return { stale: true, label: "Last confirmation time unavailable" };
  }
  const ageMs = Math.max(0, now - confirmed);
  const minutes = Math.floor(ageMs / 60_000);
  const ago = minutes < 1 ? "just now" : `${minutes} min ago`;
  if (ageMs > STALE_AFTER_MS) {
    return { stale: true, label: `Possibly stale · last confirmed ${ago}` };
  }
  return { stale: false, label: `Last confirmed ${ago}` };
}
