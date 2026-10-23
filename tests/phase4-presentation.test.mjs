import assert from "node:assert/strict";
import { test } from "node:test";
import { incidentView, traversalView } from "../apps/web/src/lib/traffic/phase4-presentation.ts";

const readAt = "2026-10-16T04:00:00.000001Z";
const incident = { state: "supported", is_current: true, valid_until: "2026-10-16T04:00:01.000001Z", prior_incident_id: null };
const traversal = { status: "available", delay_seconds: 495, valid_until: "2026-10-16T04:00:01.000001Z" };

test("incident support expires conservatively without claiming clearance", () => {
  assert.equal(incidentView(incident, readAt, 999).state, "supported");
  assert.equal(incidentView(incident, readAt, 1000).state, "stale");
  assert.equal(incidentView(incident, readAt, null).state, "stale");
  assert.match(incidentView({ ...incident, prior_incident_id: "prior" }, readAt, 0).label, /Reopened/);
  assert.equal(incidentView({ ...incident, is_current: false }, readAt, 0).state, "historical");
  assert.equal(incidentView({ ...incident, state: "cleared", valid_until: null }, readAt, null).state, "cleared");
});

test("complete traversal delay becomes unavailable at its exact deadline", () => {
  assert.equal(traversalView(traversal, readAt, 999).delaySeconds, 495);
  assert.equal(traversalView(traversal, readAt, 1000).delaySeconds, null);
  assert.equal(traversalView(traversal, readAt, null).delaySeconds, null);
  assert.match(traversalView({ ...traversal, delay_seconds: 0 }, readAt, 0).label, /0 seconds/);
});

test("unavailable and future evidence is never promoted by the browser clock", () => {
  for (const status of ["missing", "stale", "future", "invalid", "incompatible"]) {
    const view = traversalView({ ...traversal, status, delay_seconds: null }, readAt, 0);
    assert.equal(view.delaySeconds, null);
    assert.equal(view.state, status);
  }
  assert.equal(incidentView({ ...incident, state: "unconfirmed" }, readAt, 0).state, "unconfirmed");
  assert.equal(incidentView({ ...incident, state: "unconfirmed" }, readAt, 1000).state, "stale");
  assert.equal(incidentView({ ...incident, state: "unconfirmed" }, readAt, null).state, "stale");
});
