# TrafficSense Justfile
# Unified task runner on top of Docker Engine & Compose.
# Pinned Node.js 24 and pnpm 11.11.0 execute inside containers.

set shell := ["bash", "-cu"]
export MSYS_NO_PATHCONV := "1"

# Display available recipes
default:
    @just --list

# Display available recipes (alias)
list:
    @just --list

# Start development environment (Supabase backend + seed + web + mobile)
up:
    just db-start
    @echo "==> Seeding synthetic test accounts..."
    just db-seed
    docker compose up --build -d app
    just mobile-up
    @echo "==> Ready! Web: http://localhost:3000 | Expo: exp://127.0.0.1:8081"

# Start only the web app (starts local Supabase and synthetic seed first)
web-up:
    just db-start
    just db-seed
    docker compose up --build -d app
    @echo "==> Web app ready at http://localhost:3000"

# Start only the Expo mobile app; use mobile-lan for a physical phone
mobile-up:
    docker compose --profile mobile up --build -d mobile
    @echo "==> Expo mobile app ready at exp://127.0.0.1:8081"

# Start Expo and local services for a phone on the same LAN
mobile-lan host="192.168.0.224":
    @echo "==> LAN mode exposes local Supabase and Expo on a trusted network only..."
    @docker compose --profile mobile rm --stop --force app mobile 2>/dev/null || true
    LOCAL_SUPABASE_HOST_BIND=0.0.0.0 bash scripts/local-supabase.sh start
    LOCAL_SUPABASE_HOST_BIND=0.0.0.0 bash scripts/local-supabase.sh seed
    APP_HOST_BIND=0.0.0.0 docker compose up --build -d app
    EXPO_PACKAGER_PROXY_URL="http://{{ trim_start_matches(host, "host=") }}:8081" EXPO_PUBLIC_API_BASE_URL="http://{{ trim_start_matches(host, "host=") }}:3000" EXPO_PUBLIC_SUPABASE_URL="http://{{ trim_start_matches(host, "host=") }}:54321" EXPO_PUBLIC_SUPABASE_ANON_KEY="$$(grep '^SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)" MOBILE_HOST_BIND=0.0.0.0 docker compose --profile mobile up --build -d mobile
    @echo "==> Expo Go URL: exp://{{ trim_start_matches(host, "host=") }}:8081"
    @for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do if docker compose exec -T mobile node -e 'require("qrcode-terminal").generate("exp://{{ trim_start_matches(host, "host=") }}:8081", { small: true });' 2>/dev/null; then exit 0; fi; sleep 2; done; docker compose exec -T mobile node -e 'require("qrcode-terminal").generate("exp://{{ trim_start_matches(host, "host=") }}:8081", { small: true });'

# Start dev app and follow logs directly
dev:
    docker compose up --build app

# Start production preview container on http://localhost:3001
prod:
    @echo "==> Starting production preview container..."
    docker compose --profile production up --build -d production
    @echo "==> Production preview ready at: http://localhost:3001"

# Stop dev and production preview containers (preserves database and cache)
down:
    docker compose --profile mobile --profile production down

# Stop the dev container
stop:
    docker compose stop app mobile

# Stop only the web app
web-stop:
    docker compose stop app

# Stop only the mobile app
mobile-stop:
    docker compose stop mobile

# Restart the dev container
restart:
    docker compose restart app

# Restart the mobile app
mobile-restart:
    docker compose restart mobile

# Stop all containers including Supabase backend
stop-all:
    @echo "==> Stopping dev & production containers..."
    docker compose --profile production down
    @echo "==> Stopping local Supabase backend..."
    bash scripts/local-supabase.sh stop
    @echo "==> All TrafficSense containers stopped."

# Show status of TrafficSense and Supabase containers
status:
    @echo "=== Application Containers ==="
    @docker compose ps -a
    @echo ""
    @echo "=== Local Supabase Containers ==="
    @docker ps --filter "name=supabase" --format "table {{ '{{' }}.Names{{ '}}' }}\t{{ '{{' }}.Status{{ '}}' }}\t{{ '{{' }}.Ports{{ '}}' }}"

# Stream logs for a container (default: app)
logs service="app":
    @service_name="{{service}}"; service_name="${service_name#service=}"; docker compose logs -f "$service_name"

# Stream mobile logs
mobile-logs:
    docker compose logs -f mobile

# Open an interactive shell inside a container (default: app)
shell service="app":
    docker compose exec {{service}} sh

# Start local Supabase backend
db-start:
    bash scripts/local-supabase.sh start

# Seed local Supabase backend with synthetic accounts and demo data
db-seed:
    bash scripts/local-supabase.sh seed

# Stop local Supabase backend
db-stop:
    bash scripts/local-supabase.sh stop

# Restart and re-seed local Supabase backend
db-reset:
    bash scripts/local-supabase.sh stop
    bash scripts/local-supabase.sh start
    bash scripts/local-supabase.sh seed

# Run traffic simulator (scenario: normal | slowdown | recovery | reset)
simulate scenario="normal":
    bash scripts/local-supabase.sh simulate {{scenario}}

# Reset traffic simulator state to baseline
simulate-reset:
    bash scripts/local-supabase.sh simulate reset

# Run unit tests inside Docker
test:
    docker compose exec app pnpm test 2>/dev/null || docker compose run --rm app pnpm test

# Type-check the mobile app inside Docker
mobile-typecheck:
    docker compose run --rm app pnpm --filter @trafficsense/mobile typecheck

# Run fast ESLint check inside Docker
lint:
    docker compose exec app pnpm lint 2>/dev/null || docker compose run --rm app pnpm lint

# Check the required app AI/docs layout inside Docker
check-docs:
    docker compose run --rm app pnpm check:docs

# Run backend integration tests (auth, traffic, reports)
test-integration:
    bash scripts/local-supabase.sh test
    bash scripts/local-supabase.sh test-traffic
    bash scripts/local-supabase.sh test-reports

# Run the report → verification → route-alert proof against local Supabase.
test-core-loop:
    bash scripts/local-supabase.sh test-core-loop

# Run full checks suite (test + lint + typegen + tsc + build) in isolated container
check:
    docker compose run --build --rm checks

# Clean up stopped project containers
clean:
    docker compose --profile production --profile tools down --remove-orphans

# Start a free Cloudflare Tunnel exposing http://localhost:3000 to the internet
tunnel:
    @echo "==> Starting Cloudflare Tunnel for http://localhost:3000..."
    @docker rm -f trafficsense-nk-tunnel 2>/dev/null || true
    @docker run -d --name trafficsense-nk-tunnel --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://localhost:3000
    @echo "==> Tunnel created! Public HTTPS URL:"
    @for attempt in $(seq 1 15); do \
        tunnel_url=$(docker logs trafficsense-nk-tunnel 2>&1 | grep -oE 'https://[^[:space:]]+\.trycloudflare\.com' | head -n 1); \
        if [ -n "$tunnel_url" ]; then echo "$tunnel_url"; exit 0; fi; \
        sleep 1; \
    done; \
    echo "Tunnel is still starting; run: docker logs trafficsense-nk-tunnel"; \
    exit 1

# Stop the Cloudflare Tunnel
tunnel-stop:
    @echo "==> Stopping Cloudflare Tunnel..."
    @docker rm -f trafficsense-nk-tunnel 2>/dev/null || true
    @echo "==> Tunnel stopped."
