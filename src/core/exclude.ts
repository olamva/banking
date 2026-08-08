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
 * Flags, never drops. Two rules, checked per transaction:
 * - internal transfer: another txn in a different `mine` account, same date,
 *   opposite-signed equal amount.
 * - credit card bill payment, either leg: matched by description, since bill
 *   amounts don't track card spend within a month.
 *
 * ponytail: O(n^2) transfer scan (every txn checks every other txn). Fine at
 * personal-banking volumes; index by (date, amount) if a year ever gets slow.
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
  if (!mine.has(t.accountKey)) return null;
  const hasCounterpart = all.some(
    (o) =>
      mine.has(o.accountKey) &&
      o.accountKey !== t.accountKey &&
      o.date === t.date &&
      o.amount === -t.amount,
  );
  return hasCounterpart ? 'internal transfer' : null;
}
