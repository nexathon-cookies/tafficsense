"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/server";
import {
  startCommuterJourney,
  endCommuterJourney,
  shareJourneyWithEmployer,
  stopSharingJourneyWithEmployer,
} from "@/lib/journeys/server";

export async function handleStartJourney(corridorName?: string): Promise<void> {
  const { supabase } = await requireViewer();
  await startCommuterJourney(supabase, corridorName);
  revalidatePath("/workspace");
}

export async function handleEndJourney(formData: FormData): Promise<void> {
  const journeyId = formData.get("journeyId") as string;
  if (!journeyId) return;

  const { supabase } = await requireViewer();
  await endCommuterJourney(supabase, journeyId);
  revalidatePath("/workspace");
}

export async function handleShareJourney(formData: FormData): Promise<void> {
  const journeyId = formData.get("journeyId") as string;
  const orgId = formData.get("orgId") as string;
  if (!journeyId || !orgId) return;

  const { supabase } = await requireViewer();
  await shareJourneyWithEmployer(supabase, journeyId, orgId);
  revalidatePath("/workspace");
  revalidatePath(`/employer/${orgId}`);
}

export async function handleStopSharing(formData: FormData): Promise<void> {
  const journeyId = formData.get("journeyId") as string;
  const orgId = formData.get("orgId") as string;
  if (!journeyId || !orgId) return;

  const { supabase } = await requireViewer();
  await stopSharingJourneyWithEmployer(supabase, journeyId, orgId);
  revalidatePath("/workspace");
  revalidatePath(`/employer/${orgId}`);
}
