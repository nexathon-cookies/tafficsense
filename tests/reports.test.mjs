import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseReportInput, parsePublicReport, parsePrepareResult, parseSubmitResult,
  reportTimeFromLocal, toReportLocalTime, reportInputFromForm, reportObservationValid,
} from "../apps/web/src/lib/reports/rules.ts";

const source = "09dcbb78-060d-4ce2-8800-339a04771fbc";
const request = "a0866416-8ea3-4f6a-81f9-6f855cd73947";
const episode = "66ee2d39-c477-42ad-a6b8-086781da03de";
const now = "2026-10-15T04:20:00.000Z";
const input = () => ({ source_id: source, request_id: request, segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: now });
const report = () => ({ id: request, episode_id: episode, segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: now, received_at: now, provenance: "simulated", location_provenance: "manual" });

test("report payload is exact, canonical and tied to a supported directed segment", () => {
  assert.deepEqual(parseReportInput(input()), input());
  const opposite = { ...input(), segment_id: "primary-west-inbound", direction: "inbound" };
  assert.deepEqual(parseReportInput(opposite), opposite);
  for (const invalid of [null, [], {}, { ...input(), source_id: "forged" }, { ...input(), direction: "inbound" },
    { ...input(), segment_id: "unrelated" }, { ...input(), category: "confirmed" }, { ...input(), owner_id: source },
    { ...input(), observed_at: "2026-10-15T04:20:00Z" }, { ...input(), observed_at: "2026-02-30T04:20:00.000Z" },
    { ...input(), observed_at: "2026-10-15T09:50:00.000+05:30" }, { ...input(), category: "x".repeat(5000) }]) {
    assert.throws(() => parseReportInput(invalid));
  }
});

test("episode membership is required public metadata and never a client submission field", () => {
  assert.deepEqual(Object.keys(parseReportInput(input())).sort(), ["source_id", "request_id", "segment_id", "direction", "category", "observed_at"].sort());
  for (const episode_id of [episode, null, undefined, "bad"]) {
    assert.throws(() => parseReportInput({ ...input(), episode_id }));
  }
  const missing = report(); delete missing.episode_id;
  assert.throws(() => parsePublicReport(missing));
  for (const episode_id of [null, undefined, "", "bad", request.toUpperCase(), 123, {}]) {
    assert.throws(() => parsePublicReport({ ...report(), episode_id }));
    assert.throws(() => parseSubmitResult({ status: "accepted", report: { ...report(), episode_id }, replayed: true }));
  }
  const first = parseSubmitResult({ status: "accepted", report: report(), replayed: false });
  const replay = parseSubmitResult({ status: "accepted", report: report(), replayed: true });
  assert.equal(first.report.episode_id, episode);
  assert.deepEqual(replay.report, first.report);
  assert.throws(() => parseSubmitResult({ status: "accepted", report: missing, replayed: false }));
  const form = new FormData();
  form.set("segment_id", "primary-west"); form.set("category", "unknown"); form.set("observed_local", "2026-10-15T09:50");
  form.set("episode_id", episode);
  assert.throws(() => reportInputFromForm(form, source, request));
});

test("new report times have exact exclusive twenty-minute and inclusive present boundaries", () => {
  assert.equal(reportObservationValid(now, now), true);
  assert.equal(reportObservationValid("2026-10-15T04:00:00.001Z", now), true);
  assert.equal(reportObservationValid("2026-10-15T04:00:00.000Z", now), false);
  assert.equal(reportObservationValid("2026-10-15T04:20:00.001Z", now), false);
  assert.equal(reportObservationValid("bad", now), false);
});

test("manual observation fields use Asia/Kolkata rather than the device timezone", () => {
  assert.equal(toReportLocalTime(now), "2026-10-15T09:50");
  assert.equal(reportTimeFromLocal("2026-10-15T09:50"), now);
  assert.equal(reportTimeFromLocal("2026-10-15T00:01"), "2026-10-14T18:31:00.000Z");
  for (const value of ["", "2026-02-30T09:50", "2026-10-15T25:00", "2026-10-15", "2026-10-15T09:50Z"]) {
    assert.throws(() => reportTimeFromLocal(value));
  }
});

test("form parsing rejects duplicate, missing and unexpected fields", () => {
  const form = new FormData();
  form.set("segment_id", "primary-west"); form.set("category", "unknown"); form.set("observed_local", "2026-10-15T09:50");
  assert.deepEqual(reportInputFromForm(form, source, request), input());
  form.append("category", "accident");
  assert.throws(() => reportInputFromForm(form, source, request));
  form.delete("category"); form.set("category", "unknown"); form.set("role", "admin");
  assert.throws(() => reportInputFromForm(form, source, request));
  form.delete("role"); form.delete("observed_local");
  assert.throws(() => reportInputFromForm(form, source, request));
});

test("public report projection canonicalizes database time and rejects identity or evidence fields", () => {
  assert.deepEqual(parsePublicReport(report()), report());
  const pg = { ...report(), received_at: "2026-10-15T09:50:00.123456+05:30" };
  assert.equal(parsePublicReport(pg).received_at, "2026-10-15T04:20:00.123Z");
  for (const value of [{ ...report(), source_id: source }, { ...report(), request_id: request },
    { ...report(), provenance: "gps" }, { ...report(), location_provenance: "verified" },
    { ...report(), received_at: "2026-10-15T04:19:59.000Z" }, { ...report(), direction: "inbound" }]) {
    assert.throws(() => parsePublicReport(value));
  }
});

test("preparation exposes only the current source and enforces source lifetime shape", () => {
  const ready = { status: "ready", source: { id: source, kind: "account", expires_at: null }, read_at: now };
  assert.deepEqual(parsePrepareResult(ready), ready);
  const guest = { ...ready, source: { id: source, kind: "guest", expires_at: "2026-10-16T04:20:00.000Z" } };
  assert.deepEqual(parsePrepareResult(guest), guest);
  for (const value of [{ ...ready, token: "secret" }, { ...ready, source: { ...ready.source, kind: "guest" } },
    { ...ready, source: { ...ready.source, email: "private@example.test" } }, { status: "ready" }]) {
    assert.throws(() => parsePrepareResult(value));
  }
});

test("acknowledgements and failure states reject unexpected fields and statuses", () => {
  const accepted = { status: "accepted", report: report(), replayed: false };
  assert.deepEqual(parseSubmitResult(accepted), accepted);
  for (const status of ["invalid", "disabled", "expired", "identity_changed", "conflict", "rate_limited", "unavailable_segment", "denied", "unavailable", "unknown", "not_found", "unconfigured"]) {
    assert.deepEqual(parseSubmitResult({ status }), { status });
    assert.deepEqual(parsePrepareResult({ status }), { status });
    assert.throws(() => parseSubmitResult({ status, detail: "private diagnostic" }));
  }
  for (const value of [{ ...accepted, replayed: "false" }, { status: "confirmed" }, { ...accepted, source_id: source }]) {
    assert.throws(() => parseSubmitResult(value));
  }
});
