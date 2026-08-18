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
      description?: string;
      cleanedDescription?: string;
      remoteAccountName?: string;
      remoteAccountNumber?: string;
      typeText?: string;
      bookingStatus?: string;
    };
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

export function osloDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
}

const NO_ACCOUNT = "-1";

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
        description: t.description ?? t.typeText ?? "",
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
