// Flattens data/raw/<month>/*.json into Txn[]. Pure, no network.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Txn } from "./types.ts";

type Sb1File = {
  transactions: Array<{
    transaction: {
      id: string;
      accountKey: string;
      amount: number;
      /** Epoch millis at Oslo midnight — never format as UTC. */
      date: number;
      /**
       * Both description fields are *absent* on some rows — 101 of 4043 so far,
       * all of them plain transfers and payments-with-message. The key is
       * missing, not null, so nothing downstream can rely on it being a string.
       */
      description?: string;
      cleanedDescription?: string;
      /**
       * The other side of a transfer or payment-with-message, as the payer
       * typed it. Present on 391 of 4043 rows, and the *only* name on the 10
       * that carry no cleanedDescription — which is exactly why it is the
       * counterparty fallback below.
       */
      remoteAccountName?: string;
      /** The other party's account number — see `Txn.remoteAccountNumber`. */
      remoteAccountNumber?: string;
      /**
       * The bank's own name for the row type — `VISA Varekjøp`, `Kreditrente`,
       * `Overførsel mellom egne kontoer`. Present on all 4043 rows so far, and
       * always generic, which is exactly why `exclude` trusts it over any
       * description to say whether a row is a transfer.
       */
      typeText?: string;
      /** `BOOKED` or `PENDING` — see the filter in `normalizeSb1`. */
      bookingStatus?: string;
    };
    /**
     * The bank's classification, richest to poorest — 441 of 8 547 rows carry
     * more than one candidate and every one of them is sorted by `confidence`
     * descending, so the first entry is the best and the rest are discarded.
     *
     * `sub`, `mainI18n` and `subI18n` are present on every row that has a
     * `main`, without exception across the record. They are typed optional
     * anyway: the bank has never promised them, and a missing key must read as
     * "no subcategory" rather than crash a rebuild of four thousand rows.
     */
    categories: Array<{
      main: string;
      sub?: string;
      mainI18n?: string;
      subI18n?: string;
      confidence?: number;
    }>;
    recurring: boolean;
    subscription: boolean;
  }>;
};

function osloDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
}

/**
 * The card sends `-1` where it has no counterparty account, which is every row
 * but the bill payment. It is a placeholder, not a number, and it must not reach
 * the override haystack or the `mine`-account match as if it were one.
 */
const NO_ACCOUNT = "-1";

/**
 * A cleaned description that names nobody. SB1 words a payment-with-message as
 * `Til: <account number>` and cleans it to a bare `Til:` — the preposition with
 * the payee taken out of it, and the account number with it.
 *
 * It has to lose to `remoteAccountName`, which on both rows on record carries a
 * real name. Letting it win costs the row its name *and* its category: the
 * number survives in `remoteAccountNumber`, but `haystackOf` never sees
 * `remoteAccountName`, so one month of a standing rent payment reached the page
 * uncategorised while the same payee's eleven others matched `/\bleie\b/` on the
 * name the bank had left on them. The other row is a transfer to an account of
 * mine, already excluded, and only ever wanted the better name.
 *
 * Only the *empty* case, deliberately. `Til: Ola Munthe Vassbotn - Online` is
 * the same wording with a payee still in it, and it is the best string on that
 * row.
 */
const NAMES_NOBODY = /^(til|fra)[\s:.-]*$/i;

const named = (s?: string) => (s && !NAMES_NOBODY.test(s.trim()) ? s : undefined);

function normalizeSb1(file: Sb1File, names: Record<string, string>): Txn[] {
  return (
    file.transactions
      // A pending row is a reservation: SB1 reissues it under a *new* id once it
      // books, its amount can still change, and it is dated by the purchase and
      // so carries no booking date to commit to. Rows in the store are booked
      // rows only — that is what makes a re-synced month idempotent. Pending rows
      // land on the deposit accounts too, so this is not a card rule.
      .filter(({ transaction: t }) => t.bookingStatus !== "PENDING")
      .map(({ transaction: t, categories, recurring, subscription }) => ({
        id: t.id,
        accountKey: t.accountKey,
        account: names[t.accountKey] ?? t.accountKey,
        date: osloDate(t.date),
        amount: t.amount,
        // `description` is the string every exclusion rule and override matches on,
        // so it has to stay a string. typeText is the honest fallback: generic, but
        // it is what the bank itself calls the row.
        description: t.description ?? t.typeText ?? "",
        // cleanedDescription first: where both exist they disagree on 117 rows, and
        // the bank's cleaned string is the merchant, while remoteAccountName is
        // whatever the payer typed into the payment. Unless it names nobody —
        // see NAMES_NOBODY, where a bare `Til:` is worth less than either.
        counterparty: named(t.cleanedDescription) ?? t.remoteAccountName ?? null,
        bankCategory: categories[0]?.main ?? null,
        bankSub: categories[0]?.sub ?? null,
        bankCategoryName: categories[0]?.mainI18n ?? null,
        bankSubName: categories[0]?.subI18n ?? null,
        bankConfidence: categories[0]?.confidence ?? null,
        typeText: t.typeText ?? null,
        remoteAccountNumber:
          t.remoteAccountNumber && t.remoteAccountNumber !== NO_ACCOUNT
            ? t.remoteAccountNumber
            : null,
        isRecurring: recurring,
        isSubscription: subscription,
      }))
  );
}

/**
 * Flattens every JSON file in a data/raw/<month> directory into Txn[]. One file
 * per account, named by its key, and the credit card is one of them — the card
 * came from Enable Banking until SB1's own `/transactions/classified` turned out
 * to answer for it with a merchant, a category and an MCC on every row.
 *
 * `names` is account key -> what to call it, from `rules/accounts.json`. A key
 * missing from it keeps the key as its name, so an account added to the bank
 * but not yet to the rules file still reads as something.
 */
export function normalizeMonth(
  dir: string,
  names: Record<string, string> = {},
): Txn[] {
  const out: Txn[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    out.push(
      ...normalizeSb1(JSON.parse(readFileSync(join(dir, file), "utf8")), names),
    );
  }
  return out;
}
