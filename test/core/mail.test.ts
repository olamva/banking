import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "mail-"));
process.env.DATA_DIR = join(dir, "data");
process.env.RULES_DIR = join(dir, "rules");
process.env.DB_FILE = join(dir, "banking.db");
after(() => rmSync(dir, { recursive: true, force: true }));
const { rebuildAll } = await import("../../src/core/pipeline.ts");
const { openDb, queryRange } = await import("../../src/core/db.ts");
const { purchasesOf } = await import("../../src/core/items.ts");

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

const mail = (name: string, from: string, date: string, rows: string[]) =>
  put(
    `data/raw/receipts/gmail/${name}.eml`,
    [
      `From: ${from}`,
      "Subject: Your receipt",
      `Date: ${date} 10:00:00 +0200`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      rows.join(""),
    ].join("\r\n"),
  );

let rows: ReturnType<typeof queryRange> = [];

before(async () => {
  put("rules/accounts.json", { a: { mine: true, name: "Daily" } });
  put("data/raw/2026-10/a.json", {
    transactions: [
      bank("power", "2026-10-03", -1176.5, "POWER TRONDHEIM"),
      bank("ticket", "2026-10-04", -450, "BILLETTEN.NO"),
      bank("steam", "2026-10-05", -145, "STEAMPOWERED.COM"),
      bank("paypal", "2026-10-06", -90.24, "PAYPAL *LACHYW02"),
      bank("claude", "2026-10-07", -229, "ANTHROPIC"),
      bank("apple", "2026-10-08", -1299, "APPLE.COM/BILL"),
    ],
  });
  mail("power", "POWER Norge <noreply@power.no>", "2 Oct 2026", [
    "<table>",
    "<tr><td>Produkt</td><td>Antall</td><td>Sum</td></tr>",
    "<tr><td>KULZ VANNKOKER, SVART</td><td>1</td><td>kr 199,00</td></tr>",
    "<tr><td>EMV Power Norge</td><td></td><td>-kr 99,50</td></tr>",
    "<tr><td>POINT BRØDRISTER</td><td>2</td><td>kr 998,00</td></tr>",
    "<tr><td>Delsum</td><td>kr 1&nbsp;097,50</td></tr>",
    "<tr><td>Frakt:</td><td>kr 79,00</td></tr>",
    "<tr><td>Total</td><td>kr 1&nbsp;176,50</td></tr>",
    "<tr><td>Visa</td><td>kr 1&nbsp;176,50</td></tr>",
    "</table>",
  ]);
  mail("ticket", "Billetten <kvittering@billetten.no>", "4 Oct 2026", [
    "<p>Kvittering</p><div>Konsert: Sondre Justad</div><div>kr 450,00</div>",
  ]);
  mail("steam", "Steam <noreply@steampowered.com>", "5 Oct 2026", [
    "<table><tr><td>Valheim</td>",
    "<td>Subtotal (excl. VAT): 116,00 kr<br>VAT at 25%: 29,00 kr<br>Total: 145,00 kr</td></tr>",
    "<tr><td>Visa:</td><td>145,00 kr</td></tr></table>",
  ]);
  mail("paypal", "PayPal <service@paypal.no>", "6 Oct 2026", [
    "<table>",
    "<tr><td>Tip - Thanks for tipping!</td><td>$9,00 USD</td><td>1</td><td>$9,00 USD</td></tr>",
    "<tr><td>Totalt</td><td>$9,00 USD</td></tr>",
    "<tr><td>Fra:</td><td>90,24 NOK</td></tr>",
    "</table>",
  ]);
  mail("claude", "Anthropic, PBC <invoice@anthropic.com>", "7 Oct 2026", [
    "<table>",
    "<tr><td>Claude Pro</td><td>183,20 kr</td></tr>",
    "<tr><td>Subtotal</td><td>183,20 kr</td></tr>",
    "<tr><td>VAT (25%)</td><td>45,80 kr</td></tr>",
    "<tr><td>Total</td><td>229,00 kr</td></tr>",
    "</table>",
  ]);
  mail("apple", "Apple <no_reply@email.apple.com>", "8 Oct 2026", [
    "<table><tr><td>Total</td><td>kr&nbsp;1&nbsp;299,00</td></tr></table>",
  ]);
  await rebuildAll();
  const db = openDb(process.env.DB_FILE!);
  rows = queryRange(db, "0000-00", "9999-99");
  db.close();
});

const receipt = (id: string) => {
  const r = rows.find((t) => t.id === id)!.receipt!;
  return {
    lines: r.lines.map((l) => [l.name, l.qty, l.price, l.amount]),
    total: r.total,
    currency: r.currency,
  };
};

test("a mail receipt lists the item rows that add up to its total", () => {
  assert.deepEqual(receipt("power"), {
    lines: [
      ["KULZ VANNKOKER, SVART", 1, 199, 199],
      ["EMV Power Norge", 1, -99.5, -99.5],
      ["POINT BRØDRISTER", 2, 499, 998],
      ["Frakt", 1, 79, 79],
    ],
    total: 1176.5,
    currency: undefined,
  });
});

test("a mail without a total row lists the item that adds up to the card charge", () => {
  assert.deepEqual(receipt("ticket").lines, [
    ["Konsert: Sondre Justad", 1, 450, 450],
  ]);
});

test("a mail that prints one item beside the total gives that item the total", () => {
  assert.deepEqual(receipt("steam").lines, [["Valheim", 1, 145, 145]]);
});

test("a mail receipt prints its fees and VAT, but Items leaves them out", () => {
  assert.deepEqual(receipt("claude").lines, [
    ["Claude Pro", 1, 183.2, 183.2],
    ["VAT (25%)", 1, 45.8, 45.8],
  ]);
  assert.deepEqual(
    purchasesOf(rows.filter((t) => t.id === "power" || t.id === "claude")).map(
      (p) => p.raw,
    ),
    ["KULZ VANNKOKER, SVART", "POINT BRØDRISTER", "Claude Pro"],
  );
});

test("a mail in another currency keeps its own total and currency", () => {
  assert.deepEqual(receipt("paypal"), {
    lines: [["Tip - Thanks for tipping!", 1, 9, 9]],
    total: 9,
    currency: "USD",
  });
});

test("a mail whose rows do not add up shows no items", () => {
  assert.deepEqual(receipt("apple").lines, []);
});
