/** The canonical record. Nothing past `normalize` touches data/raw/ shapes. */
export type Txn = {
  /** SB1's id, reissued when a reservation books — never stable across syncs. */
  id: string;
  accountKey: string;
  /**
   * The account's name, from `rules/accounts.json`. The row carries the name
   * and not just the key because `stats.ts` runs in the browser, where there is
   * no rules file to look one up in, and a key must not become a page label.
   */
  account: string;
  /**
   * YYYY-MM-DD, Europe/Oslo. Booking date on a deposit account; **purchase
   * date on the card**, one to three days earlier, because a card booking date
   * exists only on `/transactions/{id}/details` — one request per row against
   * 60 an hour.
   */
  date: string;
  /** Signed. Negative is money out. */
  amount: number;
  description: string;
  /**
   * `cleanedDescription`, falling back to `remoteAccountName`. Null only where
   * the bank sends neither. Card rows arrive as `MERCHANT, CITY, COUNTRY`.
   */
  counterparty: string | null;
  /**
   * The terminal's country, off that card tail, null everywhere else — so a
   * domestic card purchase says `Norway` and a BankAxept row says nothing. A
   * label and a filter axis, never a money field.
   */
  country: string | null;
  bankCategory: string | null;
  bankSub: string | null;
  /** What the bank calls the pair, in Norwegian. Carried for the browser's sake. */
  bankCategoryName: string | null;
  bankSubName: string | null;
  /**
   * 0-100, and a flag rather than a scale: below about 50 the bank is guessing
   * from a merchant name it does not know.
   */
  bankConfidence: number | null;
  /**
   * The other party's account number. It is the only thing separating two
   * services billed by one payee under one name, which is why it is part of the
   * override haystack.
   */
  remoteAccountNumber: string | null;
  /**
   * The bank's name for the *kind* of row — `VISA Varekjøp`, `Overførsel
   * mellom egne kontoer`. Never a merchant, which is what makes it the one
   * field that says whether a row is a transfer at all.
   */
  typeText: string | null;
  isRecurring: boolean;
  isSubscription: boolean;
};

/** Exclusions are flagged, never dropped, so always set `reason`. */
export type Classified = Txn & {
  excluded: boolean;
  reason: string | null;
};

/** What the database stores. */
export type Categorized = Classified & {
  category: string;
  /**
   * Null where the deciding rule named only one level, which reaches the page
   * as `Annet`. Every rule should name both.
   */
  subcategory: string | null;
};
