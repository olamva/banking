// Flattens data/raw/<month>/*.json into Txn[]. Pure, no network.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { countryOf } from "./names.ts";
import type { Txn } from "./types.ts";

type Sb1File = {
  transactions: Array<{
    transaction: {
      id: string;
      accountKey: string;
      amount: number;
      /** Epoch millis at Oslo midnight — never format as UTC. */
      date: number;
      /** Absent — not null — on plain transfers and payments-with-message. */
      description?: string;
      cleanedDescription?: string;
      /**
       * The other side of a transfer, as the payer typed it, and the *only*
       * name on the rows carrying no cleanedDescription — which is why it is
       * the counterparty fallback below.
       */
      remoteAccountName?: string;
      /** The other party's account number — see `Txn.remoteAccountNumber`. */
      remoteAccountNumber?: string;
      /**
       * The bank's own name for the row type, and always generic, which is why
       * `exclude` trusts it over any description to say whether a row is a
       * transfer.
       */
      typeText?: string;
      /** `BOOKED` or `PENDING` — see the filter in `normalizeSb1`. */
      bookingStatus?: string;
    };
    /**
     * Sorted by `confidence` descending, so the first entry is the best and the
     * rest are discarded. Everything but `main` is typed optional because the
     * bank has never promised it, and a missing key must read as "no
     * subcategory" rather than crash a rebuild.
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

/**
 * Exported because `sync` splits a multi-month response into month directories
 * and has to cut it in exactly the place this reads it. A UTC month boundary
 * would file every row dated the 1st into the previous directory, where
 * `normalizeMonth` would then read it back under the wrong month.
 */
export function osloDate(epochMs: number): string {
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
 * A cleaned description that names nobody: SB1 cleans `Til: <account number>`
 * down to a bare `Til:`. It has to lose to `remoteAccountName`, or the row
 * loses its name *and* its category — `haystackOf` never sees
 * `remoteAccountName`, so no override can reach it.
 *
 * Only the *empty* case: `Til: Ola - Online` is the same wording with a payee
 * still in it, and is the best string on that row.
 */
const NAMES_NOBODY = /^(til|fra)[\s:.-]*$/i;

const named = (s?: string) =>
  s && !NAMES_NOBODY.test(s.trim()) ? s : undefined;

function normalizeSb1(file: Sb1File, names: Record<string, string>): Txn[] {
  return (
    file.transactions
      // A reservation is reissued under a *new* id when it books and its amount
      // can still move, so keeping it is how one purchase becomes two rows.
      // Not a card rule: pending rows land on the deposit accounts too.
      .filter(({ transaction: t }) => t.bookingStatus !== "PENDING")
      .map(({ transaction: t, categories, recurring, subscription }) => ({
        id: t.id,
        accountKey: t.accountKey,
        account: names[t.accountKey] ?? t.accountKey,
        date: osloDate(t.date),
        amount: t.amount,
        // Every exclusion rule and override matches on this, so it has to stay
        // a string. `typeText` is the honest fallback.
        description: t.description ?? t.typeText ?? "",
        // cleanedDescription first: it is the bank's read of the merchant,
        // while remoteAccountName is whatever the payer typed. Unless it names
        // nobody — see NAMES_NOBODY.
        counterparty:
          named(t.cleanedDescription) ?? t.remoteAccountName ?? null,
        // Off the same string, before any rename touches it: a payee renamed to
        // `Yoshinoya` no longer carries the tail the country is written in.
        country: countryOf(named(t.cleanedDescription) ?? ""),
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
 * Flattens every JSON file in a data/raw/<month> directory into Txn[] — one
 * file per account, the credit card included.
 *
 * `names` is account key -> what to call it. A key missing from it keeps the
 * key, so an account not yet in the rules file still reads as something.
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
