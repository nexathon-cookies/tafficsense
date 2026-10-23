import { createClient } from "@supabase/supabase-js";
import { internalSupabaseUrl, readLocalStatus } from "./local-status.mjs";

async function main() {
  if (process.env.DEMO_MODE !== "true" || process.env.SUPABASE_URL !== internalSupabaseUrl) {
    throw new Error("Report operations are restricted to the configured local demo.");
  }
  const [command, confirmation, ...extra] = process.argv.slice(2);
  const destructive = ["cleanup", "cleanup-expired-guests"].includes(command);
  if (!["enable", "disable", "cleanup", "cleanup-expired-guests"].includes(command)
    || extra.length || (destructive ? confirmation !== "--confirm" : confirmation !== undefined)) {
    throw new Error("Usage: operate-reports.mjs enable|disable | cleanup --confirm | cleanup-expired-guests --confirm");
  }
  let status;
  try {
    status = await readLocalStatus();
  } catch {
    throw new Error("Could not read valid local Supabase status; no report data was changed.");
  }
  const client = createClient(internalSupabaseUrl, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
  });
  const failure = "Report operation failed or timed out; the outcome may be unknown. Check local data, service availability and migrations before retrying.";
  try {
    if (command === "enable" || command === "disable") {
      const result = await client.rpc("set_reporting_enabled", { p_enabled: command === "enable" });
      if (result.error || result.data?.status !== "ready") throw new Error(failure);
      console.log(`SIMULATED reporting ${command === "enable" ? "enabled" : "disabled"}.`);
    } else if (command === "cleanup") {
      const result = await client.rpc("cleanup_traffic_reports", { p_source_ids: null });
      if (result.error || result.data?.status !== "ready") throw new Error(failure);
      console.log("Removed the report dataset only; traffic fixtures and Auth accounts were preserved.");
    } else {
      const snapshot = await client.rpc("read_traffic_demo");
      if (snapshot.error || !snapshot.data?.read_at) throw new Error(failure);
      const rows = await client.from("report_sources").select("id,user_id")
        .eq("kind", "guest").lte("expires_at", snapshot.data.read_at).order("expires_at").limit(100);
      if (rows.error) throw new Error(failure);
      let removed = 0;
      for (const source of rows.data) {
        const identity = await client.auth.admin.getUserById(source.user_id);
        if (identity.error || identity.data.user?.is_anonymous !== true) throw new Error(failure);
        const deleted = await client.auth.admin.deleteUser(source.user_id);
        if (deleted.error) throw new Error(failure);
        removed++;
      }
      console.log(`Removed ${removed} expired report guest identities and their report rows; unrelated Auth accounts and traffic fixtures were preserved. At most 100 identities are processed per invocation.`);
    }
  } catch {
    throw new Error(failure);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
