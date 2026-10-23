import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = new URL("../supabase/migrations/20261016000700_incident_lifecycle_read_support.sql", import.meta.url);
test("late-evidence correction replaces only the read-only projection and restricts evaluator access", () => {
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /create or replace function public\.project_incident_lifecycle\(p_read_at timestamptz\)/i);
  assert.match(sql, /language sql stable security definer/i);
  assert.match(sql, /grant execute on function public\.evaluate_incident_lifecycle\(uuid, text, text, timestamptz\) to incident_lifecycle_reader/i);
  assert.doesNotMatch(sql, /\b(?:insert into|update public\.|delete from|create trigger|process_incident_lifecycle|append_incident_lifecycle_event)\b/i);
  assert.doesNotMatch(sql, /grant [^;]* to (?:anon|authenticated|service_role)/i);
  assert.match(sql, /v\.kind = 'supported' and v\.current_context/);
  assert.match(sql, /b\.accepted_at >= v\.accepted_at and b\.accepted_at <= p_read_at/);
  assert.match(sql, /v\.has_current_support is not true/);
  assert.match(sql, /when v\.kind = 'cleared' then 'cleared'/);
  assert.match(sql, /when p_read_at >= v\.support_deadline then 'stale'/);
});
