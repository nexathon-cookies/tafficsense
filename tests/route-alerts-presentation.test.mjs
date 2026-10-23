import assert from "node:assert/strict";
import { test } from "node:test";
import { routeAlertView } from "../apps/web/src/lib/route-alerts/presentation.ts";

const readAt = "2026-10-16T04:00:00.000001Z";
const alert = { segment_id: "primary-west", direction: "outbound", kind: "alert", reason: null,
  savings_us: 300_000_000, valid_until: "2026-10-16T04:00:01.000001Z",
  incident_id: "6c491f94-8c75-4a56-9c20-a332ae9de920", provenance: "simulated" };

test("positive labels describe only a simulated estimated difference, not an end-to-end trip", () => {
  const view = routeAlertView(alert, readAt, 0);
  assert.equal(view.state, "alert");
  assert.match(view.label, /simulated/i);
  assert.match(view.label, /estimated.*difference/i);
  assert.match(view.label, /not guaranteed/i);
  assert.match(view.label, /not.*end-to-end/i);
  assert.match(view.label, /300/);
});

test("uncertain, suspended, expired and nonfinite clocks withdraw only positive alerts", () => {
  assert.equal(routeAlertView(alert, readAt, 999.999).state, "alert");
  for (const elapsed of [1000, 1000.001, 60_000, null, NaN, Infinity, -Infinity, -1]) {
    assert.equal(routeAlertView(alert, readAt, elapsed).state, "expired");
  }
  const exact = { ...alert, valid_until: "2026-10-16T04:00:00.000002Z" };
  assert.equal(routeAlertView(exact, readAt, 0).state, "alert");
  assert.equal(routeAlertView(exact, readAt, 0.0001).state, "expired");
  for (const valid_until of [null, "bad", readAt]) assert.equal(routeAlertView({ ...alert, valid_until }, readAt, 0).state, "expired");
});

test("abstentions never promote as future evidence arrives or hazards age out", () => {
  for (const reason of ["unrelated_selection", "unsupported_incident", "no_alternative", "no_routes", "missing", "stale", "future",
    "invalid", "incompatible", "mixed_runs", "alternative_hazard", "alternative_slowdown", "below_threshold"]) {
    for (const elapsed of [0, 1_200_000, null]) {
      const view = routeAlertView({ ...alert, kind: "abstain", reason }, readAt, elapsed);
      assert.equal(view.state, "abstain"); assert.ok(view.label.length > 10);
    }
  }
  assert.match(routeAlertView({ ...alert, kind: "abstain", reason: "alternative_hazard" }, readAt, 0).label, /reported|unconfirmed/i);
});

test("malformed positive values never render as recommendations", () => {
  for (const savings_us of [NaN, Infinity, -Infinity, 299_999_999, 300_000_000.1, Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.notEqual(routeAlertView({ ...alert, savings_us }, readAt, 0).state, "alert");
  }
  for (const patch of [{ incident_id: null }, { provenance: "live" }, { reason: "unsupported_incident" }]) {
    assert.notEqual(routeAlertView({ ...alert, ...patch }, readAt, 0).state, "alert");
  }
});
