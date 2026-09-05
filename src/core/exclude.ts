import type { Classified, Txn } from "./types.ts";

export type Accounts = Record<
  string,
  {
    mine: boolean;
    name?: string;
    number?: string;
    sync?: boolean;
    from?: string;
    opening?: number;
    investment?: boolean;
    card?: boolean;
    issuer?: boolean;
  }
>;

const BANK_BILL = "Kredittbanken";

const CARD_BILL = "Innbetaling";

const TRANSFER_TYPE = /overf(ø|o)r/i;

// A card row says `Transaksjon` or `Kredittkort`. Neither value is a transfer.
const isTransferType = (t: Txn): boolean =>
  TRANSFER_TYPE.test(t.typeText ?? "");

const CASH_IN = /^(innskudd automat|kontantinnskudd)/i;

const isCashDeposit = (t: Txn): boolean => CASH_IN.test(t.typeText ?? "");

function transferPairs(txns: Txn[], mine: Set<string>): Set<string> {
  const groups = Map.groupBy(
    txns.filter((t) => mine.has(t.accountKey) && isTransferType(t)),
    (t) => `${t.date}|${Math.abs(t.amount).toFixed(2)}`,
  );

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
  if (
    t.remoteAccountNumber &&
    t.remoteAccountNumber !== own &&
    !isCashDeposit(t) &&
    myNumbers.has(t.remoteAccountNumber)
  )
    return "internal transfer";
  return paired.has(t.id) ? "internal transfer" : null;
}
