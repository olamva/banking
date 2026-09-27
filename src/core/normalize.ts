import { readdir, readFile } from "node:fs/promises";
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
      currencyCode?: string;
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

const oslo = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" });

export function osloDate(epochMs: number): string {
  return oslo.format(epochMs);
}

const NO_ACCOUNT = "-1";

const NAMES_NOBODY = /^(til|fra)[\s:.-]*$/i;

const named = (s?: string) =>
  s && !NAMES_NOBODY.test(s.trim()) ? s : undefined;

function normalizeSb1(
  file: Sb1File,
  names: Record<string, string>,
  cards: ReadonlySet<string>,
): Txn[] {
  return file.transactions.map(
    ({ transaction: t, categories, recurring, subscription }) => ({
      id: t.id,
      accountKey: t.accountKey,
      account: names[t.accountKey] ?? t.accountKey,
      card: cards.has(t.accountKey),
      date: osloDate(t.date),
      amount: t.amount,
      description: t.description ?? t.typeText ?? "",
      counterparty: named(t.cleanedDescription) ?? t.remoteAccountName ?? null,
      // Read the country off the raw description. SB1 strips the terminal
      // number out of cleanedDescription, and the first comma goes with it.
      // "SHOP 808, Oslo, NORWAY" arrives there as "SHOP Oslo, NORWAY".
      country: countryOf(t.description ?? "", t.currencyCode),
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
      isPending: t.bookingStatus === "PENDING",
      isRecurring: recurring,
      isSubscription: subscription,
    }),
  );
}

export async function normalizeMonth(
  dir: string,
  names: Record<string, string> = {},
  cards: ReadonlySet<string> = new Set(),
): Promise<Txn[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const bodies = await Promise.all(
    files.map((f) => readFile(join(dir, f), "utf8")),
  );
  return bodies.flatMap((b) => normalizeSb1(JSON.parse(b), names, cards));
}
