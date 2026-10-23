import assert from "node:assert/strict";
import { test } from "node:test";
import { slowdownView } from "../apps/web/src/lib/evidence/slowdown-presentation.ts";
const readAt = "2026-10-16T04:00:00.000Z";
const row = { segment_id: "primary-west", direction: "outbound", status: "supported",
  window_start: "2026-10-16T03:55:00.000Z", window_end: readAt,
  complete_source_count: 3, slow_source_count: 3, valid_until: "2026-10-16T04:15:00.000Z", provenance: "simulated" };
test("shared L4 presentation separates simulated sources and sampled window from report identities", () => {
  const view = slowdownView(row, readAt, 0);
  assert.equal(view.state, "supported");
  assert.match(view.label, /L4 Slowdown supported/);
  assert.match(view.label, /3 complete synthetic sources · 3 slowdown-supporting sources/);
  assert.match(view.label, /as of data read/);
  assert.match(view.windowLabel, /Asia\/Kolkata/);
  for (const status of ["not_supported", "insufficient", "stale", "future", "missing", "unavailable"]) {
    const negative = slowdownView({ ...row, status }, readAt, 0);
    assert.equal(negative.state, status);
    assert.doesNotMatch(negative.label, /L4 Slowdown supported|cleared|confirmed congestion/);
  }
});
test("deadline and unknown timing withdraw L4 everywhere without recomputing it", () => {
  assert.equal(slowdownView(row, readAt, 899999).state, "supported");
  assert.equal(slowdownView(row, "2026-10-16T04:00:00.000900Z", 899999.5).state, "expired");
  for (const elapsed of [900000, 999999, null, -1, NaN, Infinity]) {
    const view = slowdownView(row, readAt, elapsed);
    assert.equal(view.state, "expired");
    assert.match(view.label, /Slowdown assessment needs refresh/);
    assert.doesNotMatch(view.label, /L4 Slowdown supported/);
  }
});
