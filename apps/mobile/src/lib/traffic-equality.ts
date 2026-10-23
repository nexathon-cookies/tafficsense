import type { LiveIncident, TrafficSegment } from "@trafficsense/shared";

/**
 * Checks whether two LiveIncident objects have identical displayed values.
 */
export function areIncidentsEqual(a: LiveIncident, b: LiveIncident): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.category === b.category &&
    a.level === b.level &&
    a.level_reason === b.level_reason &&
    a.last_confirmed_at === b.last_confirmed_at &&
    a.report_count === b.report_count &&
    a.provenance === b.provenance &&
    a.lat === b.lat &&
    a.lng === b.lng
  );
}

/**
 * Checks whether two incident lists have identical incidents in the same order.
 */
export function areIncidentListsEqual(a: LiveIncident[], b: LiveIncident[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!areIncidentsEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether two TrafficSegment objects are equal.
 */
export function areSegmentsEqual(a: TrafficSegment, b: TrafficSegment): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.direction === b.direction &&
    a.severity === b.severity &&
    a.provenance === b.provenance
  );
}

/**
 * Checks whether two segment lists are equal.
 */
export function areSegmentListsEqual(a: TrafficSegment[], b: TrafficSegment[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!areSegmentsEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}
