import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportCategory } from "@/lib/reports/rules";

export type LiveIncident = {
  id: string;
  category: ReportCategory;
  lat: number;
  lng: number;
  status: "open" | "resolved" | "expired";
  level: "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
  level_reason: string;
  first_reported_at: string;
  last_confirmed_at: string;
  provenance: "reported" | "verified" | "authority";
  report_count: number;
  photo_data_url?: string | null;
  photo_confidence?: string | null;
};

export type AuthorityNotificationItem = {
  id: string;
  incident_id: string;
  category: string;
  landmark: string;
  lat: number;
  lng: number;
  has_photo: boolean;
  photo_summary: string | null;
  level: "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
  reporter_email: string | null;
  is_read: boolean;
  created_at: string;
};

export const MANGALURU_LANDMARKS: readonly { name: string; lat: number; lng: number }[] = [
  { name: "Hampankatta (City Centre)", lat: 12.868, lng: 74.842 },
  { name: "Lalbagh Junction (MG Road)", lat: 12.877, lng: 74.846 },
  { name: "KSRTC Bus Stand (Bejai)", lat: 12.885, lng: 74.848 },
  { name: "Ladyhill Circle", lat: 12.894, lng: 74.841 },
  { name: "Bunts Hostel Circle", lat: 12.872, lng: 74.849 },
  { name: "Jyoti (Ambedkar) Circle", lat: 12.871, lng: 74.845 },
  { name: "Nanthoor Junction", lat: 12.874, lng: 74.865 },
  { name: "Pumpwell (Mahaveera) Circle", lat: 12.858, lng: 74.862 },
  { name: "Kottara Chowki", lat: 12.908, lng: 74.838 },
  { name: "Kadri Park / Circuit House", lat: 12.882, lng: 74.858 },
  { name: "Mangaluru Central Railway", lat: 12.864, lng: 74.839 },
  { name: "Mangalore International Airport", lat: 12.961, lng: 74.890 },
];

export function resolveNearestLandmark(lat: number, lng: number): string {
  let closest = MANGALURU_LANDMARKS[0];
  let minDistanceM = Number.POSITIVE_INFINITY;

  for (const landmark of MANGALURU_LANDMARKS) {
    const dLat = (lat - landmark.lat) * 111_000;
    const dLng = (lng - landmark.lng) * 108_200;
    const distanceM = Math.sqrt(dLat * dLat + dLng * dLng);
    if (distanceM < minDistanceM) {
      minDistanceM = distanceM;
      closest = landmark;
    }
  }

  if (minDistanceM < 300) {
    return `Near ${closest.name}`;
  }
  if (minDistanceM < 1500) {
    return `${closest.name} Corridor`;
  }
  const km = (minDistanceM / 1000).toFixed(1);
  return `${closest.name} area (~${km} km)`;
}

export type SubmitIncidentInput = {
  category: ReportCategory;
  lat: number;
  lng: number;
  gps_accuracy_m?: number | null;
  gps_fix_at?: string | null;
  note?: string | null;
  /** True when the client obtained a genuine L5 AI vision result for an attached photo. */
  l5_verified?: boolean;
  l5_summary?: string | null;
  l5_photo_data_url?: string | null;
  l5_confidence_tier?: string | null;
  reporter_email?: string | null;
};

export type SubmitIncidentResult =
  | { ok: true; incident_id: string; level: string; level_reason: string; distinct_reporters?: number }
  | { ok: false; error: string };

export type AuthorityIncidentHistoryItem = {
  id: string;
  incident_id: string;
  action: "confirm_incident" | "resolve_incident" | "reject_incident";
  category: ReportCategory;
  created_at: string;
  details: Record<string, string>;
};

/**
 * Submits an incident report from a user, automatically clustering with existing
 * incidents within 300m and evaluating the L1-L3 verification ladder.
 */
export async function submitIncidentReport(
  supabase: SupabaseClient,
  input: SubmitIncidentInput
): Promise<SubmitIncidentResult> {
  const { data, error } = await supabase.rpc("submit_live_incident_report", {
    p_category: input.category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_gps_accuracy_m: input.gps_accuracy_m ?? null,
    p_gps_fix_at: input.gps_fix_at ?? null,
    p_note: input.note ?? null,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to submit incident report" };
  }

  const result = data as SubmitIncidentResult;
  if (!result.ok) {
    return result;
  }

  // L5: promote to visual corroboration unless an authority already confirmed (L6).
  let finalLevel = result.level;
  let finalReason = result.level_reason;

  if (result.incident_id && input.l5_verified) {
    const { data: promoted, error: promoteError } = await supabase.rpc("apply_incident_photo_verification", {
      p_incident_id: result.incident_id,
      p_summary: input.l5_summary ?? null,
      p_photo_data_url: input.l5_photo_data_url ?? null,
      p_confidence_tier: input.l5_confidence_tier ?? "moderate",
    });
    if (!promoteError && promoted?.ok) {
      finalLevel = "L5";
      finalReason = (promoted.level_reason as string) || "L5 AI Vision corroborated photo evidence";
    }
  }

  // Real-time Authority Dispatch Notification
  if (result.incident_id) {
    const landmark = resolveNearestLandmark(input.lat, input.lng);
    const hasPhoto = Boolean(input.l5_verified);
    const photoSummary = input.l5_summary ?? (hasPhoto ? "L5 Vision corroborated photo attached" : null);

    try {
      await supabase.rpc("dispatch_authority_notification", {
        p_incident_id: result.incident_id,
        p_category: input.category,
        p_lat: input.lat,
        p_lng: input.lng,
        p_landmark: landmark,
        p_has_photo: hasPhoto,
        p_photo_summary: photoSummary,
        p_level: finalLevel || "L1",
        p_reporter_email: input.reporter_email ?? null,
      });
    } catch {
      // Best-effort notification logging; never fail the user report submission
    }
  }

  return { ...result, level: finalLevel, level_reason: finalReason };
}

/**
 * Reads all currently active, non-expired live incidents.
 */
export async function getActiveLiveIncidents(
  supabase: SupabaseClient
): Promise<LiveIncident[]> {
  const { data, error } = await supabase.rpc("read_active_live_incidents");
  if (error || !Array.isArray(data)) {
    return [];
  }
  return data as LiveIncident[];
}

/**
 * Allows a traffic authority to confirm (L6), resolve, or reject an incident.
 */
export async function authorityUpdateIncident(
  supabase: SupabaseClient,
  incidentId: string,
  action: "confirm" | "resolve" | "reject"
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("authority_update_incident", {
    p_incident_id: incidentId,
    p_action: action,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? `Failed to ${action} incident` };
  }

  return { ok: true };
}

export async function getAuthorityIncidentHistory(
  supabase: SupabaseClient
): Promise<AuthorityIncidentHistoryItem[]> {
  const { data, error } = await supabase.rpc("read_authority_incident_history", { p_limit: 20 });
  return error || !Array.isArray(data) ? [] : data as AuthorityIncidentHistoryItem[];
}

/**
 * Reads real-time authority dispatch notifications for incidents spotted across corridors.
 */
export async function getAuthorityNotifications(
  supabase: SupabaseClient,
  since?: string | null,
  limit = 40
): Promise<AuthorityNotificationItem[]> {
  const { data, error } = await supabase.rpc("read_authority_notifications", {
    p_since: since && Number.isFinite(new Date(since).getTime()) ? since : null,
    p_limit: limit,
  });

  if (error || !data || !Array.isArray(data.notifications)) {
    return [];
  }
  return data.notifications as AuthorityNotificationItem[];
}

/**
 * Marks authority notifications as read.
 */
export async function markAuthorityNotificationAsRead(
  supabase: SupabaseClient,
  notificationId?: string | null,
  markAll = false
): Promise<{ ok: boolean; affected: number }> {
  const { data, error } = await supabase.rpc("mark_authority_notification_read", {
    p_notification_id: notificationId ?? null,
    p_all: markAll,
  });

  if (error || !data) {
    return { ok: false, affected: 0 };
  }
  return { ok: Boolean(data.ok), affected: Number(data.affected ?? 0) };
}
