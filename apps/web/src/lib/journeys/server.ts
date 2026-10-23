import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommuterJourney, EmployerSharedJourney } from "./rules";

export async function getCommuterJourneys(supabase: SupabaseClient): Promise<CommuterJourney[]> {
  const { data: journeys, error } = await supabase
    .from("commuter_journeys")
    .select(`
      id,
      corridor_id,
      corridor_name,
      status,
      started_at,
      ended_at,
      provenance
    `)
    .order("started_at", { ascending: false });

  if (error || !journeys) {
    return [];
  }

  const { data: shares } = await supabase
    .from("journey_employer_shares")
    .select("id, journey_id, org_id, status, shared_at, stopped_at, provenance");

  const { data: orgs } = await supabase.from("organisations").select("id, name");
  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return journeys.map((j) => ({
    ...j,
    shares: (shares ?? [])
      .filter((s) => s.journey_id === j.id)
      .map((s) => ({
        ...s,
        org_name: orgMap.get(s.org_id) ?? "Unknown Organisation",
      })),
  }));
}

export async function startCommuterJourney(
  supabase: SupabaseClient,
  corridorName = "Mangaluru Central Demonstration Corridor"
): Promise<{ ok: boolean; journeyId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("start_commuter_journey", {
    p_corridor_name: corridorName,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to start journey" };
  }
  return { ok: true, journeyId: (data as { journeyId?: string }).journeyId };
}

export async function endCommuterJourney(
  supabase: SupabaseClient,
  journeyId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("end_commuter_journey", {
    p_journey_id: journeyId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function shareJourneyWithEmployer(
  supabase: SupabaseClient,
  journeyId: string,
  orgId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("share_commuter_journey", {
    p_journey_id: journeyId,
    p_org_id: orgId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function stopSharingJourneyWithEmployer(
  supabase: SupabaseClient,
  journeyId: string,
  orgId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("stop_sharing_commuter_journey", {
    p_journey_id: journeyId,
    p_org_id: orgId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getEmployerSharedJourneys(
  supabase: SupabaseClient,
  orgId: string
): Promise<EmployerSharedJourney[]> {
  const { data, error } = await supabase.rpc("read_employer_shared_journeys", {
    p_org_id: orgId,
  });

  if (error || !Array.isArray(data)) {
    return [];
  }
  return data as EmployerSharedJourney[];
}

export async function getAvailableOrganisations(
  supabase: SupabaseClient
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase.from("organisations").select("id, name").order("name");
  return data ?? [];
}
