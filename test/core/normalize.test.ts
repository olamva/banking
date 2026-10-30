import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeMonth } from "../../src/core/normalize.ts";

async function withMonthDir(
  files: Record<string, unknown>,
  run: (dir: string) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "normalize-test-"));
  try {
    for (const [name, data] of Object.entries(files)) {
      writeFileSync(join(dir, name), JSON.stringify(data));
    }
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("SB1 date formats at Oslo midnight, not UTC", async () => {
  const midnightOslo = Date.UTC(2026, 5, 30, 22, 0, 0);
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "sb1-1",
              accountKey: "acct",
              amount: -100,
              date: midnightOslo,
              description: "raw desc",
              cleanedDescription: "Clean Desc",
              typeText: "VISA Varekjøp",
            },
            categories: [{ main: "dagligvarer" }],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [txn] = await normalizeMonth(dir);
      assert.equal(txn.date, "2026-07-01");
      assert.equal(txn.account, "acct");
      assert.equal(txn.counterparty, "Clean Desc");
      assert.equal(txn.bankCategory, "dagligvarer");
      assert.equal(txn.typeText, "VISA Varekjøp");
    },
  );
});

test("SB1 falls back to remoteAccountName when cleanedDescription is absent", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "sb1-1",
              accountKey: "acct",
              amount: -6100,
              date: Date.UTC(2026, 5, 30, 22, 0, 0),
              typeText: "Betaling med melding",
              remoteAccountName: "Per leie",
            },
            categories: [{ main: "ukategorisert" }],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [txn] = await normalizeMonth(dir);
      assert.equal(txn.description, "Betaling med melding");
      assert.equal(txn.counterparty, "Per leie");
    },
  );
});

test("a cleanedDescription that names nobody loses to remoteAccountName", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "nameless",
              accountKey: "acct",
              amount: -6000,
              date: Date.UTC(2026, 5, 30, 22, 0, 0),
              description: "Til: 1234 56 78901",
              cleanedDescription: "Til:",
              remoteAccountName: "A Named Payee",
              typeText: "Betaling med melding",
            },
            categories: [{ main: "ukategorisert" }],
            recurring: false,
            subscription: false,
          },
          {
            transaction: {
              id: "named",
              accountKey: "acct",
              amount: -300,
              date: Date.UTC(2026, 5, 30, 22, 0, 0),
              description: "Til: Someone - Online",
              cleanedDescription: "Til: Someone - Online",
              remoteAccountName: "Not This One",
              typeText: "Betaling med melding",
            },
            categories: [{ main: "ukategorisert" }],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [nameless, named] = await normalizeMonth(dir);
      assert.equal(nameless!.counterparty, "A Named Payee");
      assert.equal(nameless!.description, "Til: 1234 56 78901");
      assert.equal(named!.counterparty, "Til: Someone - Online");
    },
  );
});

test("an account is named by rules/accounts.json, and by its key when it is not", async () => {
  await withMonthDir(
    {
      "card-key.json": {
        transactions: [
          {
            transaction: {
              id: "card-1",
              accountKey: "card-key",
              amount: -250,
              date: Date.UTC(2026, 6, 14, 22, 0, 0),
              description: "227 SHOP, Oslo, NORWAY",
              cleanedDescription: "SHOP, Oslo, NORWAY",
              typeText: "Transaksjon",
              bookingStatus: "BOOKED",
              remoteAccountNumber: "-1",
            },
            categories: [{ main: "dagligvarer" }],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [txn] = await normalizeMonth(
        dir,
        { "card-key": "Kredittkort" },
        new Set(["card-key"]),
      );
      assert.equal(txn.account, "Kredittkort");
      assert.equal(txn.accountKey, "card-key");
      assert.equal(txn.card, true);
      assert.equal(txn.date, "2026-07-15");
      assert.equal(txn.amount, -250);
      assert.equal(txn.counterparty, "SHOP, Oslo, NORWAY");
      assert.equal(txn.bankCategory, "dagligvarer");
      assert.equal(txn.typeText, "Transaksjon");
      assert.equal(txn.remoteAccountNumber, null);
      assert.equal((await normalizeMonth(dir))[0].account, "card-key");
      assert.equal((await normalizeMonth(dir))[0].card, false);
    },
  );
});

test("pending rows are kept", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "booked",
              accountKey: "acct",
              amount: -66,
              date: Date.UTC(2026, 7, 6, 22, 0, 0),
              description: "d",
              bookingStatus: "BOOKED",
            },
            categories: [],
            recurring: false,
            subscription: false,
          },
          {
            transaction: {
              id: "pending",
              accountKey: "acct",
              amount: -119,
              date: Date.UTC(2026, 7, 8, 22, 0, 0),
              description: "d",
              bookingStatus: "PENDING",
            },
            categories: [],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      assert.deepEqual(
        (await normalizeMonth(dir)).map((t) => [t.id, t.isPending]),
        [
          ["booked", false],
          ["pending", true],
        ],
      );
    },
  );
});

test("a month directory flattens every account file it holds", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "sb1-1",
              accountKey: "acct",
              amount: -42,
              date: Date.UTC(2026, 6, 10, 22, 0, 0),
              description: "d",
              cleanedDescription: "c",
            },
            categories: [{ main: "transport" }],
            recurring: true,
            subscription: true,
          },
        ],
      },
      "card-key.json": {
        transactions: [
          {
            transaction: {
              id: "card-1",
              accountKey: "card-key",
              amount: -10,
              date: Date.UTC(2026, 6, 10, 22, 0, 0),
              description: "SHOP, Oslo, NORWAY",
            },
            categories: [{ main: "dagligvarer" }],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const names = { acct: "Brukskonto", "card-key": "Kredittkort" };
      const txns = (await normalizeMonth(dir, names)).sort((a, b) =>
        a.account.localeCompare(b.account),
      );
      assert.deepEqual(
        txns.map((t) => t.account),
        ["Brukskonto", "Kredittkort"],
      );
      const bank = txns.find((t) => t.account === "Brukskonto")!;
      assert.equal(bank.isRecurring, true);
      assert.equal(bank.isSubscription, true);
    },
  );
});

test("an SB1 row with no description at all falls back to typeText", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "sb1-nodesc",
              accountKey: "acct",
              amount: -2000,
              date: Date.UTC(2024, 7, 25, 22, 0, 0),
              typeText: "Overføring",
            },
            categories: [],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [txn] = await normalizeMonth(dir);
      assert.equal(txn.description, "Overføring");
      assert.equal(txn.counterparty, null);
    },
  );
});

test("the bank subcategory and both i18n names come through, with the confidence", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "sb1-1",
              accountKey: "acct",
              amount: -249,
              date: Date.UTC(2026, 5, 30, 22, 0, 0),
              cleanedDescription: "Apotek 1",
              typeText: "VISA Varekjøp",
            },
            categories: [
              {
                confidence: 100,
                main: "helse_og_velvaere",
                mainI18n: "Helse og velvære",
                sub: "apotek",
                subI18n: "Apotek",
              },
              {
                confidence: 41,
                main: "ukategorisert",
                mainI18n: "Ukategorisert",
                sub: "annet",
                subI18n: "Ukategorisert",
              },
            ],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [txn] = await normalizeMonth(dir);
      assert.equal(txn!.bankCategory, "helse_og_velvaere");
      assert.equal(txn!.bankSub, "apotek");
      assert.equal(txn!.bankCategoryName, "Helse og velvære");
      assert.equal(txn!.bankSubName, "Apotek");
      assert.equal(txn!.bankConfidence, 100);
    },
  );
});

test("a category with no sub reads as no sub, rather than crashing the rebuild", async () => {
  await withMonthDir(
    {
      "acct.json": {
        transactions: [
          {
            transaction: {
              id: "sb1-1",
              accountKey: "acct",
              amount: -100,
              date: Date.UTC(2026, 5, 30, 22, 0, 0),
              cleanedDescription: "Something",
              typeText: "VISA Varekjøp",
            },
            categories: [{ main: "dagligvarer" }],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [txn] = await normalizeMonth(dir);
      assert.equal(txn!.bankCategory, "dagligvarer");
      assert.equal(txn!.bankSub, null);
      assert.equal(txn!.bankCategoryName, null);
      assert.equal(txn!.bankSubName, null);
      assert.equal(txn!.bankConfidence, null);
    },
  );
});

test("the country reads through the terminal number that SB1 strips", async () => {
  await withMonthDir(
    {
      "card.json": {
        transactions: [
          {
            transaction: {
              id: "a",
              accountKey: "card",
              amount: -120,
              date: Date.UTC(2026, 6, 14, 22, 0, 0),
              description: "Espresso House 808, Oslo, NORWAY",
              cleanedDescription: "Espresso House Oslo, NORWAY",
              typeText: "Transaksjon",
            },
            categories: [],
            recurring: false,
            subscription: false,
          },
          {
            transaction: {
              id: "b",
              accountKey: "card",
              amount: -300,
              date: Date.UTC(2026, 6, 14, 22, 0, 0),
              description: "Telenor Norge AS, Mobil",
              cleanedDescription: "Telenor Norge AS, Mobil",
              typeText: "Avtalegiro",
              currencyCode: "NOK",
            },
            categories: [],
            recurring: true,
            subscription: true,
          },
          {
            transaction: {
              id: "c",
              accountKey: "card",
              amount: -80,
              date: Date.UTC(2026, 6, 14, 22, 0, 0),
              description: "GOTTEBITEN MORA",
              cleanedDescription: "Gottebiten Mora",
              typeText: "Transaksjon",
              currencyCode: "SEK",
            },
            categories: [],
            recurring: false,
            subscription: false,
          },
        ],
      },
    },
    async (dir) => {
      const [card, giro, abroad] = await normalizeMonth(dir);
      assert.equal(card!.country, "Norway");
      assert.equal(giro!.country, "Norway");
      assert.equal(abroad!.country, null);
    },
  );
});
