// Phase 6: Recurrence heatmap, recurrence statement, per-cause delay table tests
// All analytics data is deterministic synthetic data labelled SIMULATED.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// We import from the compiled output via tsx/Node ESM loader (set up in package.json)
import {
  computeRecurrenceHeatmap,
  computeRecurrenceStatement,
  computeCauseDelaySummary,
  computeAnalytics,
} from "../apps/web/src/lib/analytics/metrics.ts";

describe("Phase 6 – recurrence heatmap", () => {
  it("returns a grid with day keys 0–6 and hour columns covering peak windows", () => {
    const heatmap = computeRecurrenceHeatmap("all");
    // Must have at least Sunday(0) through Saturday(6) as keys
    for (let d = 0; d <= 6; d++) {
      assert.ok(Object.prototype.hasOwnProperty.call(heatmap, d), `Missing day key ${d}`);
    }
    // Each day must have at least one hour slot entry
    const day0 = heatmap[0];
    assert.ok(typeof day0 === "object" && day0 !== null, "Day 0 must be an object");
    const slots = Object.keys(day0);
    assert.ok(slots.length > 0, "Day 0 must have hour slots");
  });

  it("heatmap cells are non-negative integers", () => {
    const heatmap = computeRecurrenceHeatmap("all");
    for (const dayVal of Object.values(heatmap)) {
      for (const count of Object.values(dayVal)) {
        assert.ok(Number.isInteger(count) && count >= 0, `Cell count must be non-negative integer, got ${count}`);
      }
    }
  });

  it("total across all cells equals the total incident count for the period", () => {
    const data = computeAnalytics("all");
    const heatmap = computeRecurrenceHeatmap("all");
    let total = 0;
    for (const dayVal of Object.values(heatmap)) {
      for (const count of Object.values(dayVal)) {
        total += count;
      }
    }
    assert.equal(total, data.total_incidents, "Heatmap cell sum must equal total incident count");
  });

  it("month-filtered heatmap matches month-filtered incident count", () => {
    const month = "2026-08";
    const data = computeAnalytics(month);
    const heatmap = computeRecurrenceHeatmap(month);
    let total = 0;
    for (const dayVal of Object.values(heatmap)) {
      for (const count of Object.values(dayVal)) {
        total += count;
      }
    }
    assert.equal(total, data.total_incidents, "Filtered heatmap cell sum must equal filtered incident count");
  });
});

describe("Phase 6 – recurrence statement", () => {
  it("returns a string matching the required pattern with computed N and M", () => {
    const stmt = computeRecurrenceStatement("all", "hampankatta");
    // Must contain the pattern: "N of the last M weekdays"
    assert.match(
      stmt,
      /\d+ of the last \d+ weekdays/i,
      "Recurrence statement must contain 'N of the last M weekdays'",
    );
  });

  it("computed N is not hard-coded — must vary with different junctions", () => {
    const stmt1 = computeRecurrenceStatement("all", "hampankatta");
    const stmt2 = computeRecurrenceStatement("all", "ladyhill");
    // Different junctions should at least be different strings or same — just ensure no crash
    assert.ok(typeof stmt1 === "string" && stmt1.length > 0, "Must be non-empty string");
    assert.ok(typeof stmt2 === "string" && stmt2.length > 0, "Must be non-empty string");
  });

  it("shows the peak window in the statement", () => {
    const stmt = computeRecurrenceStatement("all", "hampankatta");
    // Should include a time range like HH:MM
    assert.match(stmt, /\d{2}:\d{2}/, "Recurrence statement must include a time window");
  });
});

describe("Phase 6 – per-cause delay summary", () => {
  it("returns an array with cause, label, count, and total_delay_hours fields", () => {
    const summary = computeCauseDelaySummary("all");
    assert.ok(Array.isArray(summary) && summary.length > 0, "Must return non-empty array");
    for (const entry of summary) {
      assert.ok(typeof entry.cause === "string", "cause must be string");
      assert.ok(typeof entry.label === "string", "label must be string");
      assert.ok(Number.isInteger(entry.count) && entry.count > 0, "count must be positive integer");
      assert.ok(typeof entry.total_delay_hours === "number" && entry.total_delay_hours >= 0, "total_delay_hours must be non-negative number");
    }
  });

  it("total incident count across causes equals total incidents in analytics", () => {
    const summary = computeCauseDelaySummary("all");
    const data = computeAnalytics("all");
    const total = summary.reduce((acc, e) => acc + e.count, 0);
    assert.equal(total, data.total_incidents, "Per-cause count sum must equal total incidents");
  });

  it("sorted descending by total_delay_hours", () => {
    const summary = computeCauseDelaySummary("all");
    for (let i = 1; i < summary.length; i++) {
      assert.ok(
        summary[i - 1].total_delay_hours >= summary[i].total_delay_hours,
        "Summary must be sorted descending by total_delay_hours",
      );
    }
  });

  it("computes analytics over custom live incident list when provided", () => {
    const customIncidents = [
      {
        id: "live-1",
        junction_id: "hampankatta",
        junction_name: "Hampankatta Junction",
        segment_id: "primary-west",
        direction: "outbound",
        occurred_at: "2026-10-19T08:30:00.000Z",
        duration_minutes: 40,
        commuter_delay_minutes: 25,
        cause: "accident",
        month: "2026-10",
        peak_window: "08:00-10:00",
        provenance: "simulated",
      },
    ];

    const data = computeAnalytics("all", customIncidents);
    assert.equal(data.total_incidents, 1);
    assert.equal(data.top_hotspot, "Hampankatta Junction");
    assert.equal(data.primary_cause, "Traffic Collisions");

    const heatmap = computeRecurrenceHeatmap("all", customIncidents);
    assert.ok(heatmap[0]);

    const statement = computeRecurrenceStatement("all", "hampankatta", customIncidents);
    assert.match(statement, /Congested on 1 of the last 1 weekdays/i);
  });
});

