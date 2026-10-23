import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reportCategories, reportCategoryIcons } from "../apps/web/src/lib/reports/rules.ts";
import { getIncidentCauseBreakdown } from "../apps/web/src/lib/reports/incident-cause.ts";

describe("Phase 5 — Incident types, reported cause, and agreement count", () => {
  it("defines all 17 categories with icons from the brief", () => {
    const keys = Object.keys(reportCategories);
    assert.equal(keys.length, 17, "Must contain exactly 17 categories");

    const expectedKeys = [
      "accident", "road_repair", "festival", "strike", "vip_movement",
      "landslide", "heavy_rain", "flood", "signal_failure", "breakdown",
      "road_closed", "bridge_maintenance", "police_restriction", "fallen_tree",
      "heavy_traffic", "other", "unknown"
    ];

    for (const key of expectedKeys) {
      assert.ok(key in reportCategories, `Category ${key} must exist in reportCategories`);
      assert.ok(key in reportCategoryIcons, `Icon for ${key} must exist in reportCategoryIcons`);
      assert.ok(typeof reportCategories[key] === "string" && reportCategories[key].length > 0);
      assert.ok(typeof reportCategoryIcons[key] === "string" && reportCategoryIcons[key].length > 0);
    }
  });

  it("handles incident with no associated reports as unconfirmed unknown", () => {
    const incident = { report_episode_ids: [] };
    const reports = [];
    const breakdown = getIncidentCauseBreakdown(incident, reports);

    assert.equal(breakdown.leadingCategory, "unknown");
    assert.equal(breakdown.agreementCount, 0);
    assert.equal(breakdown.totalAssociatedReports, 0);
    assert.equal(breakdown.summary, "Unknown — reported, unconfirmed");
    assert.equal(breakdown.detail, "No associated citizen reports");
  });

  it("computes agreement count for single report", () => {
    const incident = { report_episode_ids: ["ep-1"] };
    const reports = [
      { episode_id: "ep-1", category: "accident" },
    ];
    const breakdown = getIncidentCauseBreakdown(incident, reports);

    assert.equal(breakdown.leadingCategory, "accident");
    assert.equal(breakdown.agreementCount, 1);
    assert.equal(breakdown.totalAssociatedReports, 1);
    assert.equal(breakdown.summary, "Reported as Accident by 1 of 1 report (unconfirmed)");
    assert.equal(breakdown.detail, "1 of 1 reports agree on Accident");
  });

  it("computes consensus when majority of reports agree", () => {
    const incident = { report_episode_ids: ["ep-1", "ep-2"] };
    const reports = [
      { episode_id: "ep-1", category: "accident" },
      { episode_id: "ep-1", category: "accident" },
      { episode_id: "ep-2", category: "accident" },
      { episode_id: "ep-2", category: "flood" },
      { episode_id: "ep-unrelated", category: "road_repair" },
    ];
    const breakdown = getIncidentCauseBreakdown(incident, reports);

    assert.equal(breakdown.leadingCategory, "accident");
    assert.equal(breakdown.agreementCount, 3);
    assert.equal(breakdown.totalAssociatedReports, 4);
    assert.equal(breakdown.summary, "Reported as Accident by 3 of 4 reports (unconfirmed)");
    assert.equal(breakdown.detail, "3 of 4 reports agree on Accident");
  });

  it("prioritizes specific category over unknown in a tie", () => {
    const incident = { report_episode_ids: ["ep-1"] };
    const reports = [
      { episode_id: "ep-1", category: "unknown" },
      { episode_id: "ep-1", category: "landslide" },
    ];
    const breakdown = getIncidentCauseBreakdown(incident, reports);

    assert.equal(breakdown.leadingCategory, "landslide");
    assert.equal(breakdown.agreementCount, 1);
    assert.equal(breakdown.totalAssociatedReports, 2);
    assert.equal(breakdown.summary, "Reported as Landslide by 1 of 2 reports (unconfirmed)");
  });
});
