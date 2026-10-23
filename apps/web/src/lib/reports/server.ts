import "server-only";
import { cookies, headers } from "next/headers";
import { authConfig, isAuthCookie, reportGuestCookieOptions } from "@/lib/auth/config";
import { createAuthClient, createReportGuestClient } from "@/lib/auth/server";
import { isRole } from "@/lib/auth/rules";
import {
  parsePrepareResult, parseReportInput, parseSubmitResult,
  type PrepareResult, type ReportFailure, type SubmitResult,
} from "./rules";

type ReportClient = Awaited<ReturnType<typeof createAuthClient>>;
type IdentityResult = { status: "ready"; client: ReportClient; kind: "account" | "guest" } | { status: ReportFailure };

export async function isSameOriginReportRequest() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin === origin && parsed.host === host;
  } catch {
    return false;
  }
}

export function parseReportCheckInput(input: unknown): { source_id: string; request_id: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid acknowledgement input.");
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (keys.length !== 2 || !keys.includes("source_id") || !keys.includes("request_id") ||
      typeof record.source_id !== "string" || !uuid.test(record.source_id) ||
      typeof record.request_id !== "string" || !uuid.test(record.request_id)) {
    throw new Error("Invalid acknowledgement input.");
  }
  return { source_id: record.source_id, request_id: record.request_id };
}

async function resolveReportIdentity(prepareMode?: "account" | "guest"): Promise<IdentityResult> {
  if (!authConfig()) return { status: "unconfigured" };
  try {
    const stored = (await cookies()).getAll();
    const hasAccount = stored.some(({ name }) => isAuthCookie(name));
    const hasGuest = stored.some(({ name }) => isAuthCookie(name, reportGuestCookieOptions.name));
    if (!hasAccount && (prepareMode === "account" || (!hasGuest && prepareMode !== "guest"))) {
      return { status: "expired" };
    }
    const kind = hasAccount ? "account" : "guest";
    const client = hasAccount ? await createAuthClient(true) : await createReportGuestClient();
    if (!hasAccount && !hasGuest) {
      // Identity cookies must reach the browser before a separate submission request.
      const { error } = await client.auth.signInAnonymously();
      if (error) return { status: error.status === 429 ? "rate_limited" : "unavailable" };
    }
    const { data, error } = await client.auth.getUser();
    if (error) {
      return { status: error.status === 400 || error.status === 401 || error.status === 403 ? "expired" : "unavailable" };
    }
    if (!data.user) return { status: "expired" };
    if (kind === "guest" ? data.user.is_anonymous !== true : data.user.is_anonymous === true) {
      return { status: "denied" };
    }
    if (kind === "account") {
      const profile = await client.from("profiles").select("role").eq("id", data.user.id).single();
      if (profile.error || !isRole(profile.data?.role)) return { status: "unavailable" };
    }
    return { status: "ready", client, kind };
  } catch {
    return { status: "unavailable" };
  }
}

function rpcFailure(error: { code?: string }, status: number, mutation: boolean): { status: ReportFailure } {
  if (error.code === "42501" || status === 401 || status === 403) return { status: "denied" };
  // A lost mutation response is not evidence that its transaction rolled back.
  return { status: mutation ? "unknown" : "unavailable" };
}

export async function prepareReportSource(mode: "account" | "guest"): Promise<PrepareResult> {
  if (mode !== "account" && mode !== "guest") return { status: "invalid" };
  const identity = await resolveReportIdentity(mode);
  if (identity.status !== "ready") return identity;
  try {
    const { data, error, status } = await identity.client.rpc("prepare_report_source");
    if (error) return rpcFailure(error, status, true);
    const result = parsePrepareResult(data);
    if (result.status === "ready" && result.source.kind !== identity.kind) return { status: "unavailable" };
    return result;
  } catch {
    return { status: "unknown" };
  }
}

export async function submitTrafficReport(input: unknown): Promise<SubmitResult> {
  let parsed;
  try {
    parsed = parseReportInput(input);
  } catch {
    return { status: "invalid" };
  }
  const identity = await resolveReportIdentity();
  if (identity.status !== "ready") return identity;
  try {
    const { data, error, status } = await identity.client.rpc("submit_traffic_report", { p_input: parsed });
    if (error) return rpcFailure(error, status, true);
    return parseSubmitResult(data);
  } catch {
    return { status: "unknown" };
  }
}

export async function readReportAcknowledgement(input: unknown): Promise<SubmitResult> {
  let parsed;
  try {
    parsed = parseReportCheckInput(input);
  } catch {
    return { status: "invalid" };
  }
  const identity = await resolveReportIdentity();
  if (identity.status !== "ready") return identity;
  try {
    const { data, error, status } = await identity.client.rpc("get_report_acknowledgement", {
      p_source_id: parsed.source_id, p_request_id: parsed.request_id,
    });
    if (error) return rpcFailure(error, status, false);
    const result = parseSubmitResult(data);
    if (result.status === "accepted" && !result.replayed) return { status: "unavailable" };
    return result;
  } catch {
    return { status: "unavailable" };
  }
}
