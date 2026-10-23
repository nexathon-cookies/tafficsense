# Project Instructions

Read [ai/ai_agent_root_rules.md](ai/ai_agent_root_rules.md) before working in this repository. It is the entry point for project-specific engineering guidelines.

Load only the resources relevant to the task. Next.js + Supabase with TypeScript is selected; inspect current code and [docs/progress.md](docs/progress.md) for implementation and verification status rather than assuming a scaffold-only state. Run project development, package commands and checks in Docker; use the repository `justfile` (`just up`, `just test`, `just check`, etc.) or follow [docs/docker.md](docs/docker.md) for raw Compose commands. Use pnpm inside the containers (version pinned in `package.json`) and keep `pnpm-lock.yaml` as the only package lockfile. Do not install project dependencies on the host or alter unrelated Docker projects.

Keep [docs/plan.md](docs/plan.md) limited to scope, design decisions, and acceptance criteria. The detailed phase roadmap belongs in `docs/implementation.md`, and the supplied responsive UI design reference is `docs/design/trafficsense/README.md`. Record all actual implementation updates, task status, results, blockers, verification evidence, and commit records only in [docs/progress.md](docs/progress.md), not in the plan, roadmap, or instructions. This division supersedes older documentation and scheduling directions.

Keep the original goal in view: REPORT → VERIFY → ALERT → ANALYSE. Read [docs/README.md](docs/README.md) for module/source-page traceability to [Traffic_JAM.pdf](docs/Traffic_JAM.pdf). Map tasks to the seven recommended modules; record any scope cut and remaining gap in the plan. Delay receipts are a proposed extension, not a replacement for the traffic goal. The PDF is a product brief, not confirmed event rules.

Plan for one active human builder with AI assistance, using verified phases rather than a fixed-date or fewer-than-eight-days schedule. [docs/implementation.md](docs/implementation.md) is authoritative for phase order and dependencies. Advance after the required acceptance checks pass or the user explicitly approves a scope change, such as deferring the optional receipt phase; deferred checks are not passed checks. Record failed or blocked checks in `docs/progress.md` rather than treating implementation as completion. Work in small checked steps with relevant tests first; preserve user review, privacy, and negative tests.

After each completed and verified task, review the diff and create a scoped local commit. Include its verification record, preserve unrelated changes, and report the commit hash. Push only when explicitly requested.

For web application changes, verify the affected flows in a browser, including other pages sharing the changed state or components. Check desktop and mobile when layout changes. If browser tools are unavailable, use the closest available tests and explicitly report what could not be verified.
