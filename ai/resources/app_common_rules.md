# Shared app rules

These rules apply to every app and shared package:

- Keep changes scoped to the owning app or package.
- Use clear names, focused modules, and comments only for non-obvious decisions.
- Validate input and authorization at the server boundary; do not trust client roles or identifiers.
- Preserve explicit loading, empty, denied, stale-data, and failure states.
- Label synthetic, estimated, and planned behavior honestly.
- Add focused negative tests for access control, consent, lifecycle, duplicate handling, and failure paths.
- Record implementation status, verification evidence, blockers, and commits in the owning `docs/progress.md`.
- Cross-app or shared-contract changes must update `packages/shared/docs/progress.md` and every affected app's progress log in the same commit.
- Run package commands through the repository's Docker workflow and keep `pnpm-lock.yaml` as the only lockfile.
