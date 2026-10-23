# Web app rules

Read the [shared app rules](../../../ai/resources/app_common_rules.md) and the repository [AI rules](../../../ai/ai_agent_root_rules.md).

- Use Next.js, TypeScript, Supabase, and the existing project patterns.
- Run development, package, lint, test, type-check, and build commands in Docker using the repository `justfile`.
- Use pnpm inside containers; do not add another lockfile.
- Keep public browsing, authentication, authorization, consent, and synthetic-data labels explicit.
- Check all web routes sharing changed state or components, at desktop and mobile sizes when layout changes.
