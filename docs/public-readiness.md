# Public release assessment

Assessment date: 2026-09-06.

Keep this repository private until the privacy review finishes.

## Findings

The repository excludes `data`, `rules`, environment files, private keys, Terraform state, and variable files.
The reachable local history contains no files under `data/` or `rules/`.
The history contains operational notes under `.notes/` and reports under `.papercuts/`.
Historical `docs/PRIVACY.md` and `docs/TERMS.md` contain personal email addresses.
Current `test/core/categorize-rules.test.ts` contains account numbers and specific payment amounts.
Their origin is unknown. Treat these fixtures as private until reviewed.
The README contains a specific street address in a rule example.
`infra/backend.tf` contains the deployment storage account name.
This name is an infrastructure identifier, not a credential.

A limited scan covers 4,986 reachable local Git objects.
It checks private key markers and common GitHub and Google token formats.
It finds no matches for those patterns.
This scan does not establish that every credential or personal detail is absent.
It does not cover remote-only references, PR attachments, discussions, or external copies.

## Required privacy work

1. Replace identifying fixtures and examples with synthetic names, accounts, addresses, dates, and amounts.
2. Review `.papercuts/`, historical `.notes/`, commit messages, and author email addresses.
3. Scan all branches, tags, and PR references with a dedicated secret scanner using redacted output.
4. Rotate any discovered credentials before removing their history.
5. Review PR bodies, comments, attachments, issues, releases, wiki content, and Actions logs before changing visibility.
6. Remove private content from retained history and GitHub surfaces, or publish a clean repository with sanitized files.
7. Keep the separate `rules/` repository and all banking data private.

A clean public repository avoids exposing this repository's operational history and PR discussions.
Keep the existing repository private if you choose that route.
Deleting a file in a new commit does not remove its previous contents.
GitHub documents additional cleanup requirements for [sensitive data in repository history](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
GitHub makes Actions history and logs public after a [visibility change](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## Reuse and setup

Choose a license if you want others to reuse the code.
No license file exists in the tracked tree at assessment time.
Public visibility alone does not grant an open-source license.
See GitHub's [repository licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

Replace deployment-specific backend names with documented local configuration before offering reusable deployment instructions.
Add a synthetic offline example and document setup without the owner's data, keychain, or Azure account.
Keep `package.json` private to prevent accidental package publication.
Source visibility does not require changing the dashboard's authentication or network exposure.

## Workflows

CI runs lint, 322 tests, type checking, and the production build on PRs and pushes to `main`.
It uses Node 26 and pnpm 11.12.0 with the frozen lockfile.
It receives read-only repository access and no Azure credentials.
It uploads no banking data or build artifacts.
Dependabot proposes weekly package and action updates.
The PR monitoring skill waits for successful checks on the current PR commit before an authorized merge.

Require `Tests, types, and build` in branch protection after its first successful run.
The current protection has no required check names.
The skill guides agents; branch protection enforces the same condition for every merger.
Consider CodeQL after public release and secret scanning with push protection where the repository plan supports them.
