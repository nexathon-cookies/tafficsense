import test from "node:test";
import assert from "node:assert/strict";
import { buildMapPayload, incidentCollection, routeCollection, segmentCollection, SEVERITY_COLOURS, ROUTE_COLOURS } from "../apps/mobile/src/map/map-data.ts";
import { buildMapHtml, LEAFLET_VERSION, OPENSTREETMAP_TILE_URL } from "../apps/mobile/src/map/map-html.ts";
import { parseTrafficSegmentsResponse } from "../apps/mobile/src/lib/response-parsers.ts";
import { sharePreviewLines } from "../apps/mobile/src/lib/journeys.ts";
import { safeReturnPath } from "../apps/mobile/src/lib/auth-rules.ts";
import { EVIDENCE_LABELS, evidenceLabel } from "../apps/mobile/src/lib/evidence.ts";
import { projectSchematicPoint } from "../apps/mobile/src/lib/schematic-map.ts";
import { formatCoordinates, toReportLocationInput } from "../apps/mobile/src/lib/report-location.ts";

const segment = {
  id: "s1",
  name: "Hampankatta approach",
  direction: "inbound",
  geometry: { type: "LineString", coordinates: [[74.83, 12.86], [74.85, 12.88]] },
  severity: "slowdown",
  provenance: "simulated",
};

const incident = {
  id: "i1",
  category: "accident",
  lat: 12.87,
  lng: 74.84,
  status: "open",
  level: "L3",
  level_reason: "Three reports",
  first_reported_at: "2026-10-21T09:00:00Z",
  last_confirmed_at: "2026-10-21T09:00:00Z",
  provenance: "reported",
  report_count: 3,
};

function route(id, overrides = {}) {
  return {
    id,
    name: id,
    distance_m: 1000,
    duration_s: 300,
    geometry: { type: "LineString", coordinates: [[74.84, 12.87], [74.85, 12.88]] },
    is_recommended: false,
    avoids_incident: false,
    incidents_on_route: [],
    provenance: "estimated",
    ...overrides,
  };
}

test("segments keep GeoJSON [lng, lat] order and the web severity colours", () => {
  const collection = segmentCollection([segment]);
  assert.equal(collection.features[0].geometry.coordinates[0][0], 74.83);
  assert.equal(collection.features[0].properties.colour, SEVERITY_COLOURS.slowdown);
});

test("only the primary route is drawn until the commuter chooses the alternative", () => {
  const routes = [route("a", { is_recommended: true }), route("b", { avoids_incident: true })];
  const withoutAlt = routeCollection(routes, { alternativeId: null, selectedId: "a" });
  assert.deepEqual(withoutAlt.features.map((f) => f.properties.kind), ["primary"]);
  const withAlt = routeCollection(routes, { alternativeId: "b", selectedId: "b" });
  assert.deepEqual(withAlt.features.map((f) => f.properties.kind), ["primary", "alternative"]);
  assert.equal(withAlt.features[1].properties.colour, ROUTE_COLOURS.alternative);
  assert.equal(withAlt.features[1].properties.selected, true);
});

test("incidents drop invalid coordinates and flag the selected and on-route reports", () => {
  const bad = { ...incident, id: "bad", lat: Number.NaN };
  const collection = incidentCollection([incident, bad], {
    selectedId: "i1",
    routeIncidentIds: new Set(["i1"]),
  });
  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].properties.selected, true);
  assert.equal(collection.features[0].properties.onRoute, true);
  assert.deepEqual(collection.features[0].geometry.coordinates, [74.84, 12.87]);
});

test("the payload marks on-route reports from the route warnings", () => {
  const routes = [
    route("a", { is_recommended: true, incidents_on_route: [{ id: "i1", category: "accident", level: "L3", label: "accident", distance_to_route_m: 10 }] }),
  ];
  const payload = buildMapPayload({ incidents: [incident], routes, selectedRouteId: "a", fit: true });
  assert.equal(payload.incidents.features[0].properties.onRoute, true);
  assert.equal(payload.fit, true);
  assert.equal(payload.you, null);
});

test("the map page uses a pinned non-WebGL renderer and OpenStreetMap tile attribution", () => {
  const html = buildMapHtml();
  assert.ok(html.includes(`leaflet@${LEAFLET_VERSION}/dist`));
  assert.ok(html.includes(JSON.stringify(OPENSTREETMAP_TILE_URL)));
  assert.ok(html.includes("select-incident"));
  assert.ok(html.includes("OpenStreetMap contributors"));
  assert.ok(!html.includes("webgl"));
  assert.ok(!html.includes("</script><script>"), "no injected script boundary");
});

test("the traffic parser rejects malformed or non-simulated segments", () => {
  const valid = { ok: true, read_at: "2026-10-21T09:00:00Z", segments: [segment] };
  assert.deepEqual(parseTrafficSegmentsResponse(valid).segments.length, 1);
  assert.throws(() => parseTrafficSegmentsResponse({ ok: true, read_at: "x", segments: [{ ...segment, provenance: "live" }] }));
  assert.throws(() => parseTrafficSegmentsResponse({ ok: true, read_at: "x", segments: [{ ...segment, severity: "jam" }] }));
  assert.throws(() => parseTrafficSegmentsResponse({ ok: true, read_at: "x", segments: [{ ...segment, geometry: { type: "LineString", coordinates: [[74.8, "12.8"]] } }] }));
  assert.deepEqual(parseTrafficSegmentsResponse({ ok: false, error: "down" }), { ok: false, error: "down" });
});

test("the share preview states exactly what is and is not disclosed", () => {
  const lines = sharePreviewLines("Acme Ltd").join("\n");
  assert.match(lines, /Recipient: Acme Ltd/);
  assert.match(lines, /Not shared: exact coordinates, GPS points, route history, or your device identity/);
  assert.match(lines, /Delay is not measured yet/);
});

test("journey and sharing screens are allowed as post-sign-in destinations only", () => {
  assert.equal(safeReturnPath("/journeys"), "/journeys");
  assert.equal(safeReturnPath("/journeys/../admin"), "/workspace");
});

test("evidence labels cover every level and never claim a confirmed cause", () => {
  for (const level of ["L1", "L2", "L3", "L4", "L5", "L6"]) {
    assert.ok(EVIDENCE_LABELS[level], `label for ${level}`);
    assert.doesNotMatch(evidenceLabel(level), /cause (is )?confirmed/i);
  }
  assert.equal(evidenceLabel("L9"), "Evidence level unavailable");
});

test("schematic fallback keeps an incident within the map bounds", () => {
  const point = projectSchematicPoint([74.84, 12.87], [[74.83, 12.86], [74.85, 12.88]]);
  assert.equal(point.left, "50%");
  assert.equal(point.top, "50%");
});

test("a chosen reference point never claims a GPS fix", () => {
  const reference = { source: "reference", label: "Hampankatta Junction", lat: 12.8698, lng: 74.8426, gpsAccuracyM: null, gpsFixAt: null };
  assert.deepEqual(toReportLocationInput(reference), { lat: 12.8698, lng: 74.8426, gpsAccuracyM: null, gpsFixAt: null });
  assert.equal(formatCoordinates(reference), "12.8698° N, 74.8426° E");
});
