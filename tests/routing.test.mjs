import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isWithinMangaluruBounds,
  formatRouteDuration,
  formatRouteDistance,
} from "../apps/web/src/lib/routing/types.ts";

import {
  haversineDistanceM,
  minDistanceToRoute,
  findIncidentsOnRoute,
  parseOsrmResponse,
  buildOsrmUrl,
  queryRoute,
} from "../apps/web/src/lib/routing/engine.ts";

describe("Plan 4 (revised) – Dynamic Routing Engine", () => {
  it("validates coordinates inside and outside the Mangaluru service area", () => {
    // Hampankatta, Mangaluru
    assert.equal(isWithinMangaluruBounds([74.8426, 12.8698]), true);
    // KSRTC Bejai, Mangaluru
    assert.equal(isWithinMangaluruBounds([74.8530, 12.8856]), true);
    // Bengaluru (outside)
    assert.equal(isWithinMangaluruBounds([77.5946, 12.9716]), false);
    // London (outside)
    assert.equal(isWithinMangaluruBounds([-0.1276, 51.5074]), false);
  });

  it("formats route duration and distance accurately", () => {
    assert.equal(formatRouteDuration(0), "0 min");
    assert.equal(formatRouteDuration(293), "5 min");
    assert.equal(formatRouteDuration(3600), "1 hr");
    assert.equal(formatRouteDuration(4500), "1 hr 15 min");

    assert.equal(formatRouteDistance(450), "450 m");
    assert.equal(formatRouteDistance(3097), "3.1 km");
  });

  it("calculates accurate Haversine distance", () => {
    // Distance between Hampankatta [74.8426, 12.8698] and Bejai [74.8530, 12.8856] is ~2.1 - 2.3 km
    const dist = haversineDistanceM([74.8426, 12.8698], [74.8530, 12.8856]);
    assert.ok(dist > 2000 && dist < 2400, `Expected ~2.2km, got ${dist}`);
  });

  it("calculates minimum distance from a point to route vertices", () => {
    const route = [
      [74.84, 12.86],
      [74.85, 12.87],
      [74.86, 12.88],
    ];
    // Exact point on route
    const d0 = minDistanceToRoute([74.85, 12.87], route);
    assert.equal(Math.round(d0), 0);

    // Point slightly offset (~100m away)
    const d1 = minDistanceToRoute([74.851, 12.87], route);
    assert.ok(d1 > 50 && d1 < 200, `Expected ~100m, got ${d1}`);
  });

  it("finds incidents within threshold distance of route coordinates", () => {
    const route = [
      [74.84, 12.86],
      [74.85, 12.87],
      [74.86, 12.88],
    ];
    const incidents = [
      { id: "inc-1", category: "accident", level: "L3", point: [74.8502, 12.8701] }, // ~30m away
      { id: "inc-2", category: "flood", level: "L1", point: [74.90, 12.90] }, // > 5km away
    ];
    const found = findIncidentsOnRoute(route, incidents, 200);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, "inc-1");
  });

  it("builds the correct OSRM URL with alternatives parameter", () => {
    const url = buildOsrmUrl([74.8426, 12.8698], [74.853, 12.8856]);
    assert.match(url, /router\.project-osrm\.org\/route\/v1\/driving\/74\.8426,12\.8698;74\.853,12\.8856/);
    assert.match(url, /alternatives=true/);
    assert.match(url, /geometries=geojson/);
  });

  it("parses OSRM response into structured route options with free-flow estimate provenance", () => {
    const mockRaw = {
      code: "Ok",
      routes: [
        {
          distance: 3100.5,
          duration: 320.2,
          geometry: {
            coordinates: [
              [74.842, 12.869],
              [74.845, 12.875],
              [74.853, 12.885],
            ],
          },
        },
        {
          distance: 3800.0,
          duration: 410.0,
          geometry: {
            coordinates: [
              [74.842, 12.869],
              [74.840, 12.878],
              [74.853, 12.885],
            ],
          },
        },
      ],
    };

    const parsed = parseOsrmResponse(mockRaw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.routes.length, 2);

    const r1 = parsed.routes[0];
    assert.equal(r1.distance_m, 3101);
    assert.equal(r1.duration_s, 320);
    assert.equal(r1.is_recommended, true);
    assert.equal(r1.avoids_incident, false);
    assert.equal(r1.provenance, "estimated");

    const r2 = parsed.routes[1];
    assert.equal(r2.distance_m, 3800);
    assert.equal(r2.is_recommended, false);
  });

  it("detects incidents near route and re-routes around verified L3+ incidents", () => {
    // Primary route passes through [74.845, 12.875]
    // Alternative route passes through [74.840, 12.878] (away from the incident)
    const mockRaw = {
      code: "Ok",
      routes: [
        {
          distance: 3100,
          duration: 320,
          geometry: {
            coordinates: [
              [74.842, 12.869],
              [74.845, 12.875], // Incident right here!
              [74.853, 12.885],
            ],
          },
        },
        {
          distance: 3600,
          duration: 380,
          geometry: {
            coordinates: [
              [74.842, 12.869],
              [74.840, 12.878], // Clean detour
              [74.853, 12.885],
            ],
          },
        },
      ],
    };

    const incident = {
      id: "inc-123",
      category: "accident",
      level: "L3",
      point: [74.845, 12.875], // directly on primary route
    };

    const parsed = parseOsrmResponse(mockRaw, [incident]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.routes.length, 2);

    // The detour should now be recommended and moved to index 0
    const recommended = parsed.routes[0];
    assert.equal(recommended.is_recommended, true);
    assert.equal(recommended.avoids_incident, true);
    assert.match(recommended.avoided_incident_reason, /Avoiding accident ahead \(verified L3\)/i);
    assert.equal(recommended.incidents_on_route.length, 0);

    // The original primary route should be index 1 with the incident warning
    const originalPrimary = parsed.routes[1];
    assert.equal(originalPrimary.is_recommended, false);
    assert.equal(originalPrimary.incidents_on_route.length, 1);
    assert.equal(originalPrimary.incidents_on_route[0].id, "inc-123");
  });

  it("queryRoute rejects out-of-bounds requests before network call", async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ code: "Ok" }));
    };

    const res = await queryRoute([77.59, 12.97], [74.84, 12.86], [], mockFetch);
    assert.equal(res.ok, false);
    assert.equal(fetchCalled, false);
    assert.match(res.error, /outside the supported Mangaluru service area/i);
  });
});
