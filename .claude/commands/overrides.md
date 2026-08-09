---
description: Review merchants against overrides.json and suggest changes, only if needed
allowed-tools: Bash(sqlite3:*), Read, Edit
---

Review how spending is categorised and suggest improvements to `overrides.json`
— **only where there is a real problem**. "No changes needed" is a valid and
common answer; say it in one line and stop.

## Data

Current overrides:

@overrides.json

Payees paid person-to-person, appended to the overrides above as
`vipps`. A new name belongs in this file, never in `overrides.json`:

@vipps.json

Every merchant with the category it currently gets (spending rows only,
excluded rows dropped, amounts in NOK, biggest first):

!`sqlite3 -noheader -separator ' | ' data/banking.db "select cast(round(sum(-amount)) as int), count(*), category, coalesce(counterparty, description) from transactions where excluded=0 and amount<0 group by category, coalesce(counterparty, description) order by 1 desc;"`

## How categorisation works

`src/core/categorize.ts`: patterns are case-insensitive substrings, checked in
**file order, first match wins**, against `description + ' ' + counterparty`.
No match → `reise` if the card merchant's trailing ISO country is not `NOR`,
otherwise the bank's own category, and `ukategorisert` for a card row or for the
bank's `diverse` catch-all.

## What counts as worth flagging

- **`ukategorisert`** on real money — the one bucket that carries no
  information. Sort by amount: a 4 000 kr merchant is worth a pattern, a 39 kr
  one-off is not.
- **A foreign biller sitting in `reise`** — the country rule calls anything
  bought outside NOR a trip, so an online subscription billed abroad lands
  there. An override is what corrects it.
- **The same merchant in two categories** — usually the card row and the bank
  row of the same shop, only one of which a pattern reaches.
- **A pattern that matches nothing** in the list above — dead, or it broke when
  a merchant string changed.
- **A pattern that is too broad** — it also catches merchants below it that
  should land elsewhere. Order matters, so also flag a specific pattern sitting
  *after* a general one that swallows it.

Ignore: person-to-person names, one-off travel merchants, anything under a few
hundred kroner in total. A pattern per transaction is worse than no pattern.

## Output

Reuse the category names already in the data — do not invent a new vocabulary.

For each suggestion, one line: the pattern, the category, why, and the kroner
it moves. Then the exact JSON to add, in the order it should sit in the file.
Ask before editing `overrides.json`; after an edit, run `pnpm sb1 rebuild`.
