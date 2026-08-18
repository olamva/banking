import assert from "node:assert/strict";
import { test } from "node:test";
import { exclude } from "../../src/core/exclude.ts";
import type { Txn } from "../../src/core/types.ts";

function txn(overrides: Partial<Txn>): Txn {
  return {
    id: "1",
    account: "Brukskonto",
    accountKey: "a",
    date: "2026-07-01",
    amount: -100,
    description: "Rema 1000",
    counterparty: "Rema 1000",
    country: null,
    bankCategory: "dagligvarer",
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
    ...overrides,
  };
}

const accounts = {
  a: { mine: true },
  b: { mine: true },
  c: { mine: false },
  card: { mine: false, card: true },
  issuer: { mine: false, issuer: true, number: "99", sync: false },
};

const leg = (over: Partial<Txn>) => txn({ typeText: "Overføring", ...over });

test("flags both sides of an internal transfer", () => {
  const out = exclude(
    [
      leg({ id: "1", accountKey: "a", amount: -500, date: "2026-07-01" }),
      leg({
        id: "2",
        accountKey: "b",
        amount: 500,
        date: "2026-07-01",
        typeText: "Overførsel mellom egne kontoer",
      }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, "internal transfer");
  assert.equal(out[1].excluded, true);
  assert.equal(out[1].reason, "internal transfer");
});

test("does not flag a transfer touching a non-mine account", () => {
  const out = exclude(
    [
      leg({ id: "1", accountKey: "a", amount: -500, date: "2026-07-01" }),
      leg({ id: "2", accountKey: "c", amount: 500, date: "2026-07-01" }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, false);
  assert.equal(out[0].reason, null);
});

test("a purchase that happens to match an unrelated credit is not a transfer", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -22,
        date: "2024-04-30",
        description: "CRV*Zettle*Kafe",
      }),
      txn({
        id: "2",
        accountKey: "b",
        amount: 22,
        date: "2024-04-30",
        description: "INNSKUDDSRENTE",
        typeText: "Kreditrente",
      }),
    ],
    accounts,
  );
  assert.deepEqual(
    out.map((t) => t.excluded),
    [false, false],
  );
});

test("a transfer-typed row needs a transfer-typed counterpart, not just any match", () => {
  const out = exclude(
    [
      leg({ id: "1", accountKey: "a", amount: -2000, date: "2024-06-03" }),
      txn({
        id: "2",
        accountKey: "b",
        amount: 2000,
        date: "2024-06-03",
        typeText: "Straksbetaling",
      }),
    ],
    accounts,
  );
  assert.deepEqual(
    out.map((t) => t.excluded),
    [false, false],
  );
});

test("does not flag an ordinary purchase with no counterpart", () => {
  const out = exclude(
    [txn({ id: "1", accountKey: "a", amount: -300 })],
    accounts,
  );
  assert.equal(out[0].excluded, false);
  assert.equal(out[0].reason, null);
});

test("flags a Kredittbanken bill payment by description", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -5738,
        description: "Kredittbanken ASA",
      }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, "credit card bill payment");
});

test("flags the bill payment the issuer books under its other name", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -2493,
        description: "Kredittbanken - del av SpareBank 1",
      }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, "credit card bill payment");
});

test("flags a bill paid by hand, where the description names the channel and no payee", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        amount: -4940.53,
        description: "Mobilgiro m/KID, forfall i dag",
        typeText: "MobilGiro m/KID til forfall i dag",
        remoteAccountNumber: "99",
      }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, "credit card bill payment");
});

test("both legs of a bill payment are flagged, so the pair nets to zero", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -1629.11,
        date: "2026-03-31",
        description: "Kredittbanken ASA",
      }),
      txn({
        id: "2",
        account: "Kredittkort",
        accountKey: "card",
        amount: 1629.11,
        date: "2026-04-01",
        description: "Innbetaling",
        counterparty: "Innbetaling",
        typeText: "Transaksjon",
      }),
    ],
    accounts,
  );
  assert.equal(out[0].reason, "credit card bill payment");
  assert.equal(out[1].reason, "credit card bill payment (card side)");
  assert.equal(
    out.reduce((sum, t) => sum + (t.excluded ? t.amount : 0), 0),
    0,
  );
});

test("a card credit that is not a payment stays in — a refund, or cashback", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        account: "Kredittkort",
        accountKey: "card",
        amount: 2395,
        description: "KAFFEBAR, Oslo, NORWAY",
        typeText: "Transaksjon",
      }),
      txn({
        id: "2",
        account: "Kredittkort",
        accountKey: "card",
        amount: 39,
        description: "Rabatt strømmetjenester",
        typeText: "Transaksjon",
      }),
    ],
    accounts,
  );
  assert.deepEqual(
    out.map((t) => t.excluded),
    [false, false],
  );
});

test("a card row is never a transfer leg, however well its amount lines up", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -500,
        date: "2026-07-01",
        typeText: "Overførsel mellom egne kontoer",
      }),
      txn({
        id: "2",
        account: "Kredittkort",
        accountKey: "card",
        amount: 500,
        date: "2026-07-01",
        description: "KAFFEBAR, Oslo, NORWAY",
        typeText: "Transaksjon",
      }),
      txn({
        id: "3",
        account: "Kredittkort",
        accountKey: "card",
        amount: 500,
        date: "2026-07-01",
        description: "SHOP, Oslo, NORWAY",
        typeText: "Kredittkort",
      }),
    ],
    accounts,
  );
  assert.deepEqual(
    out.map((t) => t.excluded),
    [false, false, false],
  );
});

const numbered = {
  a: { mine: true, number: "39910000001" },
  b: { mine: true, number: "39910000002" },
  c: { mine: false, number: "39910000003" },
};

test("flags a self-transfer the bank did not type as a transfer", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -5572,
        typeText: "Betaling med melding",
        remoteAccountNumber: "39910000002",
      }),
      txn({
        id: "2",
        accountKey: "b",
        amount: 5572,
        typeText: "NettGiro m/melding med forfall i dag",
        remoteAccountNumber: "39910000001",
      }),
    ],
    numbered,
  );
  assert.deepEqual(
    out.map((t) => t.reason),
    ["internal transfer", "internal transfer"],
  );
  assert.equal(
    out.reduce((sum, t) => sum + (t.excluded ? t.amount : 0), 0),
    0,
  );
});

test("a payment to someone else stays in, however it is typed", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -5572,
        typeText: "Betaling med melding",
        remoteAccountNumber: "39910000003",
      }),
    ],
    numbered,
  );
  assert.equal(out[0].excluded, false);
});

test("flags a transfer to an account of mine whose other leg is not in the data", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: 490.94,
        typeText: "Overførsel mellom egne kontoer",
        remoteAccountNumber: "39910000009",
      }),
    ],
    { ...numbered, ask: { mine: true, number: "39910000009" } },
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, "internal transfer");
});

test("money crossing the fund manager is neither spending nor income", () => {
  const funds = {
    ...numbered,
    fund: { mine: false, number: "47500000001", investment: true, sync: false },
  };
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -1000,
        description: "Kjøp av Fond",
        typeText: "Overførsel",
        remoteAccountNumber: "47500000001",
      }),
      txn({
        id: "2",
        accountKey: "b",
        amount: 1215.42,
        description: "Sparebank 1 Forvaltning AS",
        typeText: "Overførsel",
        remoteAccountNumber: "47500000001",
      }),
    ],
    funds,
  );
  assert.deepEqual(
    out.map((t) => t.reason),
    ["investment movement", "investment movement"],
  );
});

test("a row naming its own account is not a transfer", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: 33,
        description: "Innskotsautomat",
        typeText: "Innskudd automat",
        remoteAccountNumber: "39910000001",
      }),
    ],
    numbered,
  );
  assert.equal(out[0].excluded, false);
});

test("a purchase from an account that is not the fund manager is untouched", () => {
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: -1000,
        remoteAccountNumber: "39910000003",
      }),
    ],
    {
      ...numbered,
      fund: {
        mine: false,
        number: "47500000001",
        investment: true,
        sync: false,
      },
    },
  );
  assert.equal(out[0].excluded, false);
});

test("an account with no number falls back to the amount+date rule", () => {
  const out = exclude(
    [
      leg({ id: "1", accountKey: "a", amount: -500 }),
      leg({ id: "2", accountKey: "b", amount: 500 }),
    ],
    { a: { mine: true }, b: { mine: true } },
  );
  assert.deepEqual(
    out.map((t) => t.reason),
    ["internal transfer", "internal transfer"],
  );
});

test("a cash deposit is income, whichever of my accounts the machine stamped", () => {
  const numbered = {
    a: { mine: true, number: "11" },
    b: { mine: true, number: "22" },
  };
  const out = exclude(
    [
      txn({
        id: "1",
        accountKey: "a",
        amount: 27950,
        typeText: "Innskudd automat",
        remoteAccountNumber: "22",
      }),
      txn({
        id: "2",
        accountKey: "a",
        amount: 4800,
        typeText: "Innskudd automat",
        remoteAccountNumber: "11",
      }),
      txn({
        id: "3",
        accountKey: "b",
        amount: 219,
        typeText: "Kontantinnskudd",
        remoteAccountNumber: "11",
      }),
    ],
    numbered,
  );
  assert.deepEqual(
    out.map((r) => r.excluded),
    [false, false, false],
  );
});

test("one counterpart pairs with one leg, not with every leg of that amount", () => {
  const out = exclude(
    [
      leg({ id: "1", accountKey: "a", amount: 200, date: "2026-07-01" }),
      leg({ id: "2", accountKey: "a", amount: 200, date: "2026-07-01" }),
      leg({ id: "3", accountKey: "b", amount: -200, date: "2026-07-01" }),
    ],
    accounts,
  );
  const flagged = out.filter((r) => r.excluded);
  assert.equal(flagged.length, 2, "exactly one pair, not all three rows");
  assert.equal(
    flagged.reduce((n, r) => n + r.amount, 0),
    0,
  );
  assert.equal(out.filter((r) => !r.excluded).length, 1);
});

test("a transfer still needs its counterpart on a different account", () => {
  const out = exclude(
    [
      leg({ id: "1", accountKey: "a", amount: 300, date: "2026-07-01" }),
      leg({ id: "2", accountKey: "a", amount: -300, date: "2026-07-01" }),
    ],
    accounts,
  );
  assert.deepEqual(
    out.map((r) => r.excluded),
    [false, false],
  );
});
