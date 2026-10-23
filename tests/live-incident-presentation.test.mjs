import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { liveIncidentLevelLabel } from "../apps/web/src/lib/incidents/presentation.ts";

describe("live incident presentation", () => {
  it("uses plain language for a single report and corroborated reports", () => {
    assert.equal(liveIncidentLevelLabel({ level: "L1", report_count: 1 }), "1 person has reported this");
    assert.equal(liveIncidentLevelLabel({ level: "L3", report_count: 3 }), "3 people reported this");
  });

  it("does not represent an authority review as independent confirmation", () => {
    assert.equal(liveIncidentLevelLabel({ level: "L6", report_count: 3 }), "Reviewed by an authority user");
  });
});
