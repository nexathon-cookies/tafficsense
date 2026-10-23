# Naming Guidelines

Use the Next.js App Router and TypeScript baseline:

- Use `camelCase` for variables and functions, including hooks named `useSomething`.
- Use `PascalCase` for React components, types, interfaces, and classes when needed.
- Use `kebab-case` for application files and route directories, preserving Next.js special filenames such as `page.tsx`, `layout.tsx`, and `route.ts` and existing local conventions.
- Use `UPPER_SNAKE_CASE` for environment variables and module-level constants intended as fixed configuration.
- Preserve database and external API field names at their boundaries; map them explicitly when TypeScript domain names differ.

- Prefer domain names such as incident, report, evidence, journey, route, and delay summary over generic item or data names.
- Distinguish an individual report from an incident assembled from reports.
- Name status fields according to what they establish; avoid an ambiguous `verified` flag for both congestion and cause.
- Make booleans read as predicates, such as `isExpired` or the language-equivalent `is_expired`.
- Include units in quantities, such as delay minutes, distance meters, and duration seconds.
- Distinguish observation time, submission time, update time, and expiry time.
- Use consistent latitude/longitude naming and document coordinate order at integration boundaries.
- Use explicit lifecycle values instead of unrelated boolean flags that permit contradictory states.
- Name tests for observable behavior and conditions rather than implementation details.
- Avoid abbreviations unless established in the language, framework, or domain.
