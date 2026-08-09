/**
 * The canonical record. Everything normalizes into this and everything
 * downstream reads only this — nothing past normalize touches data/raw/ shapes.
 */

export type Txn = {
  /**
   * SB1's opaque transaction id, reissued when a reservation becomes booked.
   * Unique across accounts, which is what lets it be the database's whole key.
   */
  id: string;
  /** SB1 account key — the join back to `rules/accounts.json`. */
  accountKey: string;
  /**
   * What that account is called, from the `name` in `rules/accounts.json`,
   * falling back to the key when it has none.
   *
   * The row carries the name and not just the key because `stats.ts` runs in
   * the browser, where there is no rules file to look one up in — and a key is
   * a local secret that must not end up as a label on the page. It replaced a
   * `source` field of `bank | card`, which said which API a row came from back
   * when there were two.
   */
  account: string;
  /**
   * YYYY-MM-DD, Europe/Oslo — the one date every sum and every chart is keyed
   * on, and the one SB1 puts on the row.
   *
   * On a deposit account that is the booking date. **On the card it is the
   * purchase date**, one to three days earlier, and that is a decision rather
   * than a drift: a booking date for a card row exists only on
   * `/transactions/{id}/details`, one request per transaction against a 60/hour
   * cap — neither list endpoint carries it, and 500 rows of history is not
   * worth eight hours of budget. A purchase date is also the better answer to
   * "when did I spend this".
   *
   * **It moved money between months, and that was the price.** Reconciled
   * against the Enable Banking booking dates over Feb-Aug 2026: the same 531
   * transactions, to the øre, but SB1 dates them one to three days earlier and
   * about a dozen a month land the other side of a boundary. The largest month
   * moved by 5 700 kr. Any card figure from before the swap is on the other
   * dating and does not compare.
   */
  date: string;
  /** Signed. Negative is money out. */
  amount: number;
  description: string;
  /**
   * `cleanedDescription`, falling back to `remoteAccountName`. Null only where
   * the bank sends neither — a bare `Overføring` with an account number on it.
   * Card rows always carry one, as `MERCHANT, CITY, COUNTRY`.
   */
  counterparty: string | null;
  /** The bank's own category. Set on card rows too — it classifies those itself. */
  bankCategory: string | null;
  /**
   * The other party's account number, as the bank reports it. Null on anything
   * the bank does not name an account for, which is most of the card.
   *
   * It is the only thing that separates two services billed by one payee under
   * one name: SiT's rent and SiT's gym both arrive as `Sit`, with the same
   * type and the same bank category, and differ *only* here. Matched as part of
   * the override haystack for exactly that reason.
   */
  remoteAccountNumber: string | null;
  /**
   * What the bank calls this *kind* of row — `VISA Varekjøp`, `Kreditrente`,
   * `Overførsel mellom egne kontoer`. Generic by design and never a merchant,
   * which is what makes it the one field that says whether a row is a transfer
   * at all rather than a purchase that happens to match one. The card sends
   * `Transaksjon` and `Kredittkort`, neither of which is a transfer.
   */
  typeText: string | null;
  isRecurring: boolean;
  isSubscription: boolean;
};

/**
 * Exclusions are flagged, never dropped, so the excluded set stays auditable —
 * `reason` is what makes it auditable, so always set it.
 */
export type Classified = Txn & {
  excluded: boolean;
  reason: string | null;
};

/** What the database stores. */
export type Categorized = Classified & {
  /** Final category after overrides. Card rows always land in the card bucket. */
  category: string;
};
