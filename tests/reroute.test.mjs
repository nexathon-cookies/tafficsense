import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateCandidateWaypoints,
  snapToRoadNetwork,
  calculateDetourRoute,
  routeClearsObstacle,
} from "../apps/web/src/lib/routing/reroute.ts";
import { haversineDistanceM, minDistanceToRoute } from "../apps/web/src/lib/routing/engine.ts";

describe("Dynamic Rerouting Engine (Coordinate-Accurate Avoidance)", () => {
  const Hampankatta = [74.8426, 12.8698];
  const Bejai = [74.8530, 12.8856];
  const AmbedkarCircleIncident = [74.8475, 12.8750]; // In between Hampankatta & Bejai

  it("generates radial detour candidates around incident outside exclusion radius", () => {
    const candidates = generateCandidateWaypoints(Hampankatta, AmbedkarCircleIncident, [350, 550]);
    assert.ok(candidates.length > 0, "Should generate candidates");

    // All candidates must be within Mangaluru bounds
    for (const c of candidates) {
      assert.ok(c[0] >= 74.70 && c[0] <= 75.05, `Lng ${c[0]} in bounds`);
      assert.ok(c[1] >= 12.75 && c[1] <= 13.05, `Lat ${c[1]} in bounds`);

      const distToIncident = haversineDistanceM(c, AmbedkarCircleIncident);
      // Candidates generated with 350m and 550m should be approx that distance
      assert.ok(distToIncident >= 300, `Candidate distance ${distToIncident}m should be >= 300m`);
    }
  });

  it("snaps candidate waypoint to road network using OSRM /nearest response", async () => {
    const mockFetch = async (url) => {
      assert.match(url, /nearest\/v1\/driving/);
      return {
        ok: true,
        json: async () => ({
          code: "Ok",
          waypoints: [
            {
              location: [74.8480, 12.8755],
              name: "Bunts Hostel Road",
              distance: 45.2,
            },
          ],
        }),
      };
    };

    const snapped = await snapToRoadNetwork([74.8482, 12.8758], mockFetch);
    assert.ok(snapped !== null);
    assert.deepEqual(snapped.coordinate, [74.8480, 12.8755]);
    assert.equal(snapped.streetName, "Bunts Hostel Road");
  });

  it("rejects reroute requests with coordinates outside Mangaluru bounds", async () => {
    const result = await calculateDetourRoute({
      currentLocation: [77.5946, 12.9716], // Bengaluru
      destination: Bejai,
      blockedIncident: {
        id: "inc-1",
        point: AmbedkarCircleIncident,
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /outside the supported Mangaluru service area/i);
  });

  it("successfully calculates a detour route that clears the incident exclusion radius", async () => {
    const obstacle = [74.8475, 12.8750];
    const bypassCoord = [74.8420, 12.8760]; // Snapped point well away from obstacle

    const mockFetch = async (url) => {
      if (url.includes("/nearest/v1/")) {
        return {
          ok: true,
          json: async () => ({
            code: "Ok",
            waypoints: [
              {
                location: bypassCoord,
                name: "Car Street Bypass",
                distance: 25.0,
              },
            ],
          }),
        };
      }

      if (url.includes("/route/v1/driving/")) {
        // Multi-leg route avoiding the incident
        return {
          ok: true,
          json: async () => ({
            code: "Ok",
            routes: [
              {
                distance: 3450,
                duration: 420,
                geometry: {
                  coordinates: [
                    Hampankatta,
                    [74.8422, 12.8730],
                    bypassCoord,
                    [74.8460, 12.8820],
                    Bejai,
                  ],
                },
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await calculateDetourRoute({
      currentLocation: Hampankatta,
      destination: Bejai,
      blockedIncident: {
        id: "inc-ambedkar",
        point: obstacle,
        category: "accident",
        level: "L3",
        label: "Accident at Ambedkar Circle",
      },
      exclusionRadiusM: 250,
      fetchFn: mockFetch,
    });

    assert.equal(result.ok, true);
    assert.ok(result.detourRoute);
    assert.equal(result.detourRoute.avoids_incident, true);
    assert.equal(result.detourRoute.is_recommended, true);
    assert.match(result.detourRoute.name, /Car Street Bypass/);
    assert.deepEqual(result.detourRoute.bypassWaypoint, bypassCoord);

    // Coordinate verification: the polyline must clear the 250m obstacle buffer
    const minDist = minDistanceToRoute(obstacle, result.detourRoute.geometry.coordinates);
    assert.ok(
      minDist >= 250,
      `Detour route must be at least 250m from obstacle, got ${minDist}m`
    );

    // Verify turn coordinates are present with proper coordinate length
    assert.ok(result.detourRoute.turnCoordinates.length >= 3);
  });

  it("honestly rejects when no detour candidate clears the exclusion zone", async () => {
    const obstacle = [74.8475, 12.8750];

    // Simulate all candidate routes clipping within 50m of the obstacle
    const mockFetch = async (url) => {
      if (url.includes("/nearest/v1/")) {
        return {
          ok: true,
          json: async () => ({
            code: "Ok",
            waypoints: [
              {
                location: [74.8476, 12.8752], // Only 30m away from obstacle
                name: "Bottleneck Bridge",
                distance: 10.0,
              },
            ],
          }),
        };
      }

      if (url.includes("/route/v1/driving/")) {
        return {
          ok: true,
          json: async () => ({
            code: "Ok",
            routes: [
              {
                distance: 2500,
                duration: 300,
                geometry: {
                  coordinates: [
                    Hampankatta,
                    obstacle, // Passes right through obstacle!
                    Bejai,
                  ],
                },
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await calculateDetourRoute({
      currentLocation: Hampankatta,
      destination: Bejai,
      blockedIncident: {
        id: "inc-bridge-block",
        point: obstacle,
        category: "road_closed",
        level: "L6",
      },
      exclusionRadiusM: 250,
      fetchFn: mockFetch,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /No (navigable|viable) road detour/i);
  });

  it("permits safe departure clearance when commuter starts near hazard zone but drives away", () => {
    const origin = [74.8427, 12.8687]; // Hampankatta
    const incidentPoint = [74.8420, 12.8680]; // ~107m away
    const destination = [74.8870, 12.9613]; // Airport

    // Route moving progressively north away from the incident
    const departingRoute = [
      origin,
      [74.8435, 12.8710],
      [74.8460, 12.8780],
      destination,
    ];

    const result = routeClearsObstacle(
      departingRoute,
      incidentPoint,
      200,
      origin,
      destination
    );
    assert.equal(result.clears, true);

    // Route plunging straight into the crash point (<40m)
    const dangerousRoute = [
      origin,
      [74.84205, 12.86805], // 7m from incident!
      destination,
    ];
    const dangerResult = routeClearsObstacle(
      dangerousRoute,
      incidentPoint,
      200,
      origin,
      destination
    );
    assert.equal(dangerResult.clears, false);
  });
});
