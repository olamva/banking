# Release notes

## Goal

Show the current app version in the footer. Show curated release notes in a dialog. Merge after CI and visual approval.

## Established facts

- The app had no version source or release-note format before this change.
- The release manifest is `src/web/app/releases.ts`.
- The local preview uses `http://127.0.0.1:4022/`.
- The 375-pixel layout has no horizontal page scroll.
- All 346 tests pass. TypeScript passes.

## Open decisions

- The visual change needs user approval before merge.

## Dead ends

- Computer Use had no browser surface. The T3 preview worked after discovery.
