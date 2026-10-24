import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authorityUpdateIncident, submitIncidentReport, getActiveLiveIncidents, getAuthorityIncidentHistory, type SubmitIncidentInput } from "@/lib/incidents/server";
import { reportCategories, type ReportCategory } from "@/lib/reports/rules";
import { authConfig, authCookieOptions, authFetch } from "@/lib/auth/config";
import { createAuthClient } from "@/lib/auth/server";

async function getSupabase(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const config = authConfig();
    if (!config) throw new Error("Authentication is not configured.");
    return createServerClient(config.url, config.key, {
      cookieOptions: authCookieOptions,
      global: {
        headers: { Authorization: authorization },
        fetch: authFetch,
      },
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    });
  }
  return createAuthClient(true);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase(req);
    if (new URL(req.url).searchParams.get("scope") === "authority-history") {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) {
        return NextResponse.json({ ok: false, error: "Authority sign-in is required." }, { status: 401 });
      }
      const history = await getAuthorityIncidentHistory(supabase);
      return NextResponse.json({ ok: true, history });
    }
    const incidents = await getActiveLiveIncidents(supabase);
    return NextResponse.json({ ok: true, incidents });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch incidents";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase(req);

    // Live corroboration requires a named account; anonymous sessions cannot count toward L3.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.is_anonymous) {
      return NextResponse.json(
        { ok: false, error: "Sign in with a commuter account to submit an incident. Anonymous reports cannot establish corroboration." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { category, lat, lng, gps_accuracy_m, gps_fix_at, note, l5_verified, l5_summary, l5_photo_data_url, l5_confidence_tier } = body;

    if (
      typeof category !== "string" ||
      !Object.hasOwn(reportCategories, category) ||
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      typeof lng !== "number" ||
      !Number.isFinite(lng)
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: category, lat, lng" },
        { status: 400 }
      );
    }

    const input: SubmitIncidentInput = {
      category: category as ReportCategory,
      lat,
      lng,
      gps_accuracy_m: typeof gps_accuracy_m === "number" ? gps_accuracy_m : null,
      gps_fix_at: typeof gps_fix_at === "string" ? gps_fix_at : null,
      note: typeof note === "string" ? note.slice(0, 300) : null,
      l5_verified: l5_verified === true,
      l5_summary: typeof l5_summary === "string" ? l5_summary.slice(0, 160) : null,
      l5_photo_data_url:
        typeof l5_photo_data_url === "string" &&
        l5_photo_data_url.startsWith("data:image/") &&
        l5_photo_data_url.length <= 250000
          ? l5_photo_data_url
          : null,
      l5_confidence_tier:
        l5_confidence_tier === "high" || l5_confidence_tier === "moderate" || l5_confidence_tier === "low"
          ? l5_confidence_tier
          : null,
    };

    const result = await submitIncidentReport(supabase, input);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const incidentId = body?.incident_id;
    const action = body?.action;
    if (
      typeof incidentId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incidentId) ||
      (action !== "confirm" && action !== "resolve" && action !== "reject")
    ) {
      return NextResponse.json({ ok: false, error: "A valid incident and review action are required." }, { status: 400 });
    }

    const supabase = await getSupabase(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return NextResponse.json({ ok: false, error: "Authority sign-in is required." }, { status: 401 });
    }

    const result = await authorityUpdateIncident(supabase, incidentId, action);
    return NextResponse.json(result, { status: result.ok ? 200 : 403 });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not update this incident." }, { status: 500 });
  }
}
