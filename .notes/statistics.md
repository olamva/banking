# Statistics

## Goal

Add a statistics experience that reveals counterparties, merchants, category patterns, weekday habits, yearly patterns, and likely return behavior. Complete tests, visual review, pull request checks, merge, and branch cleanup.

## Established facts

<!-- append-only. each line cost time to learn. -->

- `pnpm build` intentionally rejects linked worktrees because `data/dist` belongs to the main checkout.
- SB1 list data gives legacy debit purchases only one date. Downtown has 56 of 58 legacy rows on Mondays.
- Card accounts provide purchase dates. Downtown has four card visit days, with three from Friday through Sunday.
- Expected return dates advance by the median interval until they reach the current Oslo date.

## Open decisions

<!-- questions for the user. ask these before building, not after. -->

## Dead ends

<!-- what was tried and did not work, and why. stops rediscovery. -->
