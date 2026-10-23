export const internalSupabaseUrl = "http://supabase_kong_trafficsense-nk-local:8000";

export async function readLocalStatus() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const status = JSON.parse(input);
  if (!["http://127.0.0.1:54321", "http://localhost:54321"].includes(status.API_URL)) {
    throw new Error("Only the local TrafficSense Supabase endpoint is supported.");
  }
  if (typeof status.ANON_KEY !== "string" || typeof status.SERVICE_ROLE_KEY !== "string") {
    throw new Error("Local Supabase status did not provide the required keys.");
  }
  return status;
}
