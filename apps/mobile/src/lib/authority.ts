import type { AuthorityNotificationItem, LiveIncident } from "@trafficsense/shared";
import { MobileApiError, requestJson } from "./request";
import { parseActiveIncidentsResponse, parseAuthorityHistoryResponse, type AuthorityHistoryItem } from "./response-parsers";

export type AuthorityIncidentAction = "confirm" | "resolve" | "reject";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

function parseError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("ok" in value)) return null;
  const payload = value as { ok?: unknown; error?: unknown };
  return payload.ok === false && typeof payload.error === "string" ? payload.error : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authorizedRequest<T>(
  path: string,
  accessToken: string,
  invalidResponseMessage: string,
  method: "GET" | "PATCH" = "GET",
  body?: Record<string, string>,
): Promise<{ response: Response; payload: T }> {
  if (!apiBaseUrl) throw new Error("Traffic service is not configured for this mobile build.");
  const { response, payload } = await requestJson<T>(
    `${apiBaseUrl}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    invalidResponseMessage,
    { retryGet: method === "GET" },
  );
  return { response, payload };
}

function throwResponseError(response: Response, payload: unknown, fallback: string): never {
  const message = parseError(payload);
  throw new MobileApiError(message ?? fallback, response.status);
}

export async function fetchAuthorityIncidents(accessToken: string): Promise<LiveIncident[]> {
  const { response, payload: rawPayload } = await authorizedRequest<unknown>(
    "/api/incidents",
    accessToken,
    "Authority service returned an invalid incident response.",
  );
  const payload = parseActiveIncidentsResponse(rawPayload);
  if (!response.ok || !payload.ok) throwResponseError(response, payload, "Active incidents could not be loaded.");
  return payload.incidents;
}

export async function fetchAuthorityHistory(accessToken: string): Promise<AuthorityHistoryItem[]> {
  const { response, payload } = await authorizedRequest<unknown>(
    "/api/incidents?scope=authority-history",
    accessToken,
    "Authority service returned an invalid history response.",
  );
  if (!response.ok || parseError(payload)) throwResponseError(response, payload, "Authority history could not be loaded.");
  return parseAuthorityHistoryResponse(payload);
}

export async function updateAuthorityIncident(
  incidentId: string,
  action: AuthorityIncidentAction,
  accessToken: string,
): Promise<void> {
  const { response, payload } = await authorizedRequest<unknown>(
    "/api/incidents",
    accessToken,
    "Authority service returned an invalid review response.",
    "PATCH",
    { incident_id: incidentId, action },
  );
  if (!isRecord(payload) || payload.ok !== true) {
    throwResponseError(response, payload, "The incident review action could not be completed.");
  }
  if (!response.ok) throwResponseError(response, payload, "The incident review action could not be completed.");
}

export async function fetchAuthorityNotifications(
  accessToken: string,
  since?: string | null,
): Promise<AuthorityNotificationItem[]> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const { response, payload } = await authorizedRequest<unknown>(
    `/api/authority/notifications${query}`,
    accessToken,
    "Authority service returned an invalid notification response.",
  );
  if (!response.ok || parseError(payload)) throwResponseError(response, payload, "Notifications could not be loaded.");
  if (typeof payload === "object" && payload !== null && "notifications" in payload && Array.isArray((payload as { notifications: unknown }).notifications)) {
    return (payload as { notifications: AuthorityNotificationItem[] }).notifications;
  }
  return [];
}

export async function markAuthorityNotificationRead(
  accessToken: string,
  notificationId?: string | null,
  markAll = false,
): Promise<void> {
  const { response, payload } = await authorizedRequest<unknown>(
    "/api/authority/notifications",
    accessToken,
    "Authority service returned an invalid response.",
    "PATCH",
    notificationId ? { notification_id: notificationId } : markAll ? { mark_all: "true" } : {},
  );
  if (!response.ok) throwResponseError(response, payload, "Notification could not be updated.");
}
