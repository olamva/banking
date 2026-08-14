import type { Classified, Txn } from "./types.ts";

/**
 * rules/accounts.json: SB1 account key -> whether it's ours, and its number.
 *
 * `number` is optional so an older hand-edited file still loads; without it an
 * account simply falls back to the amount+date rule below, exactly as before.
 * `pnpm sb1 accounts` writes it, from the same response the keys come from.
 *
 * `sync: false` marks an entry that exists for its *number* alone — there is no
 * key `/transactions` would answer for, so `accountKeys` skips it. Nothing in
 * this module reads the flag; see `src/net/sync.ts`.
 *
 * `investment: true` is the fund manager's settlement account, which is not
 * mine and never will be. Money crossing it is my own capital changing form,
 * not spending and not income — see `investmentReason`.
 *
 * `name` is what the account is called on the page — see `Txn.account`. It is
 * the only field here that is not about money, and the only one the browser
 * ever sees.
 *
 * `card: true` is the credit card, and it is deliberately **not** `mine`:
 * `mine` means "a deposit account both legs of an internal transfer can sit
 * in", and the card is not one. `billReason` is the one reader — a bill payment
 * is worded one way on the card and another on the account that pays it, so
 * something has to say which side a row is on.
 *
 * `issuer: true` is the card issuer's *collection* account — where the bill is
 * paid to, not the card itself. Like `investment`, it exists for its `number`
 * alone and is neither mine nor synced. See `BANK_BILL`.
 */
export type Accounts = Record<
  string,
  {
    mine: boolean;
    name?: string;
    number?: string;
    sync?: boolean;
    /** `YYYY-MM` the account opened — see `accountKeys`. */
    from?: string;
    investment?: boolean;
    card?: boolean;
    issuer?: boolean;
  }
>;

/**
 * The bank-account leg of a card bill payment, matched two ways because the
 * description is not dependable.
 *
 * The **issuer's collection account number** is the real key: every bill leg on
 * record names it, 22 of 22. It is not an account of mine, so the `mine` number
 * rule below can never see it — it is named in `rules/accounts.json` by
 * `issuer: true`, the same shape as the fund manager's settlement account.
 *
 * The **name** stays as a fallback, and deliberately not the full
 * `Kredittbanken ASA`: the issuer also books these as
 * `Kredittbanken - del av SpareBank 1`, and the narrower string silently missed
 * those.
 *
 * The name alone was not enough. SB1 words this row after the *channel* when
 * the bill is paid by hand — `Mobilgiro m/KID, forfall i dag` names no payee at
 * all, and the issuer appears only in `remoteAccountName`, which `normalize`
 * drops whenever a `cleanedDescription` exists. That left the bank leg counted
 * as 4 941 kr of spending while the card credit was excluded, so the pair did
 * not net to zero.
 */
const BANK_BILL = "Kredittbanken";

/**
 * The card leg of the same payment. The bank debit and the card credit are
 * one transfer seen from both ends, so both have to go — excluding only the
 * bank side leaves the credit counted as income.
 *
 * This can't ride on the amount+date transfer rule: the card is not a `mine`
 * account, and the credit posts 0-3 days after the bank debits it anyway.
 * Matching on the card's own wording is what actually pairs them, and every
 * such row observed so far reconciles 1:1 by amount with a bank-side bill.
 *
 * `Innbetaling` singular is SB1's wording; Enable Banking said `Innbetalinger`,
 * which this still matches as a prefix. Card credits that are *not* a payment
 * stay in: a merchant refund is a real negative spend, and
 * `Rabatt strømmetjenester` is cashback.
 */
const CARD_BILL = "Innbetaling";

/**
 * The bank's own word for a row that moves money rather than spends it:
 * `Overføring`, `Overførsel`, `Overførsel mellom egne kontoer`. Matched on the
 * stem, which covers all four spellings SB1 uses.
 *
 * This is the whole guard against a coincidence reading as a transfer. Amount +
 * date + opposite sign is a *weak* signal at personal-banking volumes — a 22 kr
 * coffee and 22 kr of deposit interest on the same day satisfy it perfectly, and
 * did, twice. `typeText` is what the bank calls the row before anyone matches
 * anything, so a purchase cannot pass it however well its number lines up.
 *
 * Both legs are checked, never one. Excluding a row whose counterpart stays in
 * breaks the invariant the whole scheme rests on — that every excluded reason
 * nets to zero across the pair.
 */
const TRANSFER_TYPE = /overf(ø|o)r/i;

/**
 * Card rows carry a `typeText` of their own — `Transaksjon` on a booked
 * purchase, `Kredittkort` on the rest — and neither is a transfer, which is
 * correct: nothing on the card is a leg of a move between my own accounts. That
 * used to hold because the field was null on every card row, so it rests on the
 * value now and not on the absence.
 */
const isTransferType = (t: Txn): boolean =>
  TRANSFER_TYPE.test(t.typeText ?? "");

/**
 * Flags, never drops. Two rules, checked per transaction:
 * - internal transfer: another txn in a different `mine` account, same date,
 *   opposite-signed equal amount, and *both* rows typed as a transfer by the
 *   bank.
 * - credit card bill payment, either leg: matched by description, since bill
 *   amounts don't track card spend within a month.
 *
 * ponytail: O(n^2) transfer scan (every txn checks every other txn). Fine at
 * personal-banking volumes; index by (date, amount) if a year ever gets slow.
 *
 * ponytail: pairing is `some`, not 1:1 — three same-day rows of ±2000 across
 * two accounts all match each other, and all three were flagged. The type check
 * above is what actually caught that one, since the odd leg out was a
 * `Straksbetaling` from another person. Greedy 1:1 matching if a genuine
 * transfer ever collides with another genuine transfer of the same amount.
 */
export function exclude(txns: Txn[], accounts: Accounts): Classified[] {
  const ours = Object.entries(accounts).filter(([, a]) => a.mine);
  const mine = new Set(ours.map(([key]) => key));
  const numbers = (pick: (a: Accounts[string]) => boolean) =>
    new Set(
      Object.values(accounts)
        .filter(pick)
        .map((a) => a.number)
        .filter((n): n is string => !!n),
    );
  const myNumbers = numbers((a) => a.mine);
  const fundNumbers = numbers((a) => !!a.investment);
  const issuerNumbers = numbers((a) => !!a.issuer);
  const cards = new Set(
    Object.entries(accounts)
      .filter(([, a]) => a.card)
      .map(([key]) => key),
  );

  return txns.map((t) => {
    const reason =
      billReason(t, cards, issuerNumbers) ??
      investmentReason(t, fundNumbers) ??
      transferReason(t, txns, mine, myNumbers, accounts[t.accountKey]?.number);
    return { ...t, excluded: reason !== null, reason };
  });
}

/**
 * Buying or selling a fund is capital changing form, not money earned or spent.
 * Both directions cross the fund manager's settlement account, which is what
 * names them: 5 000 kr of fund purchases read as spending on the deposit
 * accounts, and 5 179 kr of settlements read as income on the share savings
 * account, where they were the other half of withdrawals already excluded.
 *
 * **This reason is one-sided on purpose and must stay out of the nets-to-zero
 * check.** The counter-leg is booked at the fund manager and is not in
 * `data/raw/` at all, so unlike an internal transfer there is no second row to
 * net against — which is exactly why it is not filed as one.
 *
 * No `mine` test: every row here is on an account we sync, and a movement to
 * the fund manager is not spending whoever holds the account it left.
 */
function investmentReason(t: Txn, fundNumbers: Set<string>): string | null {
  return t.remoteAccountNumber && fundNumbers.has(t.remoteAccountNumber)
    ? "investment movement"
    : null;
}

function billReason(
  t: Txn,
  cards: Set<string>,
  issuerNumbers: Set<string>,
): string | null {
  if (cards.has(t.accountKey)) {
    return t.description.includes(CARD_BILL)
      ? "credit card bill payment (card side)"
      : null;
  }
  const toIssuer =
    !!t.remoteAccountNumber && issuerNumbers.has(t.remoteAccountNumber);
  return toIssuer || t.description.includes(BANK_BILL)
    ? "credit card bill payment"
    : null;
}

function transferReason(
  t: Txn,
  all: Txn[],
  mine: Set<string>,
  myNumbers: Set<string>,
  own: string | undefined,
): string | null {
  if (!mine.has(t.accountKey)) return null;
  // The other party *is* one of my accounts. That is not a coincidence the way
  // amount+date is, so it needs neither a transfer type nor a counterpart
  // search: the row names the account it moved to, and I own it.
  //
  // This is the only rule that catches a self-transfer the bank did not type as
  // one. A giro to my own account books as `NettGiro m/melding` against
  // `Betaling med melding` — neither says `overfør`, so the pair below never saw
  // it, and 5 572 kr counted as both income and spending. `Småsparing` round-ups
  // are the same shape, 238 rows of it.
  //
  // Netting still holds without a pair search, because it is symmetric: each leg
  // carries the other account's number, so either both legs match or neither
  // does.
  //
  // Except when the number *is* the row's own account. A cash deposit at a
  // machine books as `Innskudd automat` stamped with the account it landed in,
  // and reading that as "the other party is mine" excluded 68 kr of real income
  // with no second leg anywhere — which is precisely how the netting check
  // surfaced it. Nothing moves between an account and itself.
  if (
    t.remoteAccountNumber &&
    t.remoteAccountNumber !== own &&
    myNumbers.has(t.remoteAccountNumber)
  )
    return "internal transfer";
  if (!isTransferType(t)) return null;
  const hasCounterpart = all.some(
    (o) =>
      mine.has(o.accountKey) &&
      o.accountKey !== t.accountKey &&
      o.date === t.date &&
      o.amount === -t.amount &&
      isTransferType(o),
  );
  return hasCounterpart ? "internal transfer" : null;
}
