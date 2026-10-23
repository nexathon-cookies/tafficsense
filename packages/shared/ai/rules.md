# Shared package rules

Read the [shared app rules](../../../ai/resources/app_common_rules.md) and the repository [AI rules](../../../ai/ai_agent_root_rules.md).

- Keep this package platform-neutral and free of app-specific UI assumptions.
- Preserve compatible contracts for web and mobile consumers.
- A shared API or domain change must update this package's docs and every affected app's progress log in the same commit.
- Add contract-level tests and document migration or compatibility impact before changing a public export.
