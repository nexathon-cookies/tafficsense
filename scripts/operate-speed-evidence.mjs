import { createClient } from "@supabase/supabase-js";
import { reportTimestamp, reportUuid } from "../apps/web/src/lib/reports/rules.ts";
import { internalSupabaseUrl, readLocalStatus } from "./local-status.mjs";

function exact(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

async function main() {
  if (process.env.DEMO_MODE !== "true" || process.env.SUPABASE_URL !== internalSupabaseUrl) {
    throw new Error("Speed-evidence operations are restricted to the configured local demo.");
  }
  const [command, runId, batchOrConfirmation, ...extra] = process.argv.slice(2);
  try {
    reportUuid(runId);
    if (!["capture", "check", "cleanup"].includes(command) || extra.length) throw new Error();
    if (command === "cleanup") {
      if (batchOrConfirmation !== "--confirm") throw new Error();
    } else reportUuid(batchOrConfirmation);
  } catch {
    throw new Error("Usage: operate-speed-evidence.mjs capture|check <run-uuid> <batch-uuid> | cleanup <run-uuid> --confirm");
  }
  let status;
  try { status = await readLocalStatus(); } catch {
    throw new Error("Could not read valid local Supabase status; no evidence operation was attempted.");
  }
  const client = createClient(internalSupabaseUrl, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const failure = "Speed-evidence operation failed or timed out; the outcome may be unknown. " + (command === "cleanup"
    ? `Inspect run ${runId} before repeating its confirmed cleanup; never reuse deleted run IDs.`
    : `Run bash scripts/local-supabase.sh speed-evidence check ${runId} ${batchOrConfirmation} to inspect the retained acknowledgement; do not generate replacement IDs.`);
  let result;
  try {
    const input = command === "cleanup" ? { p_run_id: runId } : { p_run_id: runId, p_batch_id: batchOrConfirmation };
    const response = await client.rpc(`${command}_speed_evidence`, input).abortSignal(AbortSignal.timeout(15000));
    if (response.error) throw new Error();
    result = response.data;
    if (command === "cleanup") {
      if (!exact(result, ["status", "removed"]) || result.status !== "ready" || typeof result.removed !== "boolean") throw new Error();
    } else if (result?.status === "accepted") {
      if (!exact(result, ["status", "run_id", "batch_id", "accepted_at", "observation_count", "inserted_observation_count", "replayed"])
        || result.run_id !== runId || result.batch_id !== batchOrConfirmation
        || typeof result.replayed !== "boolean" || (command === "check" && !result.replayed)
        || !Number.isInteger(result.observation_count) || result.observation_count < 1 || result.observation_count > 5000
        || !Number.isInteger(result.inserted_observation_count) || result.inserted_observation_count < 0
        || result.inserted_observation_count > result.observation_count) throw new Error();
      reportTimestamp(result.accepted_at);
    } else if (!exact(result, ["status"]) || !(command === "check" ? ["not_found"]
      : ["conflict", "unavailable", "invalid", "limit_reached"]).includes(result.status)) throw new Error();
  } catch { throw new Error(failure); }

  if (result.status === "accepted") {
    const action = result.replayed ? "retained acknowledgement" : "captured";
    console.log(`SIMULATED ${action}: run ${runId}, batch ${batchOrConfirmation}, accepted ${result.accepted_at}; ${result.observation_count} samples, ${result.inserted_observation_count} originally inserted. Evidence storage only, not clearance.`);
  } else if (result.status === "not_found") {
    console.log(`No retained acknowledgement for run ${runId}, batch ${batchOrConfirmation}. Check service availability and any deliberate cleanup before deciding whether to capture.`);
  } else if (result.status === "ready") {
    console.log(`${result.removed ? "Removed" : "No retained run for"} synthetic evidence run ${runId}; never reuse a deleted run ID. Active traffic, reports and Auth were preserved.`);
  } else {
    const reason = {
      conflict: "The current generation conflicts with the retained batch, descriptors, samples or anchor order.",
      unavailable: "The owned synthetic fixture is missing or empty.",
      invalid: "New captures require every sample to be within the last twenty minutes and not in the future.",
      limit_reached: "A capture or retained-ledger limit was reached; no data was evicted.",
    }[result.status];
    throw new Error(`Speed-evidence capture rejected: ${result.status}. No new evidence was accepted. ${reason} Check the retained acknowledgement and current fixture before retrying.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
