/**
 * The canonical record. Both sources normalize into this and everything
 * downstream reads only this — steps 5 to 7 must never touch data/raw/ shapes.
 *
 * Agreed up front precisely so parallel agents do not each invent their own.
 * Changing it is a cross-cutting change: say so rather than widening it quietly.
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
  /** Null on card rows — the card exposes no merchant at all. */
  counterparty: string | null;
  /** The bank's own category. Null on card rows. */
  bankCategory: string | null;
  isRecurring: boolean;
  isSubscription: boolean;
  /** Card rows can be PDNG, so a re-synced month may legitimately change. */
  isPending: boolean;
};

/**
 * Step 5 output. Exclusions are flagged, never dropped, so the excluded set
 * stays auditable — `reason` is what makes it auditable, so always set it.
 */
export type Classified = Txn & {
  excluded: boolean;
  reason: string | null;
};
