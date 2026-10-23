import { createClient } from "@supabase/supabase-js";
import { reportUuid } from "../apps/web/src/lib/reports/rules.ts";
import { completedTraversalInput, retainedMotionSchedule, simulateTraversal, traversalTimestampMicros } from "../apps/web/src/lib/traffic/traversals.ts";
import { internalSupabaseUrl, readLocalStatus } from "./local-status.mjs";

function exact(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

async function main() {
  if (process.env.DEMO_MODE !== "true" || process.env.SUPABASE_URL !== internalSupabaseUrl) {
    throw new Error("Traversal operations are restricted to the configured local demo.");
  }
  const [command, ...args] = process.argv.slice(2);
  let traversalId;
  try {
    if (command === "check" && args.length === 1) traversalId = reportUuid(args[0]);
    else if (command === "generate" && args.length === 6) {
      reportUuid(args[0]); reportUuid(args[1]); traversalId = reportUuid(args[3]);
      if (!/^[a-z0-9-]{1,100}$/.test(args[2])) throw new Error();
      const entry = traversalTimestampMicros(args[4]), until = traversalTimestampMicros(args[5]);
      if (entry >= until || until - entry >= 1200000000) throw new Error();
    } else throw new Error();
  } catch {
    throw new Error("Usage: operate-traversals.mjs generate <run-uuid> <batch-uuid> <source-id> <traversal-uuid> <entered-at> <observed-until> | check <traversal-uuid>");
  }
  let credentials;
  try { credentials = await readLocalStatus(); } catch {
    throw new Error("Could not read valid local Supabase status; no traversal operation was attempted.");
  }
  const client = createClient(internalSupabaseUrl, credentials.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const failure = `Traversal operation failed or timed out; the outcome may be unknown. Run operate-traversals.mjs check ${traversalId} with local status to inspect the retained acknowledgement; keep all original IDs and timestamps.`;
  async function rpc(name, input) {
    try {
      const response = await client.rpc(name, input).abortSignal(AbortSignal.timeout(15000));
      if (response.error) throw new Error();
      return response.data;
    } catch { throw new Error(failure); }
  }
  let result;
  if (command === "generate") {
    const [runId, batchId, sourceId, , enteredAt, observedUntil] = args;
    const context = await rpc("read_traversal_context", { p_run_id: runId, p_batch_id: batchId, p_source_id: sourceId });
    let schedule;
    try {
      schedule = retainedMotionSchedule(context);
      if (context.run_id !== runId || context.batch_id !== batchId || context.source_id !== sourceId) throw new Error();
    } catch { throw new Error("Retained authored motion is unavailable or incompatible; no traversal ingestion was attempted."); }
    const motion = simulateTraversal(context.segment.length_m, schedule, enteredAt, observedUntil);
    const input = completedTraversalInput({ run_id: runId, batch_id: batchId, source_id: sourceId, traversal_id: traversalId },
      { ...context.segment, id: context.segment.segment_id }, motion);
    result = await rpc("ingest_completed_traversal", { p_traversal: input });
  } else result = await rpc("check_completed_traversal", { p_traversal_id: traversalId });
  try {
    if (result?.status === "accepted") {
      if (!exact(result, ["status", "traversal_id", "accepted_at", "replayed"]) || result.traversal_id !== traversalId
        || typeof result.replayed !== "boolean" || (command === "check" && !result.replayed)) throw new Error();
      traversalTimestampMicros(result.accepted_at);
    } else if (!exact(result, ["status"]) || !(command === "check" ? ["not_found"] : ["invalid", "conflict", "unavailable", "limit_reached"]).includes(result.status)) throw new Error();
  } catch { throw new Error(failure); }
  if (result.status === "accepted") {
    console.log(`SIMULATED completed traversal ${traversalId}: ${result.replayed ? "retained acknowledgement" : "accepted"} at ${result.accepted_at}. Boundary-to-boundary synthetic motion, not incident-caused delay or real travel.`);
  } else if (result.status === "not_found") console.log(`No retained acknowledgement for traversal ${traversalId}. Check any deliberate run cleanup before retrying; never reuse deleted run IDs.`);
  else throw new Error(`Traversal ingestion rejected: ${result.status}. No completion was accepted; no records were evicted. Keep original IDs and inspect the retained run, batch, source, baseline and timestamps.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
