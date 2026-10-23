import { assessSlowdown } from "../apps/web/src/lib/evidence/slowdown.ts";
import { assessRecovery } from "../apps/web/src/lib/evidence/recovery.ts";
import { pathToFileURL } from "node:url";

const end = "2026-10-16T10:00:00.123456Z";
const at = minutes => new Date(Date.parse(end) + minutes * 60000).toISOString().replace("Z", "456Z");
export function lifecycleParityCases() {
  const base = () => ({ read_at: end, fixture: {
    segments: [{ id: "lifecycle-parity", direction: "outbound", length_m: 1500, baseline_seconds: 180, baseline_label: "Synthetic baseline" }],
    sources: Array.from({ length: 6 }, (_, index) => ({ id: `source-${index}`, segment_id: "lifecycle-parity" })),
    observations: Array.from({ length: 6 }, (_, source) => Array.from({ length: 12 }, (_, tick) => ({
      segment_id: "lifecycle-parity", source_id: `source-${source}`, observed_at: at(tick - 11), speed_kph: tick < 6 ? 8 : 28,
    }))).flat(),
  } });
  const cases = [];
  const add = (name, change = () => {}) => { const value = base(); change(value); cases.push({ name, value }); };
  add("supported recovery");
  add("slowdown only", value => value.fixture.observations.forEach(row => { row.speed_kph = 8; }));
  for (const speed of [11.99, 12, 12.01]) add(`slow threshold ${speed}`, value => value.fixture.observations.forEach(row => { if (row.observed_at < at(-5)) row.speed_kph = speed; }));
  for (const speed of [20.99, 21, 21.01]) add(`recovery threshold ${speed}`, value => value.fixture.observations.forEach(row => { if (row.observed_at >= at(-5)) row.speed_kph = speed; }));
  add("cohort mismatch", value => value.fixture.observations.forEach(row => { row.speed_kph = row.observed_at < at(-5) ? Number(row.source_id.slice(-1)) < 3 ? 8 : 30 : Number(row.source_id.slice(-1)) < 3 ? 15 : 28; }));
  add("conflicting cohort", value => value.fixture.observations.forEach(row => { if (Number(row.source_id.slice(-1)) >= 3) row.speed_kph = 8; }));
  add("terminal only conflict", value => { value.fixture.observations = value.fixture.observations.filter(row => Number(row.source_id.slice(-1)) < 3 || row.observed_at >= at(-5)); value.fixture.observations.forEach(row => { if (Number(row.source_id.slice(-1)) >= 3) row.speed_kph = 8; }); });
  add("two sources", value => { value.fixture.observations = value.fixture.observations.filter(row => Number(row.source_id.slice(-1)) < 2); });
  add("rotating sources", value => { value.fixture.observations = value.fixture.observations.filter(row => (Number(row.source_id.slice(-1)) < 3) === (row.observed_at < at(-5))); });
  add("missing tick", value => { value.fixture.observations = value.fixture.observations.filter(row => row.observed_at !== at(-8)); });
  add("microsecond irregularity", value => value.fixture.observations.forEach(row => { if (row.observed_at === at(-8)) row.observed_at = row.observed_at.replace("456Z", "457Z"); }));
  add("new incomplete terminal", value => { value.read_at = at(1); value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: at(1) }); });
  add("recovery fresh by microsecond", value => { value.read_at = "2026-10-16T10:09:00.123455Z"; });
  add("recovery exact expiry", value => { value.read_at = at(9); });
  add("slowdown exact expiry", value => { value.read_at = at(15); });
  add("future terminal", value => { value.fixture.observations.push({ ...value.fixture.observations[0], observed_at: at(1) }); });
  add("all future", value => { value.read_at = at(-12); });
  add("missing", value => { value.fixture.observations = []; });
  add("unrounded baseline", value => { Object.assign(value.fixture.segments[0], { length_m: 1001, baseline_seconds: 144 }); value.fixture.observations.forEach(row => { row.speed_kph = row.observed_at < at(-5) ? 10 : 17.52; }); });
  add("empty baseline", value => { value.fixture.segments[0].baseline_label = " "; });
  return cases;
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const canonical = value => JSON.parse(JSON.stringify(value), (_key, item) => typeof item === "string" && /^20\d\d-.*Z$/.test(item) ? item.replace(/\.(\d{3})Z$/, ".$1000Z") : item);

export function lifecycleParitySql() {
  const lines = ["begin; set local timezone = 'UTC'; select pg_advisory_xact_lock(72861, 3);", "create function pg_temp.lifecycle_parity_assert(ok boolean, label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'SQL/TS lifecycle parity: %', label; end if; end; $$;"];
  for (const { name, value } of lifecycleParityCases()) {
    const run = crypto.randomUUID(), batch = crypto.randomUUID(), segment = value.fixture.segments[0];
    const expected = canonical({ slowdown: assessSlowdown(value)[0], recovery: assessRecovery(value)[0] });
    lines.push(`insert into public.speed_evidence_runs values (${quote(run)}, 'mangaluru-central-v1', '2026-10-16T09:00:00Z', 'simulated');`,
      `insert into public.speed_evidence_segments values (${quote(run)}, ${quote(segment.id)}, 'outbound', ${segment.length_m}, ${segment.baseline_seconds}, ${quote(segment.baseline_label)});`,
      `insert into public.speed_evidence_batches values (${quote(run)}, ${quote(batch)}, '2026-10-16T09:00:00Z', '2026-10-16T09:00:00Z', decode(repeat('00',32),'hex'), 1, 1);`);
    for (const source of value.fixture.sources) lines.push(`insert into public.speed_evidence_sources values (${quote(run)}, ${quote(source.id)}, ${quote(segment.id)}, 'outbound', 'Synthetic');`);
    for (const row of value.fixture.observations) lines.push(`insert into public.speed_evidence_observations values (${quote(run)}, ${quote(row.source_id)}, ${quote(row.observed_at)}, ${quote(segment.id)}, 'outbound', ${row.speed_kph}, ${quote(batch)});`);
    lines.push(`select pg_temp.lifecycle_parity_assert(public.evaluate_incident_lifecycle(${quote(run)}, ${quote(segment.id)}, 'outbound', ${quote(value.read_at)}) = ${quote(JSON.stringify(expected))}::jsonb, ${quote(name)});`);
  }
  lines.push("rollback;");
  return lines.join("\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(lifecycleParitySql());
