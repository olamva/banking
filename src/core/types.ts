/**
 * The canonical record. Both sources normalize into this and everything
 * downstream reads only this — nothing past normalize touches data/raw/ shapes.
 */
export type Source = 'sb1' | 'card';

export type Txn = {
  /** Stable per source. SB1's opaque id, or the card's transaction_id. */
  id: string;
  source: Source;
  /** SB1 account key, or the Enable Banking account uid for card rows. */
  accountKey: string;
  /** Booking date, YYYY-MM-DD, Europe/Oslo. Never mix in transaction_date. */
  date: string;
  /** Signed. Negative is money out. */
  amount: number;
  description: string;
  /**
   * Null on a card row until the issuer's statement export fills it in — the
   * Enable Banking API exposes no merchant at all. See src/statement.ts.
   */
  counterparty: string | null;
  /** The bank's own category. Null on card rows. */
  bankCategory: string | null;
  /**
   * What the bank calls this *kind* of row — `VISA Varekjøp`, `Kreditrente`,
   * `Overførsel mellom egne kontoer`. Generic by design and never a merchant,
   * which is what makes it the one field that says whether a row is a transfer
   * at all rather than a purchase that happens to match one. Null on card rows:
   * Enable Banking has no equivalent.
   */
  typeText: string | null;
  isRecurring: boolean;
  isSubscription: boolean;
  /** Card rows can be PDNG, so a re-synced month may legitimately change. */
  isPending: boolean;
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
