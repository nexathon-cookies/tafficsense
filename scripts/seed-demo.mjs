import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { readLocalStatus, internalSupabaseUrl } from "./local-status.mjs";
import { createTrafficFixture } from "../apps/web/src/lib/traffic/simulator.ts";

function databaseErrorDetails(error) {
  return [error.message, error.details, error.hint, error.code]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" · ");
}

if (process.env.DEMO_MODE !== "true" || process.env.SUPABASE_URL !== internalSupabaseUrl) {
  throw new Error("Synthetic seeding is restricted to the configured local demo.");
}
const status = await readLocalStatus();
const supabase = createClient(internalSupabaseUrl, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const organisations = await supabase.from("organisations").upsert([
  { id: orgA, name: "SIMULATED · Harbour employer" },
  { id: orgB, name: "SIMULATED · Junction employer" },
]);
if (organisations.error) throw new Error("Could not seed local organisations; apply migrations first.");
const existing = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (existing.error) throw new Error("Could not inspect synthetic accounts.");
const definitions = [
  { label: "commuter", role: "commuter" },
  { label: "commuter-b", role: "commuter" },
  { label: "commuter-c", role: "commuter" },
  { label: "employer-a", role: "employer", orgId: orgA },
  { label: "employer-b", role: "employer", orgId: orgB },
  { label: "employer-unassigned", role: "employer" },
  { label: "authority", role: "authority" },
  { label: "admin", role: "admin" },
];
const accounts = [];
for (const definition of definitions) {
  const email = `${definition.label}@demo.trafficsense.test`;
  const password = randomBytes(24).toString("base64url");
  const found = existing.data.users.find((user) => user.email === email);
  const attributes = { password, email_confirm: true, user_metadata: { simulated: true } };
  const result = found
    ? await supabase.auth.admin.updateUserById(found.id, attributes)
    : await supabase.auth.admin.createUser({ email, ...attributes });
  if (result.error || !result.data.user) throw new Error(`Could not seed ${definition.label}.`);
  const id = result.data.user.id;
  const profile = await supabase.from("profiles").update({ role: definition.role }).eq("id", id).select("id").single();
  if (profile.error) throw new Error(`Could not assign ${definition.label}.`);
  const clear = await supabase.from("memberships").delete().eq("user_id", id);
  if (clear.error) throw new Error("Could not reset synthetic memberships.");
  if (definition.orgId) {
    const membership = await supabase.from("memberships").insert({ user_id: id, org_id: definition.orgId });
    if (membership.error) throw new Error(`Could not assign synthetic membership for ${definition.label}: ${databaseErrorDetails(membership.error)}`);
  }
  accounts.push({ ...definition, email, password, id });
}
await mkdir("supabase/.temp", { recursive: true, mode: 0o700 });
await writeFile("supabase/.temp/demo-accounts.json", `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
await chmod("supabase/.temp/demo-accounts.json", 0o600);

const fixture = createTrafficFixture("normal", new Date().toISOString());
const demo = await supabase.rpc("replace_traffic_demo", { p_fixture: fixture });
if (demo.error) throw new Error("Could not seed the synthetic traffic corridor.");
const reporting = await supabase.rpc("set_reporting_enabled", { p_enabled: true });
if (reporting.error) throw new Error("Could not enable synthetic traffic reporting.");

const reportScenarios = [
  {
    category: "accident",
    lat: 12.8715,
    lng: 74.8465,
    note: "TEST DATA · Accident reported near Hampankatta / Ambedkar (Jyothi) Circle.",
    reporters: ["commuter", "commuter-b", "commuter-c"],
  },
  {
    category: "flood",
    lat: 12.855,
    lng: 74.8685,
    note: "TEST DATA · Waterlogging reported near Pumpwell (Mahaveera) Circle.",
    reporters: ["commuter"],
  },
  {
    category: "road_closed",
    lat: 12.8856,
    lng: 74.862,
    note: "TEST DATA · Road closure reported near Kottara Junction.",
    reporters: ["commuter-b"],
  },
  {
    category: "heavy_traffic",
    lat: 12.844,
    lng: 74.856,
    note: "TEST DATA · Heavy traffic reported near Thokkottu Junction.",
    reporters: ["commuter-c"],
  },
];

for (const scenario of reportScenarios) {
  for (const label of scenario.reporters) {
    const account = accounts.find((candidate) => candidate.label === label);
    if (!account) throw new Error(`Missing seeded reporter ${label}.`);
    const reporter = createClient(internalSupabaseUrl, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await reporter.auth.signInWithPassword({ email: account.email, password: account.password });
    if (signIn.error) throw new Error(`Could not sign in seeded reporter ${label}.`);
    const submitted = await reporter.rpc("submit_live_incident_report", {
      p_category: scenario.category,
      p_lat: scenario.lat,
      p_lng: scenario.lng,
      p_gps_accuracy_m: null,
      p_gps_fix_at: null,
      p_note: scenario.note,
    });
    if (submitted.error) throw new Error(`Could not seed ${scenario.category} incident.`);
  }
}

console.log("Created eight synthetic accounts, a normal-traffic corridor, and four TEST DATA incident scenarios for Hampankatta/Jyothi, Pumpwell, Kottara, and Thokkottu. TEST DATA · spread check uses this incident (Ambedkar Circle accident, L3). Local passwords are in the ignored supabase/.temp/demo-accounts.json file; do not publish it.");
