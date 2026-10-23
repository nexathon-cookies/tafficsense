import type { ReportCategory, RouteCoordinate } from "@trafficsense/shared";
import { MobileApiError, requestJson } from "./request";
import {
  parseActiveIncidentsResponse,
  parseRouteResponse,
  parseSubmitIncidentResponse,
  parseTrafficSegmentsResponse,
} from "./response-parsers";

export {
  parseActiveIncidentsResponse,
  parseRouteResponse,
  parseSubmitIncidentResponse,
  parseTrafficSegmentsResponse,
} from "./response-parsers";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export const apiConfigurationError = apiBaseUrl
  ? null
  : "Traffic data is not configured for this mobile build.";

function throwApiError(response: Response, message: string): never {
  throw new MobileApiError(message, response.status);
}

export async function fetchActiveIncidents(signal?: AbortSignal) {
  if (!apiBaseUrl) throw new Error("Traffic data is not configured for this mobile build.");

  const { response, payload: rawPayload } = await requestJson<unknown>(
    `${apiBaseUrl}/api/incidents`,
    {},
    "Traffic service returned an invalid response.",
    { signal, retryGet: true },
  );
  const payload = parseActiveIncidentsResponse(rawPayload);

  if (!response.ok || !payload.ok) {
    throwApiError(response, payload.ok ? "Traffic service is unavailable." : payload.error);
  }

  return payload.incidents;
}

export async function submitIncident(
  input: {
    category: ReportCategory;
    lat: number;
    lng: number;
    gpsAccuracyM: number | null;
    gpsFixAt: string | null;
    note: string | null;
  },
  accessToken: string,
) {
  if (!apiBaseUrl) throw new Error("Traffic data is not configured for this mobile build.");

  const { response, payload: rawPayload } = await requestJson<unknown>(
    `${apiBaseUrl}/api/incidents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        category: input.category,
        lat: input.lat,
        lng: input.lng,
        gps_accuracy_m: input.gpsAccuracyM,
        gps_fix_at: input.gpsFixAt,
        note: input.note,
      }),
    },
    "Traffic service returned an invalid response.",
  );
  const payload = parseSubmitIncidentResponse(rawPayload);
  if (!response.ok || !payload.ok) {
    throwApiError(response, payload.ok ? "Incident submission is unavailable." : payload.error);
  }
  return payload;
}

export async function fetchRoute(start: RouteCoordinate, destination: RouteCoordinate) {
  if (!apiBaseUrl) throw new Error("Traffic data is not configured for this mobile build.");
  if (![...start, ...destination].every((value) => Number.isFinite(value))) {
    throw new Error("Enter valid start and destination coordinates.");
  }

  const { response, payload: rawPayload } = await requestJson<unknown>(
    `${apiBaseUrl}/api/route`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, destination }),
    },
    "Route service returned an invalid response.",
  );
  const payload = parseRouteResponse(rawPayload);
  if (!response.ok || !payload.ok) {
    throwApiError(response, payload.ok ? "Route service is unavailable." : payload.error);
  }
  return payload.routes;
}

export async function fetchTrafficSegments(signal?: AbortSignal) {
  if (!apiBaseUrl) throw new Error("Traffic data is not configured for this mobile build.");

  const { response, payload: rawPayload } = await requestJson<unknown>(
    `${apiBaseUrl}/api/traffic`,
    {},
    "Traffic service returned an invalid response.",
    { signal, retryGet: true },
  );
  const payload = parseTrafficSegmentsResponse(rawPayload);
  if (!response.ok || !payload.ok) {
    throwApiError(response, payload.ok ? "Traffic service is unavailable." : payload.error);
  }
  return payload;
}
