"use server";

import { revalidatePath } from "next/cache";
import { parseReportInput, type PrepareResult, type SubmitResult } from "@/lib/reports/rules";
import {
  isSameOriginReportRequest, parseReportCheckInput, prepareReportSource,
  readReportAcknowledgement, submitTrafficReport,
} from "@/lib/reports/server";

export async function prepareReport(mode: "account" | "guest"): Promise<PrepareResult> {
  if (!await isSameOriginReportRequest()) return { status: "denied" };
  if (mode !== "account" && mode !== "guest") return { status: "invalid" };
  return prepareReportSource(mode);
}

export async function submitReport(input: unknown): Promise<SubmitResult> {
  if (!await isSameOriginReportRequest()) return { status: "denied" };
  let parsed;
  try {
    parsed = parseReportInput(input);
  } catch {
    return { status: "invalid" };
  }
  const result = await submitTrafficReport(parsed);
  if (result.status === "accepted") revalidatePath("/traffic");
  return result;
}

export async function checkReport(input: unknown): Promise<SubmitResult> {
  if (!await isSameOriginReportRequest()) return { status: "denied" };
  let parsed;
  try {
    parsed = parseReportCheckInput(input);
  } catch {
    return { status: "invalid" };
  }
  const result = await readReportAcknowledgement(parsed);
  if (result.status === "accepted") revalidatePath("/traffic");
  return result;
}
