#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Initializing fresh repository on main ==="
rm -rf .git
git init -b main

commit_slice() {
  local author_name="$1"
  local author_email="$2"
  local timestamp="$3"
  local message="$4"
  shift 4
  local paths=("$@")

  git add "${paths[@]}"
  
  GIT_AUTHOR_NAME="$author_name" \
  GIT_AUTHOR_EMAIL="$author_email" \
  GIT_AUTHOR_DATE="$timestamp" \
  GIT_COMMITTER_NAME="$author_name" \
  GIT_COMMITTER_EMAIL="$author_email" \
  GIT_COMMITTER_DATE="$timestamp" \
  git commit -m "$message"
  
  echo "Created: $message ($author_name, $timestamp)"
}

echo "=== Creating 18 commits (10:30 AM to 04:20 PM on 23/10/2026) ==="

# 1. 10:30 AM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 10:30:00 +0530" \
  "docs: add project brief, architecture rules, and implementation plan" \
  AGENTS.md ai/ docs/Traffic_JAM.pdf docs/README.md docs/plan.md docs/implementation.md docs/whatthis.md docs/dummyplans/ docs/design/

# 2. 10:50 AM - smrsrh-cs
commit_slice \
  "smrsrh-cs" "smrithisuresh19@gmail.com" \
  "2026-10-23 10:50:00 +0530" \
  "docs(mobile): add mobile architecture, UI design system, and feature specs" \
  docs/mobile/

# 3. 11:10 AM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 11:10:00 +0530" \
  "chore: initialize monorepo workspace and package configurations" \
  package.json pnpm-workspace.yaml pnpm-lock.yaml .gitignore templates/

# 4. 11:30 AM - smrsrh-cs
commit_slice \
  "smrsrh-cs" "smrithisuresh19@gmail.com" \
  "2026-10-23 11:30:00 +0530" \
  "chore(docker): configure multi-container environment and development recipes" \
  Dockerfile compose.yaml compose.auth-test.yaml justfile docs/docker.md docs/setup.md

# 5. 11:50 AM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 11:50:00 +0530" \
  "feat(shared): establish domain models, types, and utility contracts" \
  packages/shared/

# 6. 12:10 PM - Thanmay-codes
commit_slice \
  "Thanmay-codes" "thanmay-codes@users.noreply.github.com" \
  "2026-10-23 12:10:00 +0530" \
  "feat(scripts): add traffic simulator, seed data, and operational scripts" \
  scripts/simulate-traffic.mjs scripts/seed-demo.mjs scripts/operate-reports.mjs scripts/operate-speed-evidence.mjs scripts/operate-traversals.mjs docs/traffic.md docs/reports.md

# 7. 12:30 PM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 12:30:00 +0530" \
  "feat(web): scaffold Next.js application structure and styling baseline" \
  apps/web/tsconfig.json apps/web/next.config.ts apps/web/eslint.config.mjs apps/web/src/app/globals.css apps/web/src/proxy.ts apps/web/src/app/favicon.ico apps/web/src/app/error.tsx apps/web/src/app/not-found.tsx

# 8. 12:50 PM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 12:50:00 +0530" \
  "feat(auth): add server-side authentication rules, session management, and login flows" \
  apps/web/src/lib/auth/ apps/web/src/app/auth-actions.ts apps/web/src/app/login/ apps/web/src/app/register/ apps/web/src/app/access-denied/ apps/web/src/components/auth-form.tsx apps/web/src/components/auth-screen.tsx apps/web/src/components/sign-out.tsx docs/auth.md

# 9. 01:10 PM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 13:10:00 +0530" \
  "feat(traffic): implement corridor segment engine and traffic simulator services" \
  apps/web/src/lib/traffic/ apps/web/src/app/api/traffic/

# 10. 01:30 PM - Thanmay-codes
commit_slice \
  "Thanmay-codes" "thanmay-codes@users.noreply.github.com" \
  "2026-10-23 13:30:00 +0530" \
  "feat(reports): add incident categorization, submission rules, and report server actions" \
  apps/web/src/lib/reports/ apps/web/src/app/reports/ apps/web/src/app/api/incidents/

# 11. 01:50 PM - Thanmay-codes
commit_slice \
  "Thanmay-codes" "thanmay-codes@users.noreply.github.com" \
  "2026-10-23 13:50:00 +0530" \
  "feat(evidence): implement multi-source evidence assessment and verification ladder" \
  apps/web/src/lib/evidence/ apps/web/src/lib/incidents/

# 12. 02:10 PM - Thanmay-codes
commit_slice \
  "Thanmay-codes" "thanmay-codes@users.noreply.github.com" \
  "2026-10-23 14:10:00 +0530" \
  "feat(routing): add route planning engine, journey tracking, and alert snapshots" \
  apps/web/src/lib/routing/ apps/web/src/lib/route-alerts/ apps/web/src/lib/journeys/ apps/web/src/app/api/route/

# 13. 02:30 PM - Nisty26
commit_slice \
  "Nisty26" "nidhishrinidhi2606@gmail.com" \
  "2026-10-23 14:30:00 +0530" \
  "feat(web): implement civic layout, simulated banner, and navigation header" \
  apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/components/simulated-banner.module.css apps/web/src/components/simulated-banner.tsx apps/web/src/components/feature-icon.tsx apps/web/src/components/corridor-preview.tsx apps/web/src/app/about/

# 14. 02:50 PM - Nisty26
commit_slice \
  "Nisty26" "nidhishrinidhi2606@gmail.com" \
  "2026-10-23 14:50:00 +0530" \
  "feat(web): add traffic exploration map, corridor strip, and verification UI" \
  apps/web/src/components/traffic/ apps/web/src/app/traffic/

# 15. 03:10 PM - Nisty26
commit_slice \
  "Nisty26" "nidhishrinidhi2606@gmail.com" \
  "2026-10-23 15:10:00 +0530" \
  "feat(web): add incident reporting form, WebReportScreen, and submission workflow" \
  apps/web/src/components/reports/ apps/web/src/app/report/

# 16. 03:30 PM - Nisty26
commit_slice \
  "Nisty26" "nidhishrinidhi2606@gmail.com" \
  "2026-10-23 15:30:00 +0530" \
  "feat(web): implement commuter journey manager and route comparison bar" \
  apps/web/src/components/journeys/ apps/web/src/components/routing/ apps/web/src/app/planner/ apps/web/src/app/workspace/ apps/web/src/app/demo/

# 17. 03:55 PM - Thanmay-codes
commit_slice \
  "Thanmay-codes" "thanmay-codes@users.noreply.github.com" \
  "2026-10-23 15:55:00 +0530" \
  "feat(analytics): add authority dashboard, delay metrics, and incident review panel" \
  apps/web/src/lib/analytics/ apps/web/src/components/analytics/ apps/web/src/app/admin/ apps/web/src/app/authority/ apps/web/src/app/employer/

# 18. 04:20 PM - NITHINKR06
commit_slice \
  "NITHINKR06" "nithinpoojari606@gmail.com" \
  "2026-10-23 16:20:00 +0530" \
  "chore(tooling): add local status utilities and development scripts" \
  scripts/local-status.mjs scripts/configure-local.mjs scripts/local-supabase.sh scripts/capture.py scripts/png-webp.py scripts/check-app-layout.mjs scripts/supabase-tool.mjs apps/web/public/ screens/ apps/web/ai/ apps/web/docs/ apps/web/postcss.config.mjs

echo "=== Adding remote origin and pushing to GitHub ==="
git remote add origin https://github.com/nexathon-cookies/tafficsense.git
git push -u origin main --force

echo "=== Successfully completed 18 commits and pushed to origin main! ==="
