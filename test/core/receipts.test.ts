import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "receipts-"));
process.env.DATA_DIR = join(dir, "data");
process.env.RULES_DIR = join(dir, "rules");
process.env.DB_FILE = join(dir, "banking.db");
after(() => rmSync(dir, { recursive: true, force: true }));
const { rebuildAll } = await import("../../src/core/pipeline.ts");
const { openDb, queryRange } = await import("../../src/core/db.ts");

const put = (path: string, value: unknown) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(
    join(dir, path),
    typeof value === "string" ? value : JSON.stringify(value),
  );
};

const bank = (
  id: string,
  date: string,
  amount: number,
  description: string,
) => ({
  transaction: {
    id,
    accountKey: "a",
    amount,
    description,
    date: Date.parse(`${date}T00:00:00+02:00`),
    typeText: "VISA Varekjøp",
  },
  categories: [],
});

const item = (prodtxt1: string, pieces: number, amount: number) => ({
  prodtxt1,
  pieces,
  amount,
  amountWithoutDeposit: amount,
  unitPrice: amount,
  discount: 0,
  unit: "EA",
  volume: 1,
});

const mail = (from: string, date: string, html: string) =>
  [
    `From: ${from}`,
    "Subject: Your receipt",
    `Date: ${date}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");

const errors = mock.method(console, "error", () => {});
let rows: ReturnType<typeof queryRange> = [];

before(async () => {
  put("rules/accounts.json", { a: { mine: true, name: "Daily" } });
  put("data/raw/2026-08/a.json", {
    transactions: [
      bank("apple-1", "2026-08-02", -1299, "APPLE.COM/BILL"),
      bank("apple-2", "2026-08-05", -1299, "APPLE.COM/BILL"),
    ],
  });
  put("data/raw/2026-09/a.json", {
    transactions: [
      bank("rema", "2026-09-06", -180, "REMA 1000 MOHOLT"),
      bank("coop", "2026-09-05", -180, "COOP EXTRA MOHOLT"),
      bank("kiwi", "2026-09-07", -268.41, "KIWI 505 MOHOLT"),
      bank("twitch", "2026-09-03", -59, "TWITCH"),
      bank("extra", "2026-09-01", -296.6, "EXTRA ELGESETER, TRONDHEIM"),
      bank("rema-split", "2026-09-12", -650.19, "REMA 1000 MOHOLT"),
    ],
  });
  put("data/raw/receipts/coop/A0-coop-1.json", {
    period: { year: 2026, month: 9 },
    head: { summaryId: "A0:/coop-1" },
    details: {
      summary: {
        summaryId: "A0:/coop-1",
        storeName: "Extra Elgeseter",
        dateTime: "1. September 00:30",
        totalSum: "296,60",
        lines: [
          {
            quantity: "4 stk",
            name: "COOP KJØTTDEIG 14% 400G",
            discount: "110,21",
            price: "199,79",
          },
          {
            quantity: "0,456 kg",
            name: "BANANER",
            discount: null,
            price: "96,81",
          },
        ],
      },
    },
  });
  put("data/raw/receipts/rema/2.json", {
    head: {
      id: 2,
      purchaseDate: Date.parse("2026-09-11T12:00:00+02:00"),
      storeName: "REMA 1000 MOHOLT",
      amount: 850.19,
      transactionPayments: [
        { amount: 0, meansOfPaymentDesc: "Rounding" },
        { amount: 200, meansOfPaymentDesc: "CreditDebit" },
        { amount: 650.19, meansOfPaymentDesc: "CreditDebit" },
      ],
    },
    receipt: { rows: [item("Kaffe", 1, 850.19)] },
  });
  put("data/raw/receipts/rema/1.json", {
    head: {
      id: 1,
      purchaseDate: Date.parse("2026-09-05T12:00:00+02:00"),
      storeName: "REMA 1000 MOHOLT",
      amount: 200,
      transactionPayments: [
        { amount: 0, meansOfPaymentDesc: "Rounding" },
        { amount: 180, meansOfPaymentDesc: "CreditDebit" },
        { amount: 20, meansOfPaymentDesc: "Coupon" },
      ],
    },
    receipt: {
      rows: [
        item("Tine Lettmelk 0.5% 1L", 2, 35),
        item("Nudler M/kjøttsmak 85G Mr.lee", 1, 6),
        item("Mack Isbjørn Lite 0,5LX6 BX", 1, 120),
        item("Schous Pilsner 0.33", 1, 25),
        {
          ...item("Stange Gårdsegg 10 M/l/xl", 1, 4),
          prodtxt2: "Stange 530 G",
        },
        {
          ...item("Isbjørn Lite Glutenfri Fridepack", 1, 1),
          prodtxt2: "Mack 4,5% 0,33X10b",
        },
        {
          ...item("", 1, 10),
          productDescription: "KJØTTDEIG 14% 400G PRIMA LAVPRIS",
        },
        {
          ...item("Oreo Rull Dobbel 157G", 2, 39.84),
          unitPrice: 49.8,
          discount: -9.96,
          usedOffers: [{ offerDesc: "Oreo", discount: 9.96 }],
        },
        {
          ...item("Paprika Rød Løsvekt", 1, 10.39),
          prodtxt2: "Kilo",
          unit: "Kg",
          volume: 0.17,
          unitPrice: 67.9,
          discount: -1.15,
        },
        {
          ...item("Tuborg Lite 0.50L", 1, 37.4),
          amountWithoutDeposit: 35.4,
        },
      ],
    },
  });
  put("data/raw/receipts/rema/broken.json", "{");
  put("data/raw/receipts/trumf/no-time.json", {
    purchase: {
      batchId: "no-time",
      belop: 59,
      beskrivelse: "Joker Nardo",
      transaksjonsTidspunkt: "",
    },
    receipt: { varelinjer: [] },
  });
  put("data/raw/receipts/trumf/b-1.json", {
    purchase: {
      batchId: "b-1",
      belop: 268.41,
      beskrivelse: "KIWI 505 Moholt",
      transaksjonsTidspunkt: "2026-09-05T10:00:00.000Z",
    },
    receipt: {
      varelinjer: [
        { produktBeskrivelse: "Bananer", antall: 1, belop: 168.41 },
        {
          produktBeskrivelse: "KYLLING VINGEKLUBBER 700G",
          antall: 2,
          belop: 100,
          enhetsType: "EA",
          besparelser: [{ beskrivelse: "GODT TIL MIDDAG", belop: 20 }],
        },
      ],
    },
  });
  put(
    "data/raw/receipts/gmail/apple.eml",
    mail(
      "Apple <no_reply@email.apple.com>",
      "1 Aug 2026 10:00:00 +0200",
      "<table><tr><td>Total</td><td>kr&nbsp;1&nbsp;299,00</td></tr></table>",
    ),
  );
  put(
    "data/raw/receipts/gmail/order.eml",
    mail(
      "Twitch <no-reply@twitch.tv>",
      "2 Sep 2026 10:00:00 +0200",
      "<p>Total: 59.00 NOK</p>",
    ),
  );
  put(
    "data/raw/receipts/gmail/later.eml",
    mail(
      "Twitch <no-reply@twitch.tv>",
      "5 Sep 2026 10:00:00 +0200",
      "<p>Paid 59,00</p>",
    ),
  );
  await rebuildAll();
  const db = openDb(process.env.DB_FILE!);
  rows = queryRange(db, "0000-00", "9999-99");
  db.close();
});

const receiptOf = (id: string) => {
  const r = rows.find((t) => t.id === id)!.receipt;
  return r && `${r.source}/${r.id}`;
};

test("a store receipt reaches its card row, not a same-priced row at another shop", () => {
  assert.equal(
    receiptOf("rema"),
    "rema/1",
    "the coupon part is not charged to the card",
  );
  assert.equal(receiptOf("coop"), undefined);
  assert.equal(receiptOf("kiwi"), "trumf/b-1");
  assert.equal(
    receiptOf("rema-split"),
    "rema/2",
    "one card payment of a split payment",
  );
});

test("a receipt line keeps the pack size apart from the product name", () => {
  assert.deepEqual(
    rows
      .find((t) => t.id === "rema")!
      .receipt!.lines.map(({ name, size }) => [name, size]),
    [
      ["Tine Lettmelk 0.5%", "1 l"],
      ["Nudler M/kjøttsmak Mr.lee", "85 g"],
      ["Mack Isbjørn Lite", "0,5 l × 6"],
      ["Schous Pilsner", "0,33 l"],
      ["Stange Gårdsegg 10 M/l/xl", "530 g"],
      ["Isbjørn Lite Glutenfri Fridepack", "0,33 l × 10"],
      ["KJØTTDEIG 14% PRIMA LAVPRIS", "400 g"],
      ["Oreo Rull Dobbel", "157 g"],
      ["Paprika Rød Løsvekt", undefined],
      ["Tuborg Lite", "0,50 l"],
    ],
  );
});

test("a receipt keeps the unit prices, offers, deposits and payments the slip prints", () => {
  const receipt = rows.find((t) => t.id === "rema")!.receipt!;
  const line = (name: string) => {
    const { qty, unit, price, amount, discounts, deposit } = receipt.lines.find(
      (l) => l.name === name,
    )!;
    return { qty, unit, price, amount, discounts, deposit };
  };
  assert.deepEqual(line("Oreo Rull Dobbel"), {
    qty: 2,
    unit: undefined,
    price: 24.9,
    amount: 39.84,
    discounts: [{ label: "Oreo", amount: 9.96 }],
    deposit: undefined,
  });
  assert.deepEqual(line("Paprika Rød Løsvekt"), {
    qty: 0.17,
    unit: "kg",
    price: 67.9,
    amount: 10.39,
    discounts: [{ label: "", amount: 1.15 }],
    deposit: undefined,
  });
  assert.deepEqual(line("Tuborg Lite"), {
    qty: 1,
    unit: undefined,
    price: 35.4,
    amount: 37.4,
    discounts: undefined,
    deposit: 2,
  });
  assert.deepEqual(
    rows
      .find((t) => t.id === "kiwi")!
      .receipt!.lines.find((l) => l.name === "KYLLING VINGEKLUBBER"),
    {
      name: "KYLLING VINGEKLUBBER",
      size: "700 g",
      qty: 2,
      price: 60,
      amount: 100,
      discounts: [{ label: "GODT TIL MIDDAG", amount: 20 }],
    },
  );
  assert.equal(receipt.total, 200);
  assert.deepEqual(receipt.payments, [
    { label: "Bankkort", amount: 180 },
    { label: "Kupong", amount: 20 },
  ]);
});

test("each mail goes to one bank row, and each row takes the closest mail", () => {
  assert.equal(receiptOf("apple-1"), "gmail/apple");
  assert.equal(
    receiptOf("apple-2"),
    undefined,
    "one mail never covers two charges",
  );
  assert.equal(receiptOf("twitch"), "gmail/order");
  assert.equal(rows.find((t) => t.id === "apple-1")!.receipt!.store, "Apple");
});

test("a Coop receipt dated just after Oslo midnight reaches that day's card row", () => {
  assert.equal(receiptOf("extra"), "coop/A0:/coop-1");
  const receipt = rows.find((t) => t.id === "extra")!.receipt!;
  assert.equal(
    new Date(receipt.at).toLocaleString("sv", { timeZone: "Europe/Oslo" }),
    "2026-09-01 00:30:00",
  );
  assert.deepEqual(receipt.lines, [
    {
      name: "COOP KJØTTDEIG 14%",
      size: "400 g",
      qty: 4,
      price: 77.5,
      amount: 199.79,
      discounts: [{ label: "", amount: 110.21 }],
    },
    { name: "BANANER", qty: 0.456, unit: "kg", price: 212.3, amount: 96.81 },
  ]);
  assert.equal(receipt.total, 296.6);
});

test("a broken or undated receipt file leaves the rest of the rebuild intact", () => {
  assert.equal(rows.length, 8);
  assert.ok(
    errors.mock.calls.some((c) =>
      String(c.arguments[0]).includes("broken.json"),
    ),
  );
});
