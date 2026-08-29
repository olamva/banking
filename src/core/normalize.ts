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
      // Epoch milliseconds at Oslo midnight. Do not format this value as UTC.
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
      // SB1 gives a reservation a new id when it books. The amount can also change.
      // A kept reservation becomes a second row. Deposit accounts also send these.
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
        // Read the country off the raw description. SB1 strips the terminal
        // number out of cleanedDescription, and the first comma goes with it.
        // "SHOP 808, Oslo, NORWAY" arrives there as "SHOP Oslo, NORWAY".
        country: countryOf(t.description ?? ""),
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
