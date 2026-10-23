export function authConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export const authCookieOptions = {
  name: "trafficsense-auth",
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
};

export const reportGuestCookieOptions = {
  ...authCookieOptions,
  name: "trafficsense-report-guest",
};

export function isAuthCookie(name: string, namespace = authCookieOptions.name) {
  return name === namespace || (name.startsWith(`${namespace}.`) && /^\d+$/.test(name.slice(namespace.length + 1)));
}

export const authFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "no-store",
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
