import { createClient } from "@supabase/supabase-js";
import { createTrafficFixture, DEFAULT_DEMO_ANCHOR, DEMO_CORRIDOR_ID } from "../apps/web/src/lib/traffic/simulator.ts";
import { internalSupabaseUrl, readLocalStatus } from "./local-status.mjs";

async function main() {
  if (process.env.DEMO_MODE !== "true" || process.env.SUPABASE_URL !== internalSupabaseUrl) {
    throw new Error("Traffic simulation is restricted to the configured local demo.");
  }
  const [command, anchor = DEFAULT_DEMO_ANCHOR, ...extra] = process.argv.slice(2);
  if (!["normal", "slowdown", "recovery", "reset"].includes(command) || extra.length || (command === "reset" && process.argv.length !== 3)) {
    throw new Error("Usage: simulate-traffic.mjs normal|slowdown|recovery [UTC-anchor] | reset");
  }
  const fixture = command === "reset" ? null : createTrafficFixture(command, anchor);
  let status;
  try {
    status = await readLocalStatus();
  } catch {
    throw new Error("Could not read valid local Supabase status; no traffic data was changed.");
  }
  const client = createClient(internalSupabaseUrl, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const failureMessage = "Traffic operation failed or timed out; the outcome may be unknown. Check local data, service availability and migrations before retrying.";
  try {
    const request = fixture
      ? client.rpc("replace_traffic_demo", { p_fixture: fixture })
      : client.rpc("reset_traffic_demo");
    const result = await request.abortSignal(AbortSignal.timeout(15000));
    if (result.error) throw new Error(failureMessage);
  } catch {
    throw new Error(failureMessage);
  }
  console.log(fixture
    ? `SIMULATED ${command}: stored ${fixture.observations.length} observations for ${DEMO_CORRIDOR_ID} at ${anchor}.`
    : `Removed owned synthetic corridor ${DEMO_CORRIDOR_ID}; unrelated data was left unchanged.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
