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
  /**
   * The terminal's country, where the row carries one.
   *
   * Card rows arrive as `NAME, CITY, COUNTRY`, so the country is a field the
   * bank already sends rather than anything inferred — `countryOf` in
   * `names.ts` reads it off that tail, and null everywhere else. BankAxept rows
   * have no country on them at all, which is why a domestic card purchase says
   * `Norway` and a Rema shop says nothing: the difference is what the channel
   * sent, not where you were.
   *
   * It is a label and a filter axis, never a money field. The travel guess in
   * `categorize` still reads the name's own tail and is untouched by this —
   * merging the two would tie a category rule to a display field.
   */
  country: string | null;
  /** The bank's own category. Set on card rows too — it classifies those itself. */
  bankCategory: string | null;
  /**
   * The bank's own *sub*category — the half that was thrown away until now, and
   * the reason half of `rules/overrides.json` exists at all.
   *
   * Present on all 8 547 booked rows of the record, always alongside a `main`,
   * 68 distinct pairs. It is where the signal actually is: `diverse` is the
   * bank's biggest main and reads like a shrug, but it splits into
   * `vennebetaling` (1 119 rows), `overforing` (1 178), `renter_og_gebyrer`,
   * `medlemskap_veldedighet`, `minibank`, `skatt` — every one of which
   * `rules/overrides.json` re-derives by hand. Only `ukategorisert/annet` is a
   * real shrug.
   *
   * Null only where the bank sends no category at all, which so far is never.
   */
  bankSub: string | null;
  /**
   * What the bank calls `bankCategory` and `bankSub` in Norwegian — `Helse og
   * velvære`, `Apotek`. Carried on the row rather than looked up, for the same
   * reason `account` is: `stats.ts` runs in the browser, where there is no
   * table to join against.
   *
   * These name the *bank's* pair. A category our own rules invent has no bank
   * name and takes its label from `rules/categories.json` instead.
   */
  bankCategoryName: string | null;
  bankSubName: string | null;
  /**
   * 0-100, the bank's own confidence in that pair.
   *
   * 7 802 of 8 547 rows are at 100 and the rest fall away sharply, so this is a
   * flag rather than a scale: below about 50 the bank is usually guessing from
   * a merchant name it does not know, and 31 rows of a student society's kiosk
   * arrive as `faste_boutgifter/alarm` that way. 441 rows carry a second and
   * third candidate, always sorted by confidence down — `normalize` keeps the
   * first, which is the highest.
   *
   * Nothing gates on it today. It is here so the divergence report can say
   * *how much* the bank believes what it just said.
   */
  bankConfidence: number | null;
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
  /** Final category after overrides. */
  category: string;
  /**
   * The second level of it, or null where the deciding rule named only one.
   *
   * A rule value carrying a `/` sets both — `"kafe_og_restaurant/utesteder"` —
   * and a bare value sets the category alone, which is what every entry in
   * `rules/overrides.json` still is until it is rewritten. That is deliberate:
   * the two forms coexist so the rules can be migrated a line at a time without
   * the page moving under them, since `category` is the same string either way.
   *
   * Where no rule fires, this is the bank's own `bankSub`.
   */
  subcategory: string | null;
};
