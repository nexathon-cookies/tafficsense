import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, authCookieOptions, authFetch, isAuthCookie } from "./lib/auth/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  const config = authConfig();
  if (!config) return response;
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: authCookieOptions,
    global: { fetch: authFetch },
    cookies: {
      getAll: () => request.cookies.getAll().filter(({ name }) => isAuthCookie(name)),
      setAll: (updates) => {
        const accountUpdates = updates.filter(({ name }) => isAuthCookie(name));
        for (const { name, value } of accountUpdates) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store, max-age=0");
        for (const { name, value, options } of accountUpdates) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/workspace/:path*", "/employer/:path*", "/authority/:path*", "/admin/:path*", "/login", "/register"],
};
