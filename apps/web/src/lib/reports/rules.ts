export const reportCategories = {
  accident: "Accident",
  road_repair: "Road repair / construction",
  festival: "Festival / public event",
  strike: "Strike / protest",
  vip_movement: "VIP movement",
  landslide: "Landslide",
  heavy_rain: "Heavy rain",
  flood: "Flood / waterlogging",
  signal_failure: "Traffic signal failure",
  breakdown: "Vehicle breakdown",
  road_closed: "Road closure",
  bridge_maintenance: "Bridge / road maintenance",
  police_restriction: "Police / security restrictions",
  fallen_tree: "Fallen tree / hazard",
  heavy_traffic: "Heavy traffic / congestion",
  other: "Other",
  unknown: "Unknown",
} as const;
export type ReportCategory = keyof typeof reportCategories;

export const reportCategoryIcons: Record<ReportCategory, string> = {
  accident: "💥",
  road_repair: "🚧",
  festival: "🎪",
  strike: "🪧",
  vip_movement: "🚔",
  landslide: "⛰️",
  heavy_rain: "🌧️",
  flood: "🌊",
  signal_failure: "🚦",
  breakdown: "🚗",
  road_closed: "⛔",
  bridge_maintenance: "🌉",
  police_restriction: "🛡️",
  fallen_tree: "🌲",
  heavy_traffic: "🚙",
  other: "⚠️",
  unknown: "❓",
};
export const reportDirections = {
  "primary-west": "outbound", "primary-east": "outbound", "alternative-west": "outbound",
  "alternative-east": "outbound", "primary-west-inbound": "inbound",
} as const;
export type ReportSegment = keyof typeof reportDirections;
export type ReportInput = {
  source_id: string; request_id: string; segment_id: ReportSegment; direction: "inbound" | "outbound";
  category: ReportCategory; observed_at: string;
};
export type PublicReport = Omit<ReportInput, "source_id" | "request_id"> & {
  id: string; episode_id: string; received_at: string; provenance: "simulated"; location_provenance: "manual";
};
export type ReportSource = { id: string; kind: "account" | "guest"; expires_at: string | null };
export const reportFailures = ["invalid", "disabled", "expired", "identity_changed", "conflict", "rate_limited",
  "unavailable_segment", "denied", "unavailable", "unknown", "not_found", "unconfigured"] as const;
export type ReportFailure = typeof reportFailures[number];
export type PrepareResult = { status: "ready"; source: ReportSource; read_at: string } | { status: ReportFailure };
export type SubmitResult = { status: "accepted"; report: PublicReport; replayed: boolean } | { status: ReportFailure };

function invalid(): never { throw new Error("Invalid report data."); }
function record(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) return invalid();
  return value;
}
export function reportUuid(input: unknown): string {
  if (typeof input !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input)) return invalid();
  return input;
}
function canonicalTime(input: unknown): string {
  if (typeof input !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)
    || !Number.isFinite(Date.parse(input)) || new Date(input).toISOString() !== input) return invalid();
  return input;
}
export function reportTimestamp(input: unknown): string {
  if (typeof input !== "string") return invalid();
  const match = /^(20\d{2}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(input);
  if (!match) return invalid();
  const local = `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(3, "0").slice(0, 3)}Z`;
  canonicalTime(local);
  const hours = Number(match[6] ?? 0), minutes = Number(match[7] ?? 0);
  if (hours > 15 || minutes > 59) return invalid();
  const offset = (hours * 60 + minutes) * 60000 * (match[5] === "-" ? -1 : 1);
  return canonicalTime(new Date(Date.parse(local) - offset).toISOString());
}
function segment(input: unknown): ReportSegment {
  if (typeof input !== "string" || !Object.hasOwn(reportDirections, input)) return invalid();
  return input as ReportSegment;
}
function category(input: unknown): ReportCategory {
  if (typeof input !== "string" || !Object.hasOwn(reportCategories, input)) return invalid();
  return input as ReportCategory;
}
function reportFields(value: Record<string, unknown>) {
  const segment_id = segment(value.segment_id);
  const direction = reportDirections[segment_id];
  if (value.direction !== direction) return invalid();
  return { segment_id, direction, category: category(value.category) };
}
export function parseReportInput(input: unknown): ReportInput {
  const value = record(input, ["source_id", "request_id", "segment_id", "direction", "category", "observed_at"]);
  return { source_id: reportUuid(value.source_id), request_id: reportUuid(value.request_id),
    ...reportFields(value), observed_at: canonicalTime(value.observed_at) };
}
export function parsePublicReport(input: unknown): PublicReport {
  const value = record(input, ["id", "episode_id", "segment_id", "direction", "category", "observed_at", "received_at", "provenance", "location_provenance"]);
  if (value.provenance !== "simulated" || value.location_provenance !== "manual") return invalid();
  const observed_at = reportTimestamp(value.observed_at), received_at = reportTimestamp(value.received_at);
  if (observed_at > received_at) return invalid();
  return { id: reportUuid(value.id), episode_id: reportUuid(value.episode_id), ...reportFields(value), observed_at, received_at,
    provenance: "simulated", location_provenance: "manual" };
}
function failure(input: unknown): { status: ReportFailure } {
  const value = record(input, ["status"]);
  if (typeof value.status !== "string" || !reportFailures.includes(value.status as ReportFailure)) return invalid();
  return { status: value.status as ReportFailure };
}
export function parsePrepareResult(input: unknown): PrepareResult {
  if (!input || typeof input !== "object" || !("status" in input) || input.status !== "ready") return failure(input);
  const value = record(input, ["status", "source", "read_at"]);
  const source = record(value.source, ["id", "kind", "expires_at"]);
  if (source.kind !== "account" && source.kind !== "guest") return invalid();
  if ((source.kind === "account") !== (source.expires_at === null)) return invalid();
  return { status: "ready", source: { id: reportUuid(source.id), kind: source.kind,
    expires_at: source.expires_at === null ? null : reportTimestamp(source.expires_at) }, read_at: reportTimestamp(value.read_at) };
}
export function parseSubmitResult(input: unknown): SubmitResult {
  if (!input || typeof input !== "object" || !("status" in input) || input.status !== "accepted") return failure(input);
  const value = record(input, ["status", "report", "replayed"]);
  if (typeof value.replayed !== "boolean") return invalid();
  return { status: "accepted", report: parsePublicReport(value.report), replayed: value.replayed };
}
export function reportObservationValid(observedAt: string, readAt: string): boolean {
  try {
    const age = Date.parse(canonicalTime(readAt)) - Date.parse(canonicalTime(observedAt));
    return age >= 0 && age < 20 * 60000;
  } catch { return false; }
}
export function toReportLocalTime(utc: string): string {
  return new Date(Date.parse(reportTimestamp(utc)) + 330 * 60000).toISOString().slice(0, 16);
}
export function reportTimeFromLocal(input: unknown): string {
  if (typeof input !== "string" || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return invalid();
  const local = canonicalTime(`${input}:00.000Z`);
  return canonicalTime(new Date(Date.parse(local) - 330 * 60000).toISOString());
}
export function reportInputFromForm(form: FormData, sourceId: string, requestId: string): ReportInput {
  const fields = ["segment_id", "category", "observed_local"];
  if ([...form.keys()].some(key => !fields.includes(key)) || fields.some(key => form.getAll(key).length !== 1)) return invalid();
  const segment_id = segment(form.get("segment_id"));
  return parseReportInput({ source_id: sourceId, request_id: requestId, segment_id,
    direction: reportDirections[segment_id], category: form.get("category"), observed_at: reportTimeFromLocal(form.get("observed_local")) });
}
