# Workflows and public release

## Goal

Add checks without Azure access. Add a PR monitoring skill. Assess public release requirements.

## Established facts

The repository has no GitHub workflows at task start.
The sandbox cannot reach api.github.com.

## Open decisions

Choose a license before public release.

## Dead ends

The first GitHub repository query fails because network access is restricted.

GitHub confirms PRIVATE visibility and enabled Actions.
Main has strict status checking but no required check names.
All 322 local tests pass without skips. Type checking passes.
The limited history scan covers 4,986 objects and finds personal emails in three paths.
Automatic approval review rejects a command containing PR merge help with: Do not merge pull requests from Codex.
