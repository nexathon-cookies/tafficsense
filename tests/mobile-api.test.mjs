import test from "node:test";
import assert from "node:assert/strict";
import {
  parseActiveIncidentsResponse,
  parseRouteResponse,
  parseSubmitIncidentResponse,
} from "../apps/mobile/src/lib/response-parsers.ts";
import { MobileApiError, requestJson } from "../apps/mobile/src/lib/request.ts";

const incident = {
  id: "incident-1",
  category: "heavy_traffic",
  lat: 12.87,
  lng: 74.84,
  status: "open",
  level: "L1",
  level_reason: "One report",
  first_reported_at: "2026-10-21T09:00:00Z",
  last_confirmed_at: "2026-10-21T09:00:00Z",
  provenance: "reported",
  report_count: 1,
};

test("mobile incident parser accepts a valid response and rejects malformed rows", () => {
  assert.deepEqual(parseActiveIncidentsResponse({ ok: true, incidents: [incident] }), {
    ok: true,
    incidents: [incident],
  });
  assert.throws(
    () => parseActiveIncidentsResponse({ ok: true, incidents: [{ ...incident, lat: "12.87" }] }),
    /invalid response/i,
  );
});

test("mobile report parser preserves server errors and validates success fields", () => {
  assert.deepEqual(parseSubmitIncidentResponse({ ok: false, error: "Sign-in required." }), {
    ok: false,
    error: "Sign-in required.",
  });
  assert.deepEqual(parseSubmitIncidentResponse({
    ok: true,
    incident_id: "incident-1",
    level: "L1",
    level_reason: "One report",
  }), {
    ok: true,
    incident_id: "incident-1",
    level: "L1",
    level_reason: "One report",
  });
  assert.throws(() => parseSubmitIncidentResponse({ ok: true, incident_id: "incident-1" }), /invalid response/i);
});

test("mobile route parser fails closed on malformed route options", () => {
  const valid = {
    ok: true,
    routes: [{
      id: "route-1",
      name: "Fastest route",
      distance_m: 1200,
      duration_s: 180,
      geometry: { type: "LineString", coordinates: [[74.84, 12.87]] },
      is_recommended: true,
      avoids_incident: false,
      incidents_on_route: [],
      provenance: "estimated",
    }],
  };
  assert.deepEqual(parseRouteResponse(valid), valid);
  assert.deepEqual(parseRouteResponse({ ok: false, error: "No route" }), {
    ok: false,
    error: "No route",
    routes: [],
  });
  assert.throws(() => parseRouteResponse({ ...valid, routes: [{ ...valid.routes[0], provenance: "live" }] }), /invalid response/i);
});

test("mobile API errors expose auth and retryability state", () => {
  const auth = new MobileApiError("Sign-in required.", 401);
  assert.equal(auth.authRequired, true);
  assert.equal(auth.retryable, false);
  assert.equal(auth.status, 401);

  const outage = new MobileApiError("Unavailable", 503);
  assert.equal(outage.authRequired, false);
  assert.equal(outage.retryable, true);
});

test("mobile request retries one transient GET but never retries a POST", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ error: "temporary" }), { status: 503 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const result = await requestJson("http://example.test", {}, "Invalid", { retryGet: true });
    assert.equal(result.response.status, 200);
    assert.equal(calls, 2);

    calls = 0;
    const post = await requestJson("http://example.test", { method: "POST" }, "Invalid", { retryGet: true });
    assert.equal(post.response.status, 503);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
