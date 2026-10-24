import type { SupabaseClient } from "@supabase/supabase-js";

// Commuter journeys and consent-based employer sharing, using the same RPCs and tables as the web app.
// The server enforces ownership and organisation membership; the client only displays and asks.
export const DEMO_CORRIDOR_NAME = "Mangaluru Central Demonstration Corridor";

export type JourneyRow = {
  id: string;
  corridor_name: string;
  status: "active" | "ended";
  started_at: string;
  ended_at: string | null;
  provenance: "simulated";
};

export type ShareRow = {
  id: string;
  journey_id: string;
  org_id: string;
  org_name: string;
  status: "active" | "stopped";
  shared_at: string;
  stopped_at: string | null;
};

export type OrganisationRow = { id: string; name: string };

export type JourneyWorkspace = {
  journeys: (JourneyRow & { shares: ShareRow[] })[];
  organisations: OrganisationRow[];
};

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error("Journeys are not available in this mobile build.");
  return client;
}

function isJourneyRow(value: unknown): value is JourneyRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.corridor_name === "string" &&
    (row.status === "active" || row.status === "ended") && typeof row.started_at === "string";
}

export async function loadJourneyWorkspace(client: SupabaseClient | null): Promise<JourneyWorkspace> {
  const supabase = requireClient(client);
  const [journeysResult, sharesResult, orgsRpcResult] = await Promise.all([
    supabase.from("commuter_journeys").select("id, corridor_name, status, started_at, ended_at, provenance").order("started_at", { ascending: false }),
    supabase.from("journey_employer_shares").select("id, journey_id, org_id, status, shared_at, stopped_at"),
    supabase.rpc("get_commuter_organisations"),
  ]);
  if (journeysResult.error) throw new Error("Your journeys could not be loaded. Try again.");

  let orgs: OrganisationRow[] = [];
  if (!orgsRpcResult.error && Array.isArray(orgsRpcResult.data)) {
    orgs = (orgsRpcResult.data as unknown[]).filter(
      (org): org is OrganisationRow =>
        typeof org === "object" &&
        org !== null &&
        typeof (org as Record<string, unknown>).id === "string" &&
        typeof (org as Record<string, unknown>).name === "string"
    );
  } else {
    const orgsResult = await supabase.from("organisations").select("id, name").order("name");
    orgs = (orgsResult.data ?? []).filter(
      (org): org is OrganisationRow => typeof org?.id === "string" && typeof org?.name === "string"
    );
  }
  const orgNames = new Map(orgs.map((org) => [org.id, org.name]));
  const shareRows = (sharesResult.data ?? []) as Omit<ShareRow, "org_name">[];

  const journeys = (journeysResult.data ?? []).filter(isJourneyRow).map((journey) => ({
    ...journey,
    provenance: "simulated" as const,
    ended_at: (journey as JourneyRow).ended_at ?? null,
    shares: shareRows
      .filter((share) => share.journey_id === journey.id)
      .map((share) => ({ ...share, org_name: orgNames.get(share.org_id) ?? "Organisation" })),
  }));

  return { journeys, organisations: orgs };
}

export async function startJourney(client: SupabaseClient | null, corridorName = DEMO_CORRIDOR_NAME): Promise<string> {
  const { data, error } = await requireClient(client).rpc("start_commuter_journey", { p_corridor_name: corridorName });
  if (error) throw new Error("The journey could not be started. Try again.");
  const journeyId = (data as { journeyId?: unknown } | null)?.journeyId;
  if (typeof journeyId !== "string") throw new Error("The journey could not be started. Try again.");
  return journeyId;
}

export async function endJourney(client: SupabaseClient | null, journeyId: string): Promise<void> {
  const { error } = await requireClient(client).rpc("end_commuter_journey", { p_journey_id: journeyId });
  if (error) throw new Error("The journey could not be ended. Try again.");
}

export async function shareJourney(client: SupabaseClient | null, journeyId: string, orgId: string): Promise<void> {
  const { error } = await requireClient(client).rpc("share_commuter_journey", { p_journey_id: journeyId, p_org_id: orgId });
  if (error) throw new Error("Sharing could not be confirmed. Nothing was shared; try again.");
}

export async function stopJourneyShare(client: SupabaseClient | null, journeyId: string, orgId: string): Promise<void> {
  const { error } = await requireClient(client).rpc("stop_sharing_commuter_journey", { p_journey_id: journeyId, p_org_id: orgId });
  if (error) throw new Error("Sharing could not be stopped. Try again.");
}

// Exactly what an employer can see. Keep in step with the server's read_employer_shared_journeys fields.
export function sharePreviewLines(orgName: string): string[] {
  return [
    `Recipient: ${orgName}`,
    "Shared: the corridor name, whether the journey is active or ended, and the time you shared it.",
    "Not shared: exact coordinates, GPS points, route history, or your device identity.",
    "Delay is not measured yet, so no delay figure is shared.",
    "You can stop sharing at any time from this screen.",
  ];
}
