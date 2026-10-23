# Local Authentication

This documents the foundation for [module 1](README.md): registration, password sign-in, sign-out, roles, and organisation boundaries. Traffic reporting, journeys, sharing, maps, and analytics are separate work. [Implementation Phase 1](implementation.md#phase-1--finish-authentication-verification) defines completion checks; actual verification and outstanding failures belong in [progress.md](progress.md). These run instructions are not a claim that every acceptance check has passed.

## Start the local demo

Requirements: Linux, Docker Engine 28 or newer with Compose, access to its Unix socket, and enough disk space for the Supabase Postgres image. All Node, pnpm, and Supabase CLI commands run in containers. The first image and package downloads require network access.

From the repository root:

```bash
bash scripts/local-supabase.sh start
bash scripts/local-supabase.sh seed
docker compose up --build -d --wait app
```

Open `http://localhost:3000`. For a production-mode local preview:

```bash
docker compose --profile production up --build -d --wait production
```

Open `http://localhost:3001`. Both use the same local database. Use one browser origin consistently; cookies are host-scoped rather than port-scoped, so localhost tabs on both ports share a login.

The start command applies pending local migrations and creates an ignored `.env.local`. The seed command creates six synthetic accounts: a commuter, employers belonging to two different organisations, an employer without membership for empty-state checks, a read-only authority, and an admin. Open **`supabase/.temp/demo-accounts.json` locally** for their generated emails and passwords. Never commit, paste into chat, or publish this file. Running seed again rotates these demo passwords and restores their assigned roles/memberships; it does not erase the database or promise to terminate every existing session.

New accounts created through the UI always start as commuters. Use synthetic email addresses and passwords only. Local email confirmation is disabled; email delivery, password recovery, OAuth, invitations, and hosted deployment are outside this foundation.

## Access rules

| Surface | Required access |
| --- | --- |
| `/`, `/demo`, `/login`, `/register` | Public; guest preview creates no session; signed-in users visiting login/register return to their account |
| `/traffic`, `/reports/new` | Public synthetic data; only explicit report preparation creates a guest identity, as described in [local reporting](reports.md) |
| `/workspace` | Authenticated non-anonymous account with an assigned database profile |
| `/employer` | Employer role; only assigned organisations are returned |
| `/employer/[orgId]` | Employer role and current membership; unavailable IDs return not found |
| `/authority` | Authority role; read-only foundation |
| `/admin` | Admin role; no browser seed/reset/role-assignment actions |

The server checks the authenticated user with Supabase Auth and reads the role from `profiles` on each request. User-editable metadata and submitted role fields cannot grant access. Database row-level security allows users to read their own profile, and employers to read their own memberships and organisations. Anonymous and authenticated clients have no write grants on these access tables. Admin does not imply employer access.

Authentication cookies are HTTP-only and SameSite=Lax. The Next.js proxy refreshes them, while page-level checks remain the authorization boundary. Private reads use no-store requests and wait for a real request before creating the authentication client; route-level loading states keep account navigation responsive. Sign-in and sign-out invalidate the application layout. Sign-out always clears this browser's auth cookies, including during a backend outage, without deleting unrelated cookies. When server revocation cannot be confirmed, the login page explains that limitation. Sign-out affects the current session; previously issued access tokens can remain valid through the backend's expiration-validation window, so this is not a claim of immediate revocation of copied tokens. Auth and database validators can enforce expiration at different times; the expiry scenario measures both separately.

Missing profiles and backend failures show an account-access error rather than private data. **Try again** uses the installed framework's `retry()` callback to fetch fresh server data. Removing or restoring profiles, roles or memberships is a server administration operation, not a browser self-service permission change.

No employee data or journey access follows from organisation membership. Future employer sharing still requires explicit commuter consent and per-read authorization.

## Containers and network isolation

Pinned Supabase CLI 2.120.0 runs with `SUPABASE_EXPERIMENTAL_STACK=0` in the opt-in `supabase` tooling service. It uses a pinned Docker 28.5.2 client. Only that one-off service has the Docker socket and host networking; dependency installation happens during its image build before socket access is granted. Socket access is effectively host-administrator access, not a sandbox.

The wrapper preserves the repository's host path for sibling-container bind mounts and derives the socket's numeric group. It checks the dedicated `trafficsense-nk_supabase` bridge and Docker engine version before CLI operations. The bridge defaults published ports to loopback. It is external to the app's Compose lifecycle.

The local Supabase project ID is `trafficsense-nk-local`, separate from application Compose project `trafficsense-nk`. Only Postgres, Auth, PostgREST, and Kong are needed. Studio, storage, realtime, mail, analytics, edge functions, and the pooler are disabled.

- Local API: `http://127.0.0.1:54321`.
- Local database: loopback port `54322` (shadow database uses `54320` when needed).
- App-to-API: `http://supabase_kong_trafficsense-nk-local:8000` on the dedicated bridge.
- Application and production ports remain loopback-only at `3000` and `3001`.

The `demo` service seeds and tests without Docker-socket access. The privileged local service key is passed from CLI status through standard input to the seeder; it is not saved to the app environment. CLI startup logs may contain local credentials and are kept in ignored `supabase/.temp/start.log`. Build context exclusions cover this directory, environment files, and host caches.

## Configuration

| Variable | Use |
| --- | --- |
| `SUPABASE_URL` | Server-side API URL, generated for the local bridge |
| `SUPABASE_ANON_KEY` | Unprivileged API key; application requests remain subject to authentication and row-level security |
| `DEMO_MODE` | Enables the local-demo notice and allows synthetic seeding only with the exact local endpoint |
| `AUTH_COOKIE_SECURE` | Explicitly `false` for local HTTP preview; use secure cookies with HTTPS outside local development |

No privileged key belongs in the app container or a `NEXT_PUBLIC_*` variable. Hosted configuration, TLS, confirmation emails, abuse controls, and deployment need their own checks before public use. Missing configuration and service failures are shown explicitly, without replacing authentication with a mock login.

## Checks and shutdown

```bash
docker compose run --build --rm checks
bash scripts/local-supabase.sh test
bash scripts/local-supabase.sh stop
```

The first command runs unit tests, lint, route types, TypeScript, and the production build without accessing local secrets. The integration tests use real Auth-issued user sessions and PostgREST policies, not a service key. They create synthetic registration accounts which remain in the local database until intentionally removed.

`tests/browser.mjs` drives a local Chromium debugging endpoint (`CHROMIUM_DEBUG_URL`, default `http://127.0.0.1:9333`) and reads the ignored synthetic account file. With Chromium already running on loopback, run the browser driver in Docker:

```bash
docker run --rm --network host --user 1000:1000 \
  --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
  -e APP_URL=http://127.0.0.1:3000 \
  trafficsense-demo node tests/browser.mjs
```

Repeat with port `3001` for the production preview. The driver uses an isolated browser context and checks desktop/mobile registration, full keyboard login, roles, denied direct routes, organisation isolation, empty membership, cookie flags, refresh and layout. Reload/history assertions wait for the destination document before inspecting account state. Two tabs exercise logout and account switching through subsequent reloads/navigation, including authenticated redirects from login/register.

For the focused public UI suite, add `-e BROWSER_SCENARIO=ui` to the Docker command before the image name. It checks widths of 320, 390, 768, 1024 and 1440 pixels, guest and protected-role navigation, registration links, not-found recovery, the keyboard skip link, font loading, same-origin assets, reduced-motion behavior, minimum 44px controls and sampled rendered text contrast. It complements the full authentication and recovery suites; it is not a complete accessibility audit. Screenshots are saved under the ignored `supabase/.temp/browser/` directory.

Cookie tests tamper with cached user metadata, force the cookie's expiry timestamp and invalidate its refresh token. Forced cookie expiry exercises refresh handling; it is not proof of behavior with a genuinely expired signed access token. Two-tab tests do not claim that an idle tab clears itself without navigation or refresh.

### Recovery and missing configuration

With the same Chromium endpoint running:

```bash
bash scripts/local-supabase.sh test-browser-recovery
```

The test-only `compose.auth-test.yaml` overlay starts isolated development/production apps on loopback ports 3002/3003, unconfigured production/development on 3004/3005, and a fixed-upstream fault proxy on 54323. It leaves the usual app/production services unchanged. The proxy accepts only local test control calls, never browser-originated control or a request-supplied upstream. No privileged key or Docker socket is mounted in these services.

Recovery tests create temporary synthetic accounts and an organisation using a local-only service key piped through stdin to the test runner. They test missing-profile retry/logout, current-session role/membership changes, sign-in/logout during outages, auth/database failures, and organisation-query failures after a successful profile lookup. Unconfigured checks cover guest entry, login/register and every private route. Fixtures and test containers are cleaned up after the run; interruption or cleanup failure requires inspecting the local test accounts before another run. Run these tests serially because they share the fault proxy. The browser driver attributes React's delayed server-error reports to the deliberately failed document's execution context, with the expected application error and a verified error screen. The isolated production recovery and unconfigured services emit the equivalent minified React code 419 instead of the application message; that exact code is accepted only for verified failed documents on ports 3003 and 3004. All other runtime exceptions and prerender/navigation diagnostics fail the run.

### Genuine signed-token expiry

The separate `BROWSER_SCENARIO=expiry` scenario requires a temporarily shortened **local** `jwt_expiry` of 120 seconds (above the SDK's 90-second proactive-refresh margin) in `supabase/config.toml`, followed by a non-destructive Supabase stop/start. It refuses lifetimes at or below 90 seconds or above 120 seconds instead of silently skipping the check. Run it separately from recovery/setup changes:

```bash
docker run --rm --network host --user 1000:1000 \
  --env-file .env.local \
  --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
  -e APP_URL=http://127.0.0.1:3000 -e BROWSER_SCENARIO=expiry \
  trafficsense-demo node tests/browser.mjs
```

Repeat on port 3001. It verifies the original Auth-issued ES256 signature with the public verification key, confirms access before expiration, waits for the signed expiration, and checks Auth/database denial without modifying the token. Auth must reject immediately after the wait; database rejection is measured separately and must occur within 35 seconds after signed expiration. This tolerance is explicit rather than treated as immediate invalidation. Browser checks then cover refresh, invalid refresh and logout using that expired token. Cookies are manipulated only to select the refresh/logout cases; tokens are neither re-signed nor assigned artificial expiration claims. **Restore `jwt_expiry = 3600` and stop/start Supabase afterward, including after failures.** This local test does not alter hosted configuration.

Chromium itself must be available separately; the application image does not install a browser.

Stopping Supabase retains local data. `docker compose down` only stops/removes application services; it does not stop the separately managed Supabase stack. Avoid `stop --all`, Docker pruning, and unrelated projects. A deliberate local database reset deletes synthetic accounts and requires reseeding; it is not part of normal startup.
