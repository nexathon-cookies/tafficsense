# Commit and Push Conventions

After each completed and verified task, review the diff and create a scoped local commit as required by [the root instructions](../../AGENTS.md), unless the user explicitly says not to commit. Inspect repository hosting, branch protection, and collaboration configuration instead of assuming it.

## Scope and Safety

- Commit only the completed, verified task's intended changes; an explicit no-commit instruction overrides the default local-commit workflow.
- Read-only reviews create no edits or commits. Push only when explicitly requested. Do not initialize Git, create a remote, or open a pull request solely because these guidelines exist.
- Inspect status and diffs before staging. Preserve unrelated user changes and stage only intended files.
- Never commit environment secrets, API credentials, private travel data, generated recordings, or personal evidence uploads.
- Avoid destructive Git operations and force pushes unless explicitly authorized.
- Follow actual branch protection and the team's agreed workflow. Do not assume that main is protected or that a pull request is mandatory.

## Commit Messages

Use concise conventional commits when no existing convention supersedes them:

- `feat(incidents): expire stale reports`
- `fix(sharing): enforce summary revocation`
- `test(routes): cover unaffected journeys`
- `docs(ai): add traffic project guidelines`

The subject describes the change. Add a body only when the reason or a limitation needs explanation.

## Before Committing

Run applicable configured checks (`just check` for the full suite or `just test` and `just lint` individually), complete relevant browser verification, and update affected documentation. Record verification commands, outcomes, and limitations in `docs/progress.md` and include the verification record in the scoped commit. Failed or blocked required checks do not make a task verified; report them rather than claiming completion. Preserve user review and inspect the staged diff before committing. Report the resulting commit hash and record it in `docs/progress.md`; do not amend solely to embed a commit's own hash. Never claim a commit, push, or pull request succeeded without confirming the tool result.
