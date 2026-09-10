# Bulk transactions

## Goal

Add filtered transaction bulk actions. Validate the changes, create a PR, and merge after all checks pass.

## Established facts

- The task preview runs on port 4060. Vite isolates its database in data.local.
- The supplied filter works in the task preview. Its rename action adds no matches outside the selection.
- The phone interface passes save and undo checks against synthetic data on port 4061.
- CI requires Tests, types, and build. The worktree build guard reserves build validation for CI.

- All 342 tests pass without skips. Type checking passes.
- Synthetic interface checks cover renaming, category changes, undo, retained filters, and retry after failure.

## Open decisions

None.

## Dead ends

- Sandbox restrictions block registry DNS and local server ports. Approved commands complete these operations.
