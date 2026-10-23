import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

const state = {};
globalThis.__reportServerTest = state;
const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
const source = "09dcbb78-060d-4ce2-8800-339a04771fbc";
const request = "a0866416-8ea3-4f6a-81f9-6f855cd73947";
const episode = "66ee2d39-c477-42ad-a6b8-086781da03de";
const now = "2026-10-15T04:20:00.000Z";
const input = () => ({ source_id: source, request_id: request, segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: now });
const ready = kind => ({ status: "ready", source: { id: source, kind, expires_at: kind === "guest" ? "2026-10-16T04:20:00.000Z" : null }, read_at: now });
const accepted = replayed => ({ status: "accepted", report: { id: request, episode_id: episode, segment_id: "primary-west", direction: "outbound", category: "unknown", observed_at: now, received_at: now, provenance: "simulated", location_provenance: "manual" }, replayed });
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/src/")) {
      const mocks = {
        "server-only": "export {};",
        "react": "export const cache = fn => fn;",
        "next/server": "export async function connection() {}",
        "next/navigation": "export function redirect(path) { throw new Error('redirect:' + path); }",
        "next/cache": "export function revalidatePath(path) { globalThis.__reportServerTest.revalidated.push(path); }",
        "next/headers": `export async function headers() { return globalThis.__reportServerTest.headers; }
          export async function cookies() { return globalThis.__reportServerTest.store; }`,
        "@supabase/ssr": `export function createServerClient(url, key, options) {
          const s = globalThis.__reportServerTest;
          const kind = options.cookieOptions.name === 'trafficsense-auth' ? 'account' : 'guest';
          s.clients.push({ kind, options, url, key });
          const response = () => s.users[kind];
          return {
            auth: {
              getUser: async () => { s.verified.push(kind); if (s.authThrow) throw new Error('private diagnostic'); return response(); },
              signInAnonymously: async () => {
                s.signups++;
                if (s.signupError) return { data: {}, error: s.signupError };
                options.cookies.setAll([{ name: options.cookieOptions.name, value: 'synthetic-session', options: options.cookieOptions }]);
                return { data: { user: response().data.user, session: {} }, error: null };
              },
              signInWithPassword: async () => ({ error: s.loginError }),
              signUp: async () => ({ data: { session: {} }, error: s.loginError }),
              signOut: async () => ({ error: s.logoutError }),
            },
            from: () => ({ select: () => ({ eq: () => ({ single: async () => { s.profiles++; return s.profile; } }) }) }),
            rpc: async (name, args) => {
              s.calls.push({ kind, name, args });
              if (s.rpcThrow) throw new Error('private transport diagnostic');
              return { data: s.result, error: s.rpcError, status: s.rpcStatus };
            },
          };
        }`,
      };
      if (specifier in mocks) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
      if (specifier.startsWith("@/")) return nextResolve(new URL(`../apps/web/src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        if (!/\.[a-z]+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
after(() => {
  hooks.deregister(); delete globalThis.__reportServerTest;
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalEnv.key;
});
beforeEach(() => {
  Object.assign(state, {
    headers: new Headers({ origin: "http://localhost:3000", host: "localhost:3000" }),
    jar: [], writes: [], clients: [], calls: [], verified: [], revalidated: [], signups: 0, profiles: 0,
    users: {
      account: { data: { user: { id: "account-user", is_anonymous: false } }, error: null },
      guest: { data: { user: { id: "guest-user", is_anonymous: true } }, error: null },
    },
    profile: { data: { role: "commuter" }, error: null }, result: ready("guest"),
    rpcError: null, rpcStatus: 200, rpcThrow: false, authThrow: false, signupError: null, loginError: null, logoutError: null,
  });
  state.store = {
    getAll: () => state.jar,
    set: (name, value, options) => {
      const cookie = typeof name === "object" ? name : { ...options, name, value };
      state.writes.push(cookie);
      state.jar = state.jar.filter(item => item.name !== cookie.name);
      if (cookie.maxAge !== 0) state.jar.push({ name: cookie.name, value: cookie.value });
    },
  };
  process.env.SUPABASE_URL = "http://synthetic.invalid";
  process.env.SUPABASE_ANON_KEY = "synthetic-public-key";
});
const { prepareReport, submitReport, checkReport } = await import("../apps/web/src/app/reports/actions.ts");
const { createAuthClient, createReportGuestClient, getViewer, clearReportGuestCookies } = await import("../apps/web/src/lib/auth/server.ts");
const { authFetch } = await import("../apps/web/src/lib/auth/config.ts");
const { login, register, logout } = await import("../apps/web/src/app/auth-actions.ts");

function session(kind) { state.jar.push({ name: kind === "account" ? "trafficsense-auth.0" : "trafficsense-report-guest.0", value: "synthetic-session" }); }

test("report actions require a present exact same-host Origin before any identity work", async () => {
  for (const origin of [null, "null", "https://other.invalid", "http://localhost:3001", "http://localhost:3000/path", "http://user@localhost:3000"]) {
    if (origin === null) state.headers.delete("origin"); else state.headers.set("origin", origin);
    assert.deepEqual(await prepareReport("guest"), { status: "denied" });
    assert.deepEqual(await submitReport(input()), { status: "denied" });
    assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "denied" });
  }
  state.headers.set("origin", "http://other.invalid"); state.headers.set("x-forwarded-host", "other.invalid");
  assert.deepEqual(await prepareReport("guest"), { status: "denied" });
  assert.equal(state.clients.length, 0);
});

test("strict malformed action inputs are rejected before Auth or RPC", async () => {
  assert.deepEqual(await prepareReport("admin"), { status: "invalid" });
  for (const value of [null, {}, [], { ...input(), role: "admin" }, { ...input(), source_id: "bad" }, { ...input(), episode_id: episode }]) {
    assert.deepEqual(await submitReport(value), { status: "invalid" });
  }
  for (const value of [null, [], {}, input(), { source_id: source, request_id: request, user_id: source }, { source_id: "bad", request_id: request }]) {
    assert.deepEqual(await checkReport(value), { status: "invalid" });
  }
  assert.equal(state.clients.length, 0);
});

test("missing config and missing submission cookies never create identities", async () => {
  assert.deepEqual(await submitReport(input()), { status: "expired" });
  assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "expired" });
  assert.deepEqual(await prepareReport("account"), { status: "expired" });
  delete process.env.SUPABASE_URL;
  assert.deepEqual(await prepareReport("guest"), { status: "unconfigured" });
  assert.equal(state.signups, 0); assert.equal(state.calls.length, 0);
});

test("only explicit guest preparation signs in, verifies the user and establishes isolated HttpOnly cookies", async () => {
  assert.deepEqual(await prepareReport("guest"), ready("guest"));
  assert.equal(state.signups, 1); assert.deepEqual(state.verified, ["guest"]);
  assert.equal(state.profiles, 0);
  assert.ok(state.writes.every(cookie => cookie.name.startsWith("trafficsense-report-guest") && cookie.httpOnly && cookie.sameSite === "lax"));
  assert.deepEqual(state.calls, [{ kind: "guest", name: "prepare_report_source", args: undefined }]);
  assert.deepEqual(await prepareReport("guest"), ready("guest"));
  assert.equal(state.signups, 1);
  state.result = accepted(false);
  assert.deepEqual(await submitReport(input()), accepted(false));
  assert.deepEqual(state.calls.at(-1), { kind: "guest", name: "submit_traffic_report", args: { p_input: input() } });
  assert.deepEqual(state.revalidated, ["/traffic"]);
});

test("verified accounts of every valid role take precedence over guest preparation", async () => {
  session("account"); session("guest"); state.result = ready("account");
  for (const role of ["commuter", "employer", "authority", "admin"]) {
    state.profile.data.role = role;
    assert.deepEqual(await prepareReport("guest"), ready("account"));
  }
  assert.deepEqual(state.verified, ["account", "account", "account", "account"]);
  assert.equal(state.signups, 0); assert.equal(state.profiles, 4);
});

test("invalid account cookies and profile outages never fall back to a guest", async () => {
  session("account"); session("guest");
  state.users.account = { data: { user: null }, error: { status: 401, message: "private" } };
  assert.deepEqual(await prepareReport("guest"), { status: "expired" });
  state.users.account.error.status = 503;
  assert.deepEqual(await submitReport(input()), { status: "unavailable" });
  state.users.account = { data: { user: { id: "account", is_anonymous: false } }, error: null };
  state.profile.error = { message: "private profile outage" };
  assert.deepEqual(await prepareReport("guest"), { status: "unavailable" });
  assert.equal(state.signups, 0); assert.equal(state.calls.length, 0);
  assert.ok(state.verified.every(kind => kind === "account"));
});

test("anonymous users are rejected from private guards and account reporting even with a legacy profile", async () => {
  session("account"); state.users.account.data.user.is_anonymous = true;
  assert.equal(await getViewer(), null);
  assert.deepEqual(await prepareReport("account"), { status: "denied" });
  assert.equal(state.profiles, 0);
  state.users.account.data.user.is_anonymous = false;
  state.profile.error = { message: "outage" };
  await assert.rejects(getViewer(), /Account access unavailable/);
  state.users.account.error = { status: 503 };
  await assert.rejects(getViewer(), /Authentication service unavailable/);
});

test("expired or wrong-kind guest sessions never get recreated on preparation, retry, or check", async () => {
  session("guest");
  state.users.guest = { data: { user: null }, error: { status: 401 } };
  for (const call of [() => prepareReport("guest"), () => submitReport(input()), () => checkReport({ source_id: source, request_id: request })]) {
    assert.deepEqual(await call(), { status: "expired" });
  }
  state.users.guest = { data: { user: { id: "account", is_anonymous: false } }, error: null };
  assert.deepEqual(await prepareReport("guest"), { status: "denied" });
  assert.equal(state.signups, 0); assert.equal(state.calls.length, 0);
});

test("DB source binding and lifetime failures are passed through without source recreation", async () => {
  session("account");
  for (const status of ["identity_changed", "expired", "conflict", "rate_limited", "disabled", "unavailable_segment"]) {
    state.result = { status };
    assert.deepEqual(await submitReport(input()), { status });
  }
  assert.equal(state.signups, 0);
  assert.ok(state.calls.every(call => call.name === "submit_traffic_report" && call.args.p_input.source_id === source));
  assert.deepEqual(state.revalidated, []);
});

test("acknowledgement checks send only owner-scoped keys and revalidate only validated acceptance", async () => {
  session("guest"); state.result = accepted(true);
  assert.deepEqual(await checkReport({ source_id: source, request_id: request }), accepted(true));
  assert.deepEqual(state.calls.at(-1), { kind: "guest", name: "get_report_acknowledgement", args: { p_source_id: source, p_request_id: request } });
  state.result = { status: "not_found" };
  assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "not_found" });
  assert.deepEqual(state.revalidated, ["/traffic"]);
});

test("submit, replay and acknowledgement check preserve the database episode ID without sending membership", async () => {
  session("guest"); state.result = accepted(false);
  const submitted = await submitReport(input());
  assert.equal(submitted.report.episode_id, episode);
  state.result = accepted(true);
  const replayed = await submitReport(input());
  const checked = await checkReport({ source_id: source, request_id: request });
  assert.deepEqual(replayed.report, submitted.report);
  assert.deepEqual(checked.report, submitted.report);
  assert.deepEqual(state.calls.map(call => call.args), [{ p_input: input() }, { p_input: input() },
    { p_source_id: source, p_request_id: request }]);
  assert.deepEqual(state.revalidated, ["/traffic", "/traffic", "/traffic"]);
  for (const episode_id of [undefined, null, "bad"]) {
    state.result = accepted(true);
    if (episode_id === undefined) delete state.result.report.episode_id; else state.result.report.episode_id = episode_id;
    assert.deepEqual(await submitReport(input()), { status: "unknown" });
    assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "unavailable" });
  }
  assert.deepEqual(state.revalidated, ["/traffic", "/traffic", "/traffic"]);
});

test("mutation transport failures and malformed acknowledgements remain unknown; read failures unavailable", async () => {
  session("guest"); state.rpcThrow = true;
  assert.deepEqual(await submitReport(input()), { status: "unknown" });
  assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "unavailable" });
  state.rpcThrow = false; state.rpcError = { message: "private timeout diagnostic", code: "" }; state.rpcStatus = 0;
  assert.deepEqual(await submitReport(input()), { status: "unknown" });
  assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "unavailable" });
  state.rpcError = { code: "42501", message: "private permission detail" }; state.rpcStatus = 403;
  assert.deepEqual(await submitReport(input()), { status: "denied" });
  state.rpcError = null; state.rpcStatus = 200;
  for (const result of [null, {}, { ...accepted(false), token: "private" }]) {
    state.result = result;
    assert.deepEqual(await submitReport(input()), { status: "unknown" });
    assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "unavailable" });
  }
  assert.deepEqual(state.revalidated, []);
});

test("preparation validates source kind and provider envelopes without replacing expired sources", async () => {
  session("guest");
  state.result = ready("account");
  assert.deepEqual(await prepareReport("guest"), { status: "unavailable" });
  state.result = { ...ready("guest"), token: "private" };
  assert.deepEqual(await prepareReport("guest"), { status: "unknown" });
  state.result = { status: "expired" };
  assert.deepEqual(await prepareReport("guest"), { status: "expired" });
  state.rpcThrow = true;
  assert.deepEqual(await prepareReport("guest"), { status: "unknown" });
  assert.equal(state.signups, 0);
});

test("checks accept the same UUID versions as submissions and reject non-replayed acknowledgements", async () => {
  session("guest"); state.result = accepted(true);
  const requestId = "a0866416-8ea3-7f6a-81f9-6f855cd73947";
  assert.deepEqual(await checkReport({ source_id: source, request_id: requestId }), accepted(true));
  state.result = accepted(false);
  assert.deepEqual(await checkReport({ source_id: source, request_id: request }), { status: "unavailable" });
  assert.deepEqual(state.revalidated, ["/traffic"]);
});

test("guest signup rate limit and authentication failures stay sanitized", async () => {
  state.signupError = { status: 429, message: "private quota diagnostic" };
  assert.deepEqual(await prepareReport("guest"), { status: "rate_limited" });
  state.signupError = { status: 503, message: "private outage diagnostic" };
  assert.deepEqual(await prepareReport("guest"), { status: "unavailable" });
  state.signupError = null; state.authThrow = true;
  assert.deepEqual(await prepareReport("guest"), { status: "unavailable" });
  assert.equal(state.calls.length, 0);
});

test("cookie adapters cannot read or write the other namespace", async () => {
  session("account"); session("guest"); state.jar.push({ name: "unrelated", value: "keep" });
  await createAuthClient(true); await createReportGuestClient();
  for (const { kind, options } of state.clients) {
    const name = kind === "account" ? "trafficsense-auth" : "trafficsense-report-guest";
    assert.deepEqual(options.cookies.getAll().map(cookie => cookie.name), [`${name}.0`]);
    options.cookies.setAll([{ name: "unrelated", value: "bad", options: {} }]);
  }
  assert.deepEqual(state.writes, []);
  await clearReportGuestCookies();
  assert.deepEqual(state.jar.map(cookie => cookie.name), ["trafficsense-auth.0", "unrelated"]);
  assert.ok(state.writes.every(cookie => cookie.maxAge === 0 && cookie.httpOnly));
});

test("successful account changes and logout clear guest state without touching unrelated cookies", async () => {
  const form = new FormData(); form.set("email", "synthetic@example.test"); form.set("password", "synthetic-long-password");
  for (const action of [login, register]) {
    session("guest");
    await assert.rejects(action({}, form), /redirect:\/workspace/);
    assert.ok(!state.jar.some(cookie => cookie.name.startsWith("trafficsense-report-guest")));
  }
  session("account"); session("guest"); state.jar.push({ name: "unrelated", value: "keep" });
  state.logoutError = { message: "outage" };
  await assert.rejects(logout(), /redirect:\/login\?notice=revocation-unconfirmed/);
  assert.deepEqual(state.jar, [{ name: "unrelated", value: "keep" }]);
});

test("auth transport forces no-store and composes the existing abort signal with an eight-second deadline", async () => {
  const originalFetch = globalThis.fetch; const originalTimeout = AbortSignal.timeout;
  const timeouts = []; let received;
  try {
    AbortSignal.timeout = milliseconds => { timeouts.push(milliseconds); return originalTimeout(milliseconds); };
    globalThis.fetch = async (_url, init) => { received = init; return new Response("{}"); };
    const controller = new AbortController();
    await authFetch("http://synthetic.invalid", { cache: "force-cache", signal: controller.signal });
    assert.equal(received.cache, "no-store"); assert.deepEqual(timeouts, [8000]);
    controller.abort(); assert.equal(received.signal.aborted, true);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});
