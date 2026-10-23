#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."
export PWD="$(pwd)"
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo 0)"
umask 077
supabase_project_id="trafficsense-nk-local"
supabase_db_container="supabase_db_${supabase_project_id}"
supabase_network="trafficsense-nk_supabase"

recreate_supabase_network() {
  local container_name
  local containers

  mapfile -t containers < <(docker network inspect "$supabase_network" --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}')
  for container_name in "${containers[@]}"; do
    [[ -z "$container_name" ]] && continue
    if [[ "$container_name" != supabase_*_"$supabase_project_id" ]]; then
      printf '%s\n' "Cannot switch local Supabase to LAN binding while project container $container_name is attached to $supabase_network. Stop that container and retry." >&2
      exit 1
    fi
    docker rm -f "$container_name" >/dev/null
  done
  docker network rm "$supabase_network" >/dev/null
}

# Reuse an existing project bridge's binding when the caller did not choose one.
# This keeps repeated `just up` runs compatible with the bridge already in use.
if [[ -z "${LOCAL_SUPABASE_HOST_BIND+x}" ]] && docker network inspect "$supabase_network" >/dev/null 2>&1; then
  existing_host_bind="$(docker network inspect "$supabase_network" --format '{{ index .Options "com.docker.network.bridge.host_binding_ipv4" }}')"
  if [[ "$existing_host_bind" == "127.0.0.1" || "$existing_host_bind" == "0.0.0.0" ]]; then
    export LOCAL_SUPABASE_HOST_BIND="$existing_host_bind"
  fi
fi

case "${1:-}" in
  start)
    requested_host_bind="${LOCAL_SUPABASE_HOST_BIND:-127.0.0.1}"
    if docker network inspect "$supabase_network" >/dev/null 2>&1; then
      existing_host_bind="$(docker network inspect "$supabase_network" --format '{{ index .Options "com.docker.network.bridge.host_binding_ipv4" }}')"
      if [[ "$existing_host_bind" != "$requested_host_bind" ]]; then
        printf '%s\n' "==> Recreating the local Supabase bridge for ${requested_host_bind} bindings (database volumes are preserved)..."
        recreate_supabase_network
      fi
    fi
    if ! docker network inspect "$supabase_network" >/dev/null 2>&1; then
      docker network create --driver bridge \
        --opt com.docker.network.bridge.host_binding_ipv4="${LOCAL_SUPABASE_HOST_BIND:-127.0.0.1}" \
        "$supabase_network" >/dev/null
    fi
    docker compose build supabase demo
    mkdir -p supabase/.temp
    if ! docker compose run --rm supabase start --exclude realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >supabase/.temp/start.log 2>&1; then
      printf '%s\n' 'Supabase startup failed. Inspect the private supabase/.temp/start.log; it may contain local credentials.' >&2
      exit 1
    fi
    docker compose run --rm supabase migration up --local
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/scripts/configure-local.mjs
    printf '%s\n' 'Local Supabase is ready. Run bash scripts/local-supabase.sh seed to create synthetic accounts.'
    if [[ "${LOCAL_SUPABASE_HOST_BIND:-127.0.0.1}" != "127.0.0.1" ]]; then
      printf '%s\n' "LAN binding enabled on ${LOCAL_SUPABASE_HOST_BIND}; use only on a trusted local network."
    fi
    ;;
  seed)
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/scripts/seed-demo.mjs
    ;;
  test)
    docker compose run --build --rm -T demo node --test /app/tests/auth.integration.test.mjs
    ;;
  simulate)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/scripts/simulate-traffic.mjs "${@:2}"
    ;;
  test-traffic)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/traffic.integration.test.mjs
    ;;
  reports)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/scripts/operate-reports.mjs "${@:2}"
    ;;
  test-reports)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/reports.integration.test.mjs
    ;;
  test-evidence)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/evidence.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/evidence-boundaries.integration.sql
    ;;
  test-slowdown)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/slowdown.integration.test.mjs
    ;;
  speed-evidence)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/scripts/operate-speed-evidence.mjs "${@:2}"
    ;;
  test-speed-evidence)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/speed-evidence.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/speed-evidence-boundaries.sql
    ;;
  traversals)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/scripts/operate-traversals.mjs "${@:2}"
    ;;
  test-lifecycle)
    docker compose build demo
    docker compose run --rm -T demo node /app/tests/incident-lifecycle-parity.mjs | docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/incident-lifecycle.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/incident-lifecycle-boundaries.sql
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/incident-lifecycle-late-evidence.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/incident-lifecycle-late-evidence.sql
    ;;
  test-traversals)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/traversals.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/traversals-boundaries.sql
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/traversals-motion-boundaries.sql
    ;;
  test-phase4)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/phase4.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/phase4-boundaries.sql
    ;;
  test-route-alerts)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/route-alerts.integration.test.mjs
    docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/route-alerts-boundaries.sql
    ;;
  test-core-loop)
    docker compose build demo
    docker compose run --rm -T supabase status --output json | docker compose run --rm -T demo node /app/tests/core-loop.integration.test.mjs
    ;;
  test-route-alerts-browser)
    docker compose build demo
    for port in 3000 3001; do
      docker compose run --rm -T supabase status --output json |
        docker run --rm -i --network host --user 1000:1000 \
          --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
          -e APP_URL="http://127.0.0.1:$port" -e ROUTE_ALERTS_BROWSER=true \
          -e CHROMIUM_DEBUG_URL="${CHROMIUM_DEBUG_URL:-http://127.0.0.1:9333}" \
          trafficsense-demo node tests/traffic-browser.mjs
    done
    ;;
  test-phase4-browser)
    docker compose build demo
    for port in 3000 3001; do
      docker compose run --rm -T supabase status --output json |
        docker run --rm -i --network host --user 1000:1000 \
          --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
          -e APP_URL="http://127.0.0.1:$port" -e PHASE4_BROWSER=true \
          -e CHROMIUM_DEBUG_URL="${CHROMIUM_DEBUG_URL:-http://127.0.0.1:9333}" \
          trafficsense-demo node tests/traffic-browser.mjs
    done
    ;;
  test-episodes)
    case "${2:-}" in
      --backfill)
        sed '/^\\ir /r supabase/migrations/20261016000100_incident_episodes.sql' tests/incident-episodes-boundaries.sql |
          sed '/^\\ir /d' |
          docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v episodes_backfill=true
        ;;
      --schema-only|'')
        schema_only=false
        if [[ "${2:-}" == --schema-only ]]; then schema_only=true; fi
        docker compose build demo
        docker compose run --rm -T supabase status --output json |
          docker compose run --rm -T --workdir /app -e EPISODES_SCHEMA_ONLY="$schema_only" demo pnpm exec node /app/tests/incident-episodes.integration.test.mjs
        if [[ "${2:-}" != --schema-only ]]; then
          docker exec -i "$supabase_db_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/incident-episodes-boundaries.sql
        fi
        ;;
      *)
        printf '%s\n' 'Usage: bash scripts/local-supabase.sh test-episodes [--schema-only|--backfill]' >&2
        exit 2
        ;;
    esac
    ;;
  test-browser-recovery)
    test_compose=(docker compose -f compose.yaml -f compose.auth-test.yaml --profile auth-test)
    test_services=(auth-recovery auth-recovery-production auth-unconfigured auth-unconfigured-development auth-faults)
    cleanup_recovery() {
      "${test_compose[@]}" rm --stop --force "${test_services[@]}"
    }
    trap cleanup_recovery EXIT
    "${test_compose[@]}" up --build -d --wait "${test_services[@]}"
    for port in 3002 3003; do
      "${test_compose[@]}" run --rm -T supabase status --output json | docker run --rm -i --network host --user 1000:1000 \
        --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
        -e CHROMIUM_DEBUG_URL="${CHROMIUM_DEBUG_URL:-http://127.0.0.1:9333}" \
        -e APP_URL="http://127.0.0.1:$port" -e BROWSER_SCENARIO=recovery \
        trafficsense-auth-recovery node tests/browser.mjs
      for reports in false true; do
        "${test_compose[@]}" run --rm -T supabase status --output json | docker run --rm -i --network host --user 1000:1000 \
          --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
          -e CHROMIUM_DEBUG_URL="${CHROMIUM_DEBUG_URL:-http://127.0.0.1:9333}" \
          -e APP_URL="http://127.0.0.1:$port" -e TRAFFIC_FAULTS=true -e REPORTS_BROWSER="$reports" \
          trafficsense-auth-recovery node tests/traffic-browser.mjs
      done
    done
    for port in 3004 3005; do
      docker run --rm --network host --user 1000:1000 \
        --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
        -e CHROMIUM_DEBUG_URL="${CHROMIUM_DEBUG_URL:-http://127.0.0.1:9333}" \
        -e APP_URL="http://127.0.0.1:$port" -e BROWSER_SCENARIO=setup \
        trafficsense-auth-recovery node tests/browser.mjs
      docker run --rm --network host --user 1000:1000 \
        --mount type=bind,src="$PWD",dst=/workspace --workdir /workspace \
        -e CHROMIUM_DEBUG_URL="${CHROMIUM_DEBUG_URL:-http://127.0.0.1:9333}" \
        -e APP_URL="http://127.0.0.1:$port" -e TRAFFIC_SETUP=true -e REPORTS_BROWSER=true \
        trafficsense-auth-recovery node tests/traffic-browser.mjs
    done
    ;;
  stop)
    docker compose run --rm supabase stop
    ;;
  *)
    printf '%s\n' 'Usage: bash scripts/local-supabase.sh start|seed|test|test-traffic|test-reports|test-evidence|test-slowdown|test-speed-evidence|test-lifecycle|test-traversals|test-phase4|test-phase4-browser|test-route-alerts|test-core-loop|test-route-alerts-browser|test-browser-recovery|stop | traversals generate <run-uuid> <batch-uuid> <source-id> <traversal-uuid> <entered-at> <until> | traversals check <traversal-uuid> | speed-evidence capture|check <run-uuid> <batch-uuid> | speed-evidence cleanup <run-uuid> --confirm | test-episodes [--schema-only|--backfill] | simulate normal|slowdown|recovery [UTC-anchor] | simulate reset | reports enable|disable | reports cleanup|cleanup-expired-guests --confirm' >&2
    exit 2
    ;;
esac
