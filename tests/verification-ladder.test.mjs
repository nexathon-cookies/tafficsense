import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateSegmentLadder, LADDER_SPEC } from "../apps/web/src/lib/evidence/verification-ladder.ts";

test("verification ladder defines all 6 tiers aligned with the brief", () => {
  const levels = ["L1", "L2", "L3", "L4", "L5", "L6"];
  for (const lvl of levels) {
    assert.ok(LADDER_SPEC[lvl], `Tier ${lvl} must be defined in LADDER_SPEC`);
    assert.ok(typeof LADDER_SPEC[lvl].name === "string" && LADDER_SPEC[lvl].name.length > 0);
    assert.ok(typeof LADDER_SPEC[lvl].description === "string");
  }
  assert.equal(LADDER_SPEC.L1.status, "implemented");
  assert.equal(LADDER_SPEC.L2.status, "implemented");
  assert.equal(LADDER_SPEC.L3.status, "implemented");
  assert.equal(LADDER_SPEC.L4.status, "implemented");
  assert.equal(LADDER_SPEC.L5.status, "planned");
  assert.equal(LADDER_SPEC.L6.status, "implemented");
});

test("baseline segment with no reports or slowdown evaluates to normal flow", () => {
  const ladder = evaluateSegmentLadder({
    hasReport: false,
    isMultipleSources: false,
    isSlowdownSupported: false,
  });
  assert.equal(ladder.currentLevel, null);
  assert.equal(ladder.currentLabel, "Normal baseline flow");
  assert.ok(ladder.tiers.every(tier => !tier.achieved));
});

test("L1 report activates L1 without claiming location support", () => {
  const ladder = evaluateSegmentLadder({
    hasReport: true,
    isMultipleSources: false,
    isSlowdownSupported: false,
  });
  assert.equal(ladder.currentLevel, "L1");
  assert.match(ladder.currentLabel, /L1 Reported/);
  const l1 = ladder.tiers.find(t => t.level === "L1");
  assert.equal(l1?.achieved, true);
  const l2 = ladder.tiers.find(t => t.level === "L2");
  assert.equal(l2?.achieved, false);
  assert.equal(l2?.status, "implemented");
});

test("location support and authority review are explicit, separate states", () => {
  const ladder = evaluateSegmentLadder({
    hasReport: true,
    hasLocationSupport: true,
    isMultipleSources: false,
    isSlowdownSupported: false,
    isAuthorityConfirmed: true,
  });
  assert.equal(ladder.currentLevel, "L6");
  assert.match(ladder.currentLabel, /L6 Authority Confirmed/);
  assert.equal(ladder.tiers.find(t => t.level === "L2")?.achieved, true);
  assert.equal(ladder.tiers.find(t => t.level === "L3")?.achieved, false);
  assert.equal(ladder.tiers.find(t => t.level === "L6")?.achieved, true);
});

test("multiple sources promotes segment to L3", () => {
  const ladder = evaluateSegmentLadder({
    hasReport: true,
    isMultipleSources: true,
    isSlowdownSupported: false,
  });
  assert.equal(ladder.currentLevel, "L3");
  assert.match(ladder.currentLabel, /L3 Multiple Sources/);
  assert.equal(ladder.tiers.find(t => t.level === "L3")?.achieved, true);
  assert.equal(ladder.tiers.find(t => t.level === "L1")?.achieved, true);
  assert.equal(ladder.tiers.find(t => t.level === "L4")?.achieved, false);
});

test("speed slowdown promotes segment to L4", () => {
  const ladder = evaluateSegmentLadder({
    hasReport: false,
    isMultipleSources: false,
    isSlowdownSupported: true,
  });
  assert.equal(ladder.currentLevel, "L4");
  assert.match(ladder.currentLabel, /L4 Speed Slowdown/);
  assert.equal(ladder.tiers.find(t => t.level === "L4")?.achieved, true);
  // Only photo evidence remains a planned tier.
  assert.equal(ladder.tiers.find(t => t.level === "L5")?.achieved, false);
  assert.equal(ladder.tiers.find(t => t.level === "L6")?.achieved, false);
});
