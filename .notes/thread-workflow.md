# Thread workflow

## Goal

Automate worktree setup, PR completion, merge checks, and safe cleanup support.

## Established facts

The project mirrors Claude instructions through AGENTS.md and .agents/rules/AGENTS.md symlinks.
Claude and Codex project permissions explicitly deny PR merges at task start.
GitHub requests require sandbox escalation.
The existing CI check is Tests, types, and build.

## Open decisions

## Dead ends

The web tool cannot open the T3 schema URL.

GitHub main protection now requires Tests, types, and build from app 15368 with strict updating.
GitHub now enables automatic remote branch deletion after merge.
The T3 schema supports runOnWorktreeCreate scripts.
Antigravity user permissions already allow gh commands.
Codex loads project execution rules at session startup.

PR 140 passes CI, including tests, types, and build.
The current session rejects gh pr merge with the old Codex prohibition after the repository rule changes.
Start a new agent session to load the updated merge permission before retrying PR 140.
