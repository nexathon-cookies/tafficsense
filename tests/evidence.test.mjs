import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReportAssessment, assessmentView, assessmentElapsed, advanceAssessmentTiming, assessmentRemainingMs } from "../apps/web/src/lib/evidence/assessment.ts";

const readAt = "2026-10-15T04:00:00.000Z";
const assessment = () => ({ segment_id: "primary-west", direction: "outbound", report_count: 5,
  recent_report_count: 4, eligible_report_count: 4, eligible_source_count: 3, multiple_sources: true,
  valid_until: "2026-10-15T04:01:00.000Z", provenance: "simulated" });

test("assessment parser accepts only anonymous aggregate fields and canonical times", () => {
  assert.deepEqual(parseReportAssessment(assessment(), readAt), assessment());
  assert.equal(parseReportAssessment({ ...assessment(), valid_until: "2026-10-15T09:31:00.000001+05:30" }, readAt).valid_until, assessment().valid_until);
  for (const key of Object.keys(assessment())) {
    const value = assessment(); delete value[key];
    assert.throws(() => parseReportAssessment(value, readAt));
  }
  for (const field of ["source_id", "user_id", "request_id", "source_hash", "cause", "confidence"]) {
    assert.throws(() => parseReportAssessment({ ...assessment(), [field]: "private" }, readAt));
  }
});

test("assessment bounds, provenance, source threshold and deadlines fail closed", () => {
  for (const patch of [
    { report_count: -1 }, { report_count: 2001 }, { recent_report_count: 6 }, { eligible_report_count: 5 },
    { eligible_source_count: 5 }, { eligible_source_count: 0 }, { eligible_source_count: 2 },
    { eligible_source_count: 3.5 }, { multiple_sources: false }, { multiple_sources: "true" },
    { provenance: "gps" }, { segment_id: "unknown" }, { direction: "inbound" },
    { valid_until: null }, { valid_until: "2026-10-15T03:59:59.999Z" },
    { valid_until: "2026-10-15T04:20:00.001Z" }, { valid_until: "bad" },
  ]) assert.throws(() => parseReportAssessment({ ...assessment(), ...patch }, readAt), JSON.stringify(patch));
  const empty = { ...assessment(), report_count: 1, recent_report_count: 0, eligible_report_count: 0,
    eligible_source_count: 0, multiple_sources: false, valid_until: null };
  assert.deepEqual(parseReportAssessment(empty, readAt), empty);
  assert.throws(() => parseReportAssessment({ ...empty, report_count: 0, valid_until: readAt }, readAt));
});

test("all views withdraw current evidence at its deadline without guessing source decrements", () => {
  const row = assessment();
  assert.equal(assessmentView(row, readAt, 0).state, "multiple");
  assert.equal(assessmentView(row, readAt, 59999).state, "multiple");
  for (const elapsed of [60000, 90000, null, -1, NaN, Infinity]) {
    const view = assessmentView(row, readAt, elapsed);
    assert.equal(view.state, "expired");
    assert.match(view.label, /Assessment needs refresh/);
    assert.doesNotMatch(view.label, /L3/);
  }
  assert.match(assessmentView(row, readAt, 0).label, /4 recent.*4 eligible reports.*3 eligible sources/);
  assert.match(assessmentView(row, readAt, 0).label, /L3 Multiple sources/);
  assert.equal(assessmentView({ ...row, eligible_source_count: 2, multiple_sources: false }, readAt, 0).state, "insufficient");
});

test("expired evidence cannot reappear after a clock failure or regression without a new snapshot", () => {
  const origin = { monotonic: 100, wall: 1000 };
  let timing = { elapsedMs: 0, failed: false };
  for (const now of [{ monotonic: 60100, wall: 61000 }, { monotonic: 99, wall: 999 }, { monotonic: 1101, wall: 2001 }]) {
    timing = advanceAssessmentTiming(timing, origin, now);
    assert.ok(timing.elapsedMs >= 60000);
    assert.equal(assessmentView(assessment(), readAt, timing.failed ? null : timing.elapsedMs).state, "expired");
  }
  assert.equal(timing.failed, true);
});

test("all evidence deadlines and scheduling include the preserved read microseconds", () => {
  const preciseRead = "2026-10-15T04:00:00.000900Z";
  assert.equal(assessmentView(assessment(), preciseRead, 59999.5).state, "expired");
  assert.equal(assessmentRemainingMs(assessment().valid_until, preciseRead, 59999.5), -0.4);
  assert.equal(assessmentRemainingMs(assessment().valid_until, preciseRead, 59998), 1.1);
});

test("assessment elapsed time includes loading and sleep, and fails closed for unknown origins", () => {
  assert.equal(assessmentElapsed({ monotonic: 100, wall: 1000 }, { monotonic: 800, wall: 1700 }), 700);
  assert.equal(assessmentElapsed({ monotonic: 100, wall: 1000 }, { monotonic: 800, wall: 91000 }), 90000);
  assert.equal(assessmentElapsed({ monotonic: 100, wall: 1000 }, { monotonic: 800, wall: -10000 }), 700);
  assert.equal(assessmentElapsed(null, { monotonic: 800, wall: 1700 }), null);
  assert.equal(assessmentElapsed({ monotonic: 900, wall: 1000 }, { monotonic: 800, wall: 1700 }), null);
});
