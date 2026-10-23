import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authorityUpdateIncident, submitIncidentReport, getActiveLiveIncidents, getAuthorityIncidentHistory, type SubmitIncidentInput } from "@/lib/incidents/server";
import { reportCategories, type ReportCategory } from "@/lib/reports/rules";

async function getSupabase(req: NextRequest) {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_ANON_KEY!;

  const authorization = req.headers.get("authorization");
  return createServerClient(url, key, {
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
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
    const { category, lat, lng, gps_accuracy_m, gps_fix_at, note } = body;

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
