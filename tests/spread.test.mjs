import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { checkSpread, clearSpreadCache } from "../apps/web/src/lib/routing/spread.ts";

describe("Spread Check: Which Routes Does a Verified Problem Reach?", () => {
  const origin = { name: "Pumpwell (Mahaveera) Circle", coords: [74.8685, 12.8550] };
  const destinationA = { name: "Hampankatta Junction", coords: [74.8426, 12.8698] };
  const destinationB = { name: "KSRTC / Bejai Circle", coords: [74.8530, 12.8856] };

  // Calculate latitude offsets for exactly 199m and 201m
  const delta199 = (199 / 6371000) * (180 / Math.PI);
  const delta201 = (201 / 6371000) * (180 / Math.PI);

  beforeEach(() => {
    clearSpreadCache();
  });

  it("counts incident 199 m from the route line as affected", async () => {
    const routeCoords = [
      [74.8500, 12.8600],
      [74.8500, 12.8650],
      [74.8500, 12.8700],
    ];
    // Place incident 199m offset from [74.8500, 12.8650]
    const incidentPoint = [74.8500, 12.8650 + delta199];

    const incident = {
      id: "inc-199",
      category: "accident",
      level: "L3",
      point: incidentPoint,
      label: "Accident (L3)",
    };

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            { distance: 2000, duration: 300, geometry: { coordinates: routeCoords } },
            { distance: 2500, duration: 400, geometry: { coordinates: [[74.8400, 12.8600], [74.8400, 12.8700]] } },
          ],
        }),
        { status: 200 }
      );

    const result = await checkSpread(origin, [destinationA], incident, mockFetch, 0);

    assert.equal(result.total, 1);
    assert.equal(result.checked, 1);
    assert.equal(result.affected, 1);
    assert.equal(result.rows[0].affected, true);
    assert.equal(result.rows[0].checked, true);
    assert.equal(result.rows[0].primary_duration_s, 300);
    assert.equal(result.rows[0].avoiding_extra_s, 100); // 400 - 300
  });

  it("counts incident 201 m from the route line as not affected", async () => {
    const routeCoords = [
      [74.8500, 12.8600],
      [74.8500, 12.8650],
      [74.8500, 12.8700],
    ];
    // Place incident 201m away
    const incidentPoint = [74.8500, 12.8650 + delta201];

    const incident = {
      id: "inc-201",
      category: "accident",
      level: "L3",
      point: incidentPoint,
      label: "Accident (L3)",
    };

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            { distance: 2000, duration: 300, geometry: { coordinates: routeCoords } },
          ],
        }),
        { status: 200 }
      );

    const result = await checkSpread(origin, [destinationA], incident, mockFetch, 0);

    assert.equal(result.total, 1);
    assert.equal(result.checked, 1);
    assert.equal(result.affected, 0);
    assert.equal(result.rows[0].affected, false);
    assert.equal(result.rows[0].checked, true);
    assert.equal(result.rows[0].avoiding_extra_s, null);
  });

  it("rejects L1 incident with an error", async () => {
    const incident = {
      id: "inc-l1",
      category: "accident",
      level: "L1",
      point: [74.8500, 12.8650],
      label: "Single report (L1)",
    };

    await assert.rejects(
      async () => {
        await checkSpread(origin, [destinationA], incident);
      },
      {
        message: /Incident must be verified at level L3 or L6/,
      }
    );
  });

  it("rejects simulated slowdown with an error", async () => {
    const incident = {
      id: "inc-sim",
      category: "traffic_slowdown",
      level: "L3",
      point: [74.8500, 12.8650],
      label: "Simulated Slowdown (L3)",
    };

    await assert.rejects(
      async () => {
        await checkSpread(origin, [destinationA], incident);
      },
      {
        message: /Simulated corridor slowdowns cannot be used/,
      }
    );
  });

  it("handles OSRM failures by marking checked: false and affected: false", async () => {
    const incident = {
      id: "inc-fail",
      category: "road_closed",
      level: "L6",
      point: [74.8500, 12.8650],
      label: "Road Closed (L6)",
    };

    const destinations = [
      { name: "Dest 1", coords: [74.8426, 12.8698] },
      { name: "Dest 2 (fails)", coords: [74.8530, 12.8856] },
      { name: "Dest 3 (fails)", coords: [74.8465, 12.8715] },
      { name: "Dest 4", coords: [74.8385, 12.8890] },
      { name: "Dest 5", coords: [74.8390, 12.8640] },
      { name: "Dest 6", coords: [74.8580, 12.8820] },
      { name: "Dest 7", coords: [74.8900, 12.9610] },
    ];

    const mockFetch = async (url) => {
      if (url.includes("74.853,12.8856") || url.includes("74.8465,12.8715")) {
        return new Response("Service Unavailable", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 2000,
              duration: 300,
              // Pass right through the incident for Dest 1 only
              geometry: {
                coordinates: url.includes("74.8426,12.8698")
                  ? [[74.8500, 12.8650], [74.8426, 12.8698]]
                  : [[74.8000, 12.8000], [74.8100, 12.8100]],
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const result = await checkSpread(origin, destinations, incident, mockFetch, 0);

    assert.equal(result.total, 7);
    assert.equal(result.checked, 5);
    assert.equal(result.affected, 1);

    const failedRows = result.rows.filter((r) => !r.checked);
    assert.equal(failedRows.length, 2);
    for (const failed of failedRows) {
      assert.equal(failed.affected, false);
      assert.equal(failed.primary_duration_s, null);
    }
  });

  it("handles zero destinations affected without claiming safe", async () => {
    const incident = {
      id: "inc-zero",
      category: "flood",
      level: "L3",
      point: [74.8900, 12.9500], // Away from route
      label: "Flood (L3)",
    };

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 1000,
              duration: 200,
              geometry: { coordinates: [[74.8400, 12.8500], [74.8426, 12.8698]] },
            },
          ],
        }),
        { status: 200 }
      );

    const result = await checkSpread(origin, [destinationA, destinationB], incident, mockFetch, 0);

    assert.equal(result.total, 2);
    assert.equal(result.checked, 2);
    assert.equal(result.affected, 0);

    // Honest formatting test
    const sentence = `Affects ${result.affected} of ${result.checked} routes from ${result.origin}.`;
    assert.equal(sentence, "Affects 0 of 2 routes from Pumpwell (Mahaveera) Circle.");
    assert.equal(sentence.includes("safe"), false);
  });

  it("clamps avoiding extra time to 0 if alternative is shorter than primary", async () => {
    const routeCoords = [
      [74.8500, 12.8600],
      [74.8500, 12.8650],
      [74.8500, 12.8700],
    ];
    const incident = {
      id: "inc-faster-alt",
      category: "accident",
      level: "L3",
      point: [74.8500, 12.8650], // directly on primary route
      label: "Accident (L3)",
    };

    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            // Primary route has duration 350s
            { distance: 2000, duration: 350, geometry: { coordinates: routeCoords } },
            // Alternative avoiding route has duration 300s (50s faster)
            { distance: 1800, duration: 300, geometry: { coordinates: [[74.8400, 12.8600], [74.8400, 12.8700]] } },
          ],
        }),
        { status: 200 }
      );

    const result = await checkSpread(origin, [destinationA], incident, mockFetch, 0);

    assert.equal(result.affected, 1);
    assert.equal(result.rows[0].affected, true);
    assert.equal(result.rows[0].primary_duration_s, 350);
    assert.equal(result.rows[0].avoiding_extra_s, 0); // Math.max(0, 300 - 350)
  });

  it("caches spread result for 5 minutes", async () => {
    const incident = {
      id: "inc-cache",
      category: "accident",
      level: "L3",
      point: [74.8500, 12.8650],
      label: "Accident (L3)",
    };

    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            { distance: 1000, duration: 200, geometry: { coordinates: [[74.8400, 12.8500], [74.8426, 12.8698]] } },
          ],
        }),
        { status: 200 }
      );
    };

    // First call: calls fetch
    const res1 = await checkSpread(origin, [destinationA], incident, mockFetch, 5 * 60 * 1000);
    assert.equal(fetchCount, 1);
    assert.equal(res1.affected, 0);

    // Second call: returns cached result without calling fetch
    const res2 = await checkSpread(origin, [destinationA], incident, mockFetch, 5 * 60 * 1000);
    assert.equal(fetchCount, 1);
    assert.deepEqual(res1, res2);

    // After clearing cache, calls fetch again
    clearSpreadCache();
    const res3 = await checkSpread(origin, [destinationA], incident, mockFetch, 5 * 60 * 1000);
    assert.equal(fetchCount, 2);
  });
});
