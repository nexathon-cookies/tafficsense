import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authConfig, authCookieOptions, authFetch } from "@/lib/auth/config";
import { createAuthClient } from "@/lib/auth/server";
import { getAuthorityNotifications, markAuthorityNotificationAsRead } from "@/lib/incidents/server";

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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.is_anonymous) {
      return NextResponse.json(
        { ok: false, error: "Authority sign-in is required to access the dispatch queue." },
        { status: 401 }
      );
    }

    const searchParams = new URL(req.url).searchParams;
    const since = searchParams.get("since");
    const limit = searchParams.get("limit") ? Number.parseInt(searchParams.get("limit")!, 10) : 40;

    const notifications = await getAuthorityNotifications(supabase, since, limit);
    return NextResponse.json({ ok: true, notifications });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch authority notifications";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabase(req);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.is_anonymous) {
      return NextResponse.json(
        { ok: false, error: "Authority sign-in is required." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = typeof body.notification_id === "string" ? body.notification_id : null;
    const markAll = body.mark_all === true;

    const result = await markAuthorityNotificationAsRead(supabase, notificationId, markAll);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update notification";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
