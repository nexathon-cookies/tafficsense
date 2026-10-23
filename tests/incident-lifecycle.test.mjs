import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lifecycleParityCases, lifecycleParitySql } from "./incident-lifecycle-parity.mjs";
import { assessRecovery } from "../apps/web/src/lib/evidence/recovery.ts";
import { assessSlowdown } from "../apps/web/src/lib/evidence/slowdown.ts";

const migration = new URL("../supabase/migrations/20261016000300_incident_lifecycle.sql", import.meta.url);
test("lifecycle migration has atomic final-membership processing and a restricted read-only projector", () => {
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /after insert on public\.speed_evidence_batch_samples[\s\S]*?referencing new table as accepted_samples[\s\S]*?for each statement/i);
  assert.match(sql, /create function public\.project_incident_lifecycle\(p_read_at timestamptz\)/i);
  assert.match(sql, /pg_advisory_xact_lock\(72861, 3\)/);
  assert.doesNotMatch(sql, /grant [^;]* to (?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /(?:update|delete from) public\.(?:public_traffic_reports|traffic_reports_private|report_sources)/i);
  assert.match(sql, /p_terminal <= cursor_row\.terminal_at/);
  assert.match(sql, /raise exception 'Incident lifecycle retention limit reached'/);
});
test("SQL parity generator covers exact existing slowdown and recovery rules without a database", () => {
  const cases = lifecycleParityCases();
  assert.ok(cases.length >= 24);
  const byName = name => cases.find(row => row.name === name).value;
  assert.equal(assessRecovery(byName("supported recovery"))[0].status, "supported");
  assert.equal(assessSlowdown(byName("slowdown only"))[0].status, "supported");
  assert.equal(assessRecovery(byName("recovery threshold 21"))[0].status, "threshold_not_met");
  assert.equal(assessRecovery(byName("cohort mismatch"))[0].status, "cohort_mismatch");
  assert.equal(assessRecovery(byName("terminal only conflict"))[0].status, "conflicting");
  assert.equal(assessRecovery(byName("recovery exact expiry"))[0].status, "stale");
  const sql = lifecycleParitySql();
  assert.ok(sql.startsWith("begin;"));
  assert.ok(sql.endsWith("rollback;"));
  assert.equal((sql.match(/select pg_temp.lifecycle_parity_assert/g) ?? []).length, cases.length);
});
