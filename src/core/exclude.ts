import type { Txn, Classified } from './types.ts';

/** accounts.json: SB1 account key -> whether it's ours. */
export type Accounts = Record<string, { mine: boolean }>;

/**
 * The bank-account leg of a card bill payment. Deliberately not the full
 * `Kredittbanken ASA`: the issuer also books these as
 * `Kredittbanken - del av SpareBank 1`, and the narrower string silently
 * missed those.
 */
const BANK_BILL = 'Kredittbanken';

/**
 * The card leg of the same payment. The bank debit and the card credit are
 * one transfer seen from both ends, so both have to go — excluding only the
 * bank side leaves the credit counted as income.
 *
 * This can't ride on the amount+date transfer rule: the card posts the credit
 * 0-3 days after the bank debits, so the dates disagree. Matching on the
 * card's own wording is what actually pairs them, and every `Innbetalinger`
 * row observed so far reconciles 1:1 by amount with a bank-side bill.
 * Merchant refunds arrive as `Varekjøp` credits and are genuine negative
 * spending, so they stay in.
 */
const CARD_BILL = 'Innbetalinger';

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

/** Card rows have no `typeText` at all, so they can never be a transfer leg — which is correct. */
const isTransferType = (t: Txn): boolean => TRANSFER_TYPE.test(t.typeText ?? '');

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
  const mine = new Set(Object.entries(accounts).filter(([, a]) => a.mine).map(([key]) => key));

  return txns.map((t) => {
    const reason = billReason(t) ?? transferReason(t, txns, mine);
    return { ...t, excluded: reason !== null, reason };
  });
}

function billReason(t: Txn): string | null {
  if (t.source === 'card') {
    return t.description.includes(CARD_BILL) ? 'credit card bill payment (card side)' : null;
  }
  return t.description.includes(BANK_BILL) ? 'credit card bill payment' : null;
}

function transferReason(t: Txn, all: Txn[], mine: Set<string>): string | null {
  if (!mine.has(t.accountKey) || !isTransferType(t)) return null;
  const hasCounterpart = all.some(
    (o) =>
      mine.has(o.accountKey) &&
      o.accountKey !== t.accountKey &&
      o.date === t.date &&
      o.amount === -t.amount &&
      isTransferType(o),
  );
  return hasCounterpart ? 'internal transfer' : null;
}
