import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRoutes } from "../apps/mobile/src/lib/route-alerts.ts";
import { describeFreshness, STALE_AFTER_MS } from "../apps/mobile/src/lib/freshness.ts";
import { safeReturnPath, validateCredentials } from "../apps/mobile/src/lib/auth-rules.ts";
import { formatDistance, formatEstimatedDuration } from "../apps/mobile/src/lib/format.ts";
import {
  areIncidentsEqual,
  areIncidentListsEqual,
  areSegmentsEqual,
  areSegmentListsEqual,
} from "../apps/mobile/src/lib/traffic-equality.ts";

const warning = {
  id: "r-1",
  category: "accident",
  level: "L3",
  label: "accident (L3)",
  distance_to_route_m: 40,
};

function route(overrides) {
  return {
    id: "route",
    name: "Route",
    distance_m: 3000,
    duration_s: 600,
    geometry: { type: "LineString", coordinates: [[74.84, 12.87], [74.85, 12.88]] },
    is_recommended: false,
    avoids_incident: false,
    incidents_on_route: [],
    provenance: "estimated",
    ...overrides,
  };
}

test("route alerts stay silent when the recommended route has no relevant incident", () => {
  const result = summarizeRoutes([route({ id: "a", is_recommended: true })]);
  assert.equal(result.kind, "none");
  assert.equal(result.primary.id, "a");
});

test("route alerts offer only a server-avoiding alternative and never invent savings", () => {
  const result = summarizeRoutes([
    route({ id: "a", is_recommended: true, incidents_on_route: [warning] }),
    route({ id: "b", avoids_incident: true }),
  ]);
  assert.equal(result.kind, "warning");
  assert.equal(result.incidents.length, 1);
  assert.equal(result.alternative?.id, "b");
});

test("route alerts report no alternative when none avoids the incident", () => {
  const result = summarizeRoutes([
    route({ id: "a", is_recommended: true, incidents_on_route: [warning] }),
    route({ id: "b", avoids_incident: false }),
  ]);
  assert.equal(result.kind, "warning");
  assert.equal(result.alternative, null);
});

test("route alerts handle an empty route list without a primary route", () => {
  assert.deepEqual(summarizeRoutes([]), { kind: "none", primary: null });
});

test("freshness labels recent and stale confirmations honestly", () => {
  const now = Date.parse("2026-10-21T10:00:00Z");
  const recent = describeFreshness("2026-10-21T09:55:00Z", now);
  assert.equal(recent.stale, false);
  assert.equal(recent.label, "Last confirmed 5 min ago");

  const old = describeFreshness(new Date(now - STALE_AFTER_MS - 60_000).toISOString(), now);
  assert.equal(old.stale, true);
  assert.match(old.label, /^Possibly stale/);

  const invalid = describeFreshness("not-a-date", now);
  assert.equal(invalid.stale, true);
});

test("credential rules enforce email shape and registration password length", () => {
  assert.deepEqual(validateCredentials("  Test@Example.com ", "short"), {
    email: "test@example.com",
    password: "short",
  });
  assert.equal(validateCredentials("not-an-email", "password"), null);
  assert.equal(validateCredentials("a@b.co", "short-pass", true), null);
  assert.ok(validateCredentials("a@b.co", "long-enough-pass", true));
});

test("post-sign-in redirects only to allowed in-app screens", () => {
  assert.equal(safeReturnPath("/report"), "/report");
  assert.equal(safeReturnPath("/planner"), "/planner");
  assert.equal(safeReturnPath("https://evil.example"), "/workspace");
  assert.equal(safeReturnPath("/admin"), "/workspace");
  assert.equal(safeReturnPath(undefined), "/workspace");
});

test("format helpers never show invalid numbers as real values", () => {
  assert.equal(formatDistance(450), "450 m");
  assert.equal(formatDistance(2400), "2.4 km");
  assert.equal(formatDistance(Number.NaN), "Distance unavailable");
  assert.equal(formatEstimatedDuration(600), "10 min");
  assert.equal(formatEstimatedDuration(5400), "1 hr 30 min");
  assert.equal(formatEstimatedDuration(-1), "Duration unavailable");
});

test("traffic equality helper accurately compares incidents and lists", () => {
  const inc1 = {
    id: "inc-1",
    category: "accident",
    level: "L2",
    level_reason: "2 commuter reports",
    last_confirmed_at: "2026-10-22T08:00:00Z",
    report_count: 2,
    provenance: "reported",
    lat: 12.87,
    lng: 74.84,
  };
  const inc2 = { ...inc1 };
  assert.equal(areIncidentsEqual(inc1, inc2), true);
  assert.equal(areIncidentListsEqual([inc1], [inc2]), true);

  // Changing any visible property makes them unequal
  assert.equal(areIncidentsEqual(inc1, { ...inc1, report_count: 3 }), false);
  assert.equal(areIncidentsEqual(inc1, { ...inc1, level: "L3" }), false);
  assert.equal(areIncidentsEqual(inc1, { ...inc1, level_reason: "different reason" }), false);
  assert.equal(areIncidentsEqual(inc1, { ...inc1, last_confirmed_at: "2026-10-22T08:05:00Z" }), false);
  assert.equal(areIncidentListsEqual([inc1], [inc2, { ...inc1, id: "inc-2" }]), false);
});

test("traffic equality helper accurately compares segments and segment lists", () => {
  const seg1 = {
    id: "seg-1",
    name: "Central Corridor",
    direction: "northbound",
    severity: "clear",
    provenance: "simulated",
    geometry: { type: "LineString", coordinates: [[74.84, 12.87]] },
  };
  const seg2 = { ...seg1 };
  assert.equal(areSegmentsEqual(seg1, seg2), true);
  assert.equal(areSegmentListsEqual([seg1], [seg2]), true);

  assert.equal(areSegmentsEqual(seg1, { ...seg1, severity: "slowdown" }), false);
  assert.equal(areSegmentsEqual(seg1, { ...seg1, name: "Detour Corridor" }), false);
  assert.equal(areSegmentListsEqual([seg1], []), false);
});
