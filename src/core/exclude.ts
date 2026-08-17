import type { Classified, Txn } from "./types.ts";

/**
 * rules/accounts.json: SB1 account key -> whether it's ours, and its number.
 *
 * - `number` — optional; without it an account falls back to the amount+date
 *   rule below.
 * - `sync: false` — the entry exists for its *number* alone, there being no key
 *   `/transactions` answers for. Read in `src/net/sync.ts`.
 * - `investment: true` — the fund manager's settlement account. Money crossing
 *   it is capital changing form, see `investmentReason`.
 * - `name` — what the account is called on the page, and the only field here
 *   the browser ever sees.
 * - `card: true` — the credit card, deliberately not `mine`, since `mine` means
 *   a deposit account both legs of a transfer can sit in.
 * - `issuer: true` — the card issuer's collection account, where the bill is
 *   paid to. See `BANK_BILL`.
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
    /**
     * Kroner in the account before the first row on record, so `reconcile` can
     * close: SB1 serves no history before 2003, so an older account arrives
     * already holding something. Omitted means zero.
     *
     * A *balance*, so no money total may read it — `stats.ts` sums flows, and a
     * stock added to either side makes the page's net neither one thing nor the
     * other.
     */
    opening?: number;
    investment?: boolean;
    card?: boolean;
    issuer?: boolean;
  }
>;

/**
 * The bank-account leg of a card bill, matched two ways because the description
 * is not dependable: SB1 words the row after the *channel* when the bill is
 * paid by hand, and `Mobilgiro m/KID, forfall i dag` names no payee at all.
 *
 * The issuer's collection account number is the real key. The name is the
 * fallback, and deliberately not the full `Kredittbanken ASA` — the issuer also
 * books these as `Kredittbanken - del av SpareBank 1`.
 */
const BANK_BILL = "Kredittbanken";

/**
 * The card leg of the same payment. Both legs have to go: excluding only the
 * bank side leaves the credit counted as income.
 *
 * It cannot ride on the amount+date rule — the card is not `mine`, and the
 * credit posts 0-3 days after the bank debits it. Card credits that are not a
 * payment stay in: a merchant refund and cashback are both real.
 */
const CARD_BILL = "Innbetaling";

/**
 * The bank's own word for a row that moves money rather than spends it, matched
 * on the stem to cover all four spellings SB1 uses.
 *
 * This is the whole guard against a coincidence reading as a transfer. Amount +
 * date + opposite sign is a weak signal at these volumes — a 22 kr coffee and
 * 22 kr of deposit interest on one day satisfy it perfectly. Both legs are
 * checked, never one: excluding a row whose counterpart stays in breaks the
 * invariant that every reason nets to zero.
 */
const TRANSFER_TYPE = /overf(ø|o)r/i;

/** Card rows say `Transaksjon` or `Kredittkort`, neither of which is a transfer. */
const isTransferType = (t: Txn): boolean =>
  TRANSFER_TYPE.test(t.typeText ?? "");

/**
 * Cash entering the bank, which can never be a move between two of my accounts.
 *
 * A deposit machine stamps `remoteAccountNumber` with an account of mine, and
 * *which* one is not meaningful — it records the card fed into the terminal,
 * not a counterparty. There is no second leg, because the money came from a
 * pocket.
 */
const CASH_IN = /^(innskudd automat|kontantinnskudd)/i;

const isCashDeposit = (t: Txn): boolean => CASH_IN.test(t.typeText ?? "");

/**
 * Which rows are one leg of a genuine pair, decided once for the whole month.
 *
 * Pairing is 1:1, which an existence check is not: two +200 rows and one −200
 * row would all answer yes and get 200 kr excluded twice against one
 * counterpart. A leg may be spent once.
 *
 * Greedy is deterministic here — within one date and one absolute amount every
 * candidate is interchangeable but for its account. The counterpart must sit on
 * a *different* account, since nothing moves between an account and itself.
 */
function transferPairs(txns: Txn[], mine: Set<string>): Set<string> {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (!mine.has(t.accountKey) || !isTransferType(t)) continue;
    const k = `${t.date}|${Math.abs(t.amount).toFixed(2)}`;
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }

  const paired = new Set<string>();
  for (const group of groups.values()) {
    const credits = group.filter((t) => t.amount > 0);
    const debits = group.filter((t) => t.amount < 0);
    const taken = new Set<number>();
    for (const credit of credits) {
      const i = debits.findIndex(
        (d, j) => !taken.has(j) && d.accountKey !== credit.accountKey,
      );
      if (i === -1) continue;
      taken.add(i);
      paired.add(credit.id);
      paired.add(debits[i].id);
    }
  }
  return paired;
}

/**
 * Flags, never drops, so the excluded set stays auditable. Two rules:
 * - internal transfer: another txn in a different `mine` account, same date,
 *   opposite-signed equal amount, and *both* rows typed as a transfer.
 * - credit card bill, either leg: matched by description, since bill amounts do
 *   not track card spend within a month.
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

  const paired = transferPairs(txns, mine);

  return txns.map((t) => {
    const reason =
      billReason(t, cards, issuerNumbers) ??
      investmentReason(t, fundNumbers) ??
      transferReason(
        t,
        paired,
        mine,
        myNumbers,
        accounts[t.accountKey]?.number,
      );
    return { ...t, excluded: reason !== null, reason };
  });
}

/**
 * Buying or selling a fund is capital changing form, not money earned or spent.
 * Both directions cross the fund manager's settlement account, which is what
 * names them.
 *
 * **One-sided on purpose, and exempt from the nets-to-zero check**: the
 * counter-leg is booked at the fund manager and is not in `data/raw/` at all,
 * so there is no second row to net against. No `mine` test — a movement to the
 * fund manager is not spending whoever holds the account it left.
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
  paired: Set<string>,
  mine: Set<string>,
  myNumbers: Set<string>,
  own: string | undefined,
): string | null {
  if (!mine.has(t.accountKey)) return null;
  // The other party *is* one of my accounts — proof rather than coincidence, so
  // it needs neither a transfer type nor a counterpart search. It is the only
  // rule that sees a self-transfer the bank did not type as one: a giro between
  // my own accounts books as `NettGiro m/melding`, which says no `overfør`.
  //
  // Netting still holds, because each leg carries the other account's number:
  // either both match or neither does.
  //
  // Two exceptions, both the same mistake — a number on the row that is not a
  // counterparty. Nothing moves between an account and itself, and a cash
  // deposit is never a transfer whichever account the machine stamped on it.
  if (
    t.remoteAccountNumber &&
    t.remoteAccountNumber !== own &&
    !isCashDeposit(t) &&
    myNumbers.has(t.remoteAccountNumber)
  )
    return "internal transfer";
  return paired.has(t.id) ? "internal transfer" : null;
}
