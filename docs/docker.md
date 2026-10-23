# Docker Development

Docker Engine with Compose is the only required host runtime. Node.js 24 and pnpm 11.11.0 run inside the images. Keep editing source files in your normal editor; use Docker for package commands, development, checks and production previews.

## Quick Start with Just

If you have `just` installed, use the repository `justfile` commands:

```bash
just up         # Starts Supabase, seeds accounts, and launches web + mobile
just web-up     # Start only the Next.js web app
just mobile-up  # Start only Expo locally
just mobile-lan # Start Expo + local Supabase for a phone on the LAN
just status     # Inspect container health and port bindings
just test       # Run test suite inside the container
just check      # Run full checks suite (tests, linter, typecheck, build)
just down       # Stop web/mobile app containers while preserving backend state
just stop-all   # Stop all containers including local Supabase backend
```

Run `just` or `just --list` to view all available shortcuts.

## Start development (Manual)

From the repository root:

```bash
bash scripts/local-supabase.sh start
bash scripts/local-supabase.sh seed
docker compose up --build -d app
docker compose logs -f app
```

The equivalent mobile command is `docker compose --profile mobile up --build -d mobile`; use `just mobile-up` for a local Expo runtime or `just mobile-lan host=192.168.0.224` for Expo Go on a trusted LAN. `just up` starts both app services; `just web-up` and `just mobile-up` start them independently. `just stop`, `just web-stop`, and `just mobile-stop` stop them independently.

The first two commands prepare the dedicated local backend network, database, and synthetic accounts. See [local authentication](auth.md) for requirements, access rules, and credentials handling.

Open **http://localhost:3000**. The app binds only to the host's loopback interface. Next.js also explicitly permits `127.0.0.1` for development resources so hot reload works with either local address; unrelated origins remain blocked. Override a busy port with `APP_PORT=3002 docker compose up -d app`.

The repository is bind-mounted for hot reload. Docker-managed `dependencies` and `next-cache` volumes isolate Linux packages and generated output from host `node_modules` and `.next`; the mobile service shares the workspace dependency volume and watches `apps/mobile`. Startup runs a frozen install to synchronise the dependency volume with the lockfile; a manifest/lockfile mismatch fails rather than silently rewriting the lockfile.

The web client is a workspace app under `apps/web`: its Next.js source is in `apps/web/src`, public assets are in `apps/web/public`, and its Next.js/TypeScript/ESLint configuration files are beside that source. Root package scripts and Docker commands delegate to this app; tests and shared tooling remain at the repository root.

The container runs as the image's `node` user (UID/GID 1000/1000), matching the current Linux workstation. Generated files are not root-owned. Other Linux user IDs may require an explicit ownership configuration before editing package files from the container; do not solve that by running the app privileged or making the repository world-writable.

## Checks

```bash
docker compose run --build --rm checks
```

This runs authentication, traffic fixture and simulator-command unit tests, ESLint, Next.js route-type generation, TypeScript checking and a production build in a fresh one-off container. It uses an image snapshot of current source and does not share the running app's dependency/build volumes. The checks container cannot overwrite the dev server's `.next` output.

Individual commands against the running development container:

```bash
docker compose exec app pnpm lint
docker compose exec app pnpm audit --prod
docker compose exec app sh
```

Run `bash scripts/local-supabase.sh test` for real authentication and database-policy integration tests after starting and seeding the backend. Run `bash scripts/local-supabase.sh test-traffic` separately for synthetic traffic persistence and authorization. Run `bash scripts/local-supabase.sh test-reports` for synthetic report persistence, retries, guest authorization and quota checks. Run `bash scripts/local-supabase.sh test-evidence` for source aggregation, exact rolling-window/expiry boundaries and restricted database grants. Run `bash scripts/local-supabase.sh test-slowdown` for persisted synthetic slowdown windows, exact cadence/threshold/freshness and fixture-replacement consistency. Run `bash scripts/local-supabase.sh test-speed-evidence` for immutable synthetic capture, replay/conflict/cap boundaries, restricted grants and fixture/report preservation; [operator capture/check/cleanup commands](traffic.md#retained-synthetic-speed-evidence) remain separate from simulator reset. Run `bash scripts/local-supabase.sh test-lifecycle` for persistent incident transitions and SQL/TypeScript parity, `test-traversals` for completed synthetic motion persistence, and `test-phase4` for the combined public projection and reader privileges. Run `bash scripts/local-supabase.sh test-route-alerts` for exact same-run completed-route comparisons, fixed membership and restricted reader privileges, and `test-route-alerts-browser` for serial desktop/mobile development/production alert flows. Run `bash scripts/local-supabase.sh test-episodes` for durable report membership, exact episode intervals and persistence privileges; see [report episodes](reports.md#durable-report-episode-references) for the coordinated migration/parser rollout and pre-migration backfill rehearsal. See [local synthetic traffic](traffic.md) for scenario/reset commands and [local reporting](reports.md) for reporting controls and recovery contracts. Container health is a readiness check, not proof that user flows work; browser verification is still required. The browser runner is documented in [local authentication](auth.md).

## Dependencies

With the development container running:

```bash
docker compose exec app pnpm add <package>
docker compose exec app pnpm add -D <package>
docker compose up --build -d app
```

The first command is for runtime dependencies; the second is for development dependencies. Run only the one needed. Review the manifest/lockfile diff and any requested build-script approvals. pnpm currently allows only the reviewed `unrs-resolver` postinstall via `pnpm-workspace.yaml`.

Use `docker compose run --rm app pnpm install --frozen-lockfile` when only an install is needed. Keep `pnpm-lock.yaml` as the sole package lockfile; do not install packages on the host. Rebuild images after dependency changes so checks and production use the same versions.

## Production preview

```bash
docker compose --profile production up --build -d production
```

Open **http://localhost:3001**. `PRODUCTION_PORT` overrides the host port. This service is opt-in and can run alongside development.

The multi-stage Dockerfile builds Next.js with `output: "standalone"`. The final image contains the traced server, static output and public assets, runs as a non-root user, and has no source bind mounts or development pnpm tooling. It is a local production preview, not a deployed service.

## Stop and restart

```bash
docker compose stop app
docker compose start app
docker compose --profile production down
```

`down` removes the application Compose containers/default network while retaining named volumes and the external Supabase bridge. It does not stop the separate local Supabase stack; use `bash scripts/local-supabase.sh stop` for that. Avoid `down --volumes` unless intentionally resetting application dependency/build caches. Never prune or stop unrelated Docker projects.

## Secrets and local Supabase

- `.dockerignore` excludes Git metadata, host dependencies/build output, environment/private-key files and `supabase/.temp` from image builds. No secrets are passed through build arguments.
- Development bind mounts differ from image contents: local `.env.local` and ignored files are visible to the development process. Keep credentials untracked and never print or publish them.
- Compose loads optional `.env.local` into development and production-preview runtime environments. Recreate containers after environment changes. Runtime injection is not permission to bake secrets into images or expose privileged keys through `NEXT_PUBLIC_*`.
- [Local authentication](auth.md) documents the separate Supabase stack and bridge. Only its one-off CLI tooling receives the Docker socket; normal app and seeder requests do not. Hosted configuration needs separate security checks.
- Dependency advisory history and actual verification are tracked in [progress.md](progress.md). Containerisation does not fix vulnerabilities.

First image builds need network access for the Node image, pnpm and packages. The starter also fetches its Google fonts at build time. Report connectivity failures rather than disabling TLS verification or substituting a different app silently.
