import type { RouteIncidentWarning, RouteOption } from "@trafficsense/shared";

// Route relevance uses only the server's incidents_on_route and avoids_incident fields.
// The app never invents a delay saving: alternatives are free-flow estimates.
export type RouteAlert =
  | { kind: "none"; primary: RouteOption | null }
  | {
      kind: "warning";
      primary: RouteOption;
      incidents: RouteIncidentWarning[];
      alternative: RouteOption | null;
    };

export function summarizeRoutes(routes: RouteOption[]): RouteAlert {
  const primary = routes.find((route) => route.is_recommended) ?? routes[0] ?? null;
  if (!primary) return { kind: "none", primary: null };
  if (primary.incidents_on_route.length === 0) return { kind: "none", primary };

  const alternative =
    routes.find((route) => route.id !== primary.id && route.avoids_incident) ?? null;
  return {
    kind: "warning",
    primary,
    incidents: primary.incidents_on_route,
    alternative,
  };
}
