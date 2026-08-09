import type { Txn, Classified } from './types.ts';

/**
 * rules/accounts.json: SB1 account key -> whether it's ours, and its number.
 *
 * `number` is optional so an older hand-edited file still loads; without it an
 * account simply falls back to the amount+date rule below, exactly as before.
 * `pnpm sb1 accounts` writes it, from the same response the keys come from.
 */
export type Accounts = Record<string, { mine: boolean; number?: string }>;

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
  const ours = Object.entries(accounts).filter(([, a]) => a.mine);
  const mine = new Set(ours.map(([key]) => key));
  const myNumbers = new Set(ours.map(([, a]) => a.number).filter((n): n is string => !!n));

  return txns.map((t) => {
    const reason = billReason(t) ?? transferReason(t, txns, mine, myNumbers);
    return { ...t, excluded: reason !== null, reason };
  });
}

function billReason(t: Txn): string | null {
  if (t.source === 'card') {
    return t.description.includes(CARD_BILL) ? 'credit card bill payment (card side)' : null;
  }
  return t.description.includes(BANK_BILL) ? 'credit card bill payment' : null;
}

function transferReason(t: Txn, all: Txn[], mine: Set<string>, myNumbers: Set<string>): string | null {
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
  if (t.remoteAccountNumber && myNumbers.has(t.remoteAccountNumber)) return 'internal transfer';
  if (!isTransferType(t)) return null;
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
