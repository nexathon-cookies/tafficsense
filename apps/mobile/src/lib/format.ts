// Plain-language formatting for route and incident values. Durations are free-flow estimates.
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "Distance unavailable";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatEstimatedDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Duration unavailable";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function categoryLabel(category: string): string {
  return category.replaceAll("_", " ");
}
