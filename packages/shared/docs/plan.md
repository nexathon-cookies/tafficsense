# Shared package plan

This package owns platform-neutral contracts and utilities shared by the web and mobile apps.

## Initial scope

- Report categories and report input/output contracts.
- Public incident and route-alert response types.
- Pure validation and formatting helpers that do not depend on a platform runtime.

Server-only Supabase clients, Next.js actions, native permissions, and UI components stay outside this package.

## Compatibility

- TypeScript only, with no DOM, Next.js, Expo, or React Native imports.
- Keep exports small and explicit. Add a contract test before changing a public shape.
- API and database rules remain authoritative in the existing server implementation until a contract is deliberately extracted and covered.

## Acceptance criteria

- Web and mobile can import the same contract without platform-specific shims.
- Invalid input is rejected explicitly rather than silently defaulted.
- Shared changes update this plan and the affected app progress records in the same commit.
