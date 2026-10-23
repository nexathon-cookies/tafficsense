import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAnalytics } from "../apps/web/src/lib/analytics/metrics.ts";
import { HISTORICAL_INCIDENTS } from "../apps/web/src/lib/analytics/history.ts";

describe("Phase 7 — Hotspots and monthly analytics", () => {
  it("all historical incidents have simulated provenance and valid fields", () => {
    assert.ok(HISTORICAL_INCIDENTS.length >= 20, "Contains multi-month incident history");
    for (const inc of HISTORICAL_INCIDENTS) {
      assert.equal(inc.provenance, "simulated");
      assert.ok(inc.commuter_delay_minutes > 0, "Delay must be positive");
      assert.ok(inc.duration_minutes >= inc.commuter_delay_minutes, "Duration >= delay");
      assert.ok(["outbound", "inbound"].includes(inc.direction));
      assert.ok(["accident", "road_repair", "heavy_volume", "flood", "unknown"].includes(inc.cause));
    }
  });

  it("computes reconciled hotspot rankings and cause breakdown", () => {
    const all = computeAnalytics("all");

    assert.ok(all.total_incidents > 0);
    assert.ok(all.total_delay_hours > 0);
    assert.ok(all.hotspots.length > 0);

    // Hotspots must be sorted descending by total_delay_hours
    for (let i = 0; i < all.hotspots.length - 1; i++) {
      assert.ok(all.hotspots[i].total_delay_hours >= all.hotspots[i + 1].total_delay_hours);
    }

    // Cause percentages sum to approximately 100%
    const totalPercentage = all.cause_mix.reduce((acc, c) => acc + c.percentage, 0);
    assert.ok(totalPercentage >= 95 && totalPercentage <= 105);
  });

  it("filters correctly by month", () => {
    const oct = computeAnalytics("2026-10");
    const all = computeAnalytics("all");

    assert.ok(oct.total_incidents < all.total_incidents);
    assert.ok(oct.total_delay_hours < all.total_delay_hours);
    assert.equal(oct.selected_month, "2026-10");

    for (const inc of oct.incidents) {
      assert.equal(inc.month, "2026-10");
    }
  });
});
